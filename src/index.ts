import * as http from 'http';
import * as https from 'https';
import * as httpProxy from 'http-proxy';
import type { Socket } from 'net';
import { spawn as rawSpawn, SpawnOptions } from 'child_process';
import * as path from 'path';
import { URL } from 'url';
import { createSNICallback } from './sni';
import { updateDigitalOceanDNSRecord } from './ddns';
import { wildcard } from './wildcard';

const REQUEST_TIMEOUT = 10000;
const MAX_CONNECTIONS = 30;

type Domain = {
  name: string;
} & ({
  target: string;
} | {
  redirectTo: string;
});

type Config = {
  domains: Domain[];
};

export const startProxyServer = async (config: Config) => {
  const connections: Array<{ createdAt: number; socket: Socket }> = [];
  const proxy = httpProxy.createProxyServer({
    ws: true,
    changeOrigin: false,
    secure: false,
    autoRewrite: true,
    proxyTimeout: 10000,
    timeout: 10000,
  });

  proxy.on('error', function (error, _req, res) {
    if (!('headersSent' in res) || !res.headersSent) {
      if ('writeHead' in res) {
        res.writeHead(500, {
          'content-type': 'application/json'
        });
      }
    }

    res.end(JSON.stringify(error));
    console.log('Proxy error:', error);
    res.destroy();
  });

  const httpsOptions = {
    SNICallback: await createSNICallback(config),
  };

  await new Promise<void>((resolve, reject) => {
    https.createServer(httpsOptions, function (client_req, client_res) {
      const url = new URL(
        client_req.url,
        `https://${client_req.headers.host}`,
      );

      const domain = config.domains.find((domain_) => {
        return wildcard(url.hostname, domain_.name);
      });

      if (!domain) {
        client_res.statusCode = 404;
        client_res.end('Domain not found');
      } else if ('redirectTo' in domain) {
        client_res.writeHead(301, { 'Location': 'https://' + domain.redirectTo });
        client_res.end();
      } else {
        const [hostname, port] = domain.target.split(':');
        const options: http.RequestOptions = {
          hostname,
          port: port ? parseInt(port) : 80,
          path: client_req.url,
          method: client_req.method,
          headers: {
            ...client_req.headers,
            'X-Forwarded-For': client_req.socket.remoteAddress,
            'X-Forwarded-Host': client_req.headers.host,
            'X-Forwarded-Proto': 'https',
          },
        };

        const proxy_req = http.request(options, (proxy_res) => {
          client_res.writeHead(proxy_res.statusCode, proxy_res.headers);

          proxy_res.pipe(client_res, {
            end: true,
          });
        });

        client_req.pipe(proxy_req, {
          end: true,
        });

        proxy_req.on('error', (error) => {
          console.error('Proxy request error:', error);

          if (!client_res.headersSent) {
            client_res.writeHead(502);
            client_res.end('Bad Gateway');
          }
        });

        proxy_req.setTimeout(REQUEST_TIMEOUT, () => {
          proxy_req.destroy(new Error('Request timed out'));
        });
      }
    }).on('connection', (socket) => {
      const connection = {
        createdAt: Date.now(),
        socket,
      };

      connections.push(connection);

      if (connections.length > MAX_CONNECTIONS) {
        console.warn('New connection. Active connections:', connections.length, '. Oldest active for:', (Date.now() - connections[0].createdAt) / 1000, ' secs');
      }

      socket.on('close', () => {
        connections.splice(connections.indexOf(socket), 1);
      });
    }).on('upgrade', async (req: http.IncomingMessage, socket: Socket, head) => {
      console.log('Http upgrade event from:', req.url);

      const destroy = (str: string = 'HTTP/1.1 400 Bad Request\r\n\r\n') => (error: Error) => {
        if (error) console.error(error);
        socket.write(str);
        socket.destroy();
      };

      socket.setTimeout(10000);
      socket.on('timeout', destroy('HTTP/1.1 408 Request Timeout\r\n\r\n'));
      socket.on('error', destroy());

      try {
        if (req.headers['upgrade'] !== 'websocket') {
          throw new Error('Not a websocket upgrade request');
        }

        if (!req.headers?.host) {
          throw new Error('Host header not found');
        }

        const url = new URL(
          req.url,
          `http://${req.headers.host}`,
        );

        const domain = config.domains.find((domain_) => {
          return wildcard(url.hostname, domain_.name);
        });

        if (!domain) {
          throw new Error(`Domain not found: ${req.headers.host}`);
        }

        if ('redirectTo' in domain) {
          throw new Error(`Cannot upgrade socket, because domain is redirected to "${domain.redirectTo}"`);
        }

        proxy.ws(req, socket, head, {
          target: `ws://${domain.target}`,
          secure: false,
        }, destroy());
      } catch (error) {
        destroy()(error);
      }
    }).on('error', function (error) {
      reject(error);
    }).listen(443, '0.0.0.0', function () {
      resolve();
    });
  });

  await new Promise((resolve, reject) => {
    const server = http.createServer(function (req, res) {
      res.writeHead(301, { 'Location': 'https://' + req.headers['host'] + req.url });
      res.end();
    }).listen(80, '0.0.0.0', function () {
      resolve(server);
    }).on('error', function (err) {
      reject(err);
    });
  });
}

const getDNS = () => {
  if (process.env.DO_API_KEY) {
    return 'dns_dgon';
  }
  
  if (process.env.GD_Key && process.env.GD_Secret) {
    return 'dns_gd';
  }
  
  if (process.env.CF_Token && process.env.CF_Account_ID && process.env.CF_Zone_ID) {
    return 'dns_cf';
  }

  throw new Error('Unknown dns');
};

export const startDdnsJob = async ({
  timeout = 30 * 60 * 1000,
}: {
  timeout?: number;
} = {}) => {
  const dns = getDNS();

  // TODO: Currently ddns works only with DigitalOcean,
  // implement other providers.
  if (dns !== 'dns_dgon') {
    console.warn(`Skipping ddns for ${dns}, it only works with DigitalOcean`);
    return;
  }

  try {
    const record = await updateDigitalOceanDNSRecord(process.env.TLD, {
      token: process.env.DO_API_KEY,
    });

    console.log('DNS record updated:', record);
  } catch (error) {
    console.error(error);
  }

  setTimeout(() => {
    return startDdnsJob();
  }, timeout);
};

export const spawn = (args: ReadonlyArray<string>, options: SpawnOptions) => {
  console.log('Spawning:', args.join(' '));

  const ls = rawSpawn(
    'bash',
    args,
    options,
  );

  ls.stdout.setEncoding('utf8');
  ls.stdout.on('data', (data) => {
    console.log(data);
  });

  ls.stderr.setEncoding('utf8');
  ls.stderr.on('data', (data) => {
    console.error(data);
  });

  return new Promise<void>((resolve, reject) => {
    ls.once('close', (code) => {
      if (code === 0 || code === 2) {
        resolve();
      }
      else {
        reject();
      }
    });
  });
};

export const updateCerts = async (config: Config) => {
  if (process.env.CA_EAB_KEY_ID && process.env.CA_EAB_HMAC_KEY) {
    await spawn(
      [path.resolve(__dirname, '../acme.sh/acme.sh'), '--register-account', '--eab-kid', process.env.CA_EAB_KEY_ID, '--eab-hmac-key', process.env.CA_EAB_HMAC_KEY],
      {
        env: process.env,
      },
    );
  }

  const domainMap = {} as Record<string, string[]>;
  for (const domain of config.domains) {
    const parts = domain.name.split('.');
    const tld = parts.slice(1).join('.');

    if (domainMap[tld]) {
      domainMap[tld].push(domain.name);
    } else {
      domainMap[tld] = [domain.name];
    }
  }

  for (const tlds of Object.values(domainMap)) {
    await spawn([path.resolve(__dirname, '../acme.sh/acme.sh'), ...tlds.map(domain => ['-d', domain]).flat(), '--issue', '--dns', getDNS(), '--log'], {
      env: process.env,
    });
  }
};
