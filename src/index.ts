import * as http from 'http';
import * as https from 'https';
import * as httpProxy from 'http-proxy';
import { spawn as rawSpawn } from 'child_process';
import * as path from 'path';
import { URL } from 'url';
import { SNIConfig, createSNICallback, Domain } from './sni';
import { updateDigitalOceanDNSRecord } from './ddns';

interface Config extends SNIConfig {
  domains: Domain[];
}

export const startProxyServer = async (config: Config) => {
  const proxy = httpProxy.createProxyServer({
    ws: true,
    changeOrigin: false,
    secure: false,
    autoRewrite: true,
  });

  proxy.on('error', function (err, _req, res) {
    if (!('headersSent' in res) || !res.headersSent) {
      if ('writeHead' in res) {
        res.writeHead(500, {
          'content-type': 'application/json'
        });
      }
    }

    res.end(JSON.stringify(err));
    console.log('Proxy error:', err);
  });

  const httpsOptions = {
    SNICallback: await createSNICallback(config),
  };

  await new Promise<void>((resolve, reject) => {
    https.createServer(httpsOptions, function (req, res) {
      const url = new URL(
        req.url,
        `https://${req.headers.host}`,
      );

      const domain = config.domains.find((domain_) => {
        return (url.hostname + url.pathname).startsWith(domain_.name);
      });

      if (!domain) {
        res.statusCode = 404;
        res.end('Domain not found');
      } else if ('redirectTo' in domain) {
        res.writeHead(301, { 'Location': 'https://' + domain.redirectTo });
        res.end();
      } else {
        proxy.web(req, res, {
          target: `http://${domain.target}`,
          xfwd: true,
        });
      }
    }).on('upgrade', function (req, socket, head) {
      console.log('Https update event from:', req.url);

      const url = new URL(
        req.url,
        `http://${req.headers.host}`,
      );

      const domain = config.domains.find((domain_) => {
        return (url.hostname + url.pathname).startsWith(domain_.name);
      });

      if (!domain) {
        return console.error(`Domain not found: ${req.headers.host}`);
      }

      if ('redirectTo' in domain) {
        return console.error(`Cannot upgrade socket, because domain is redirected to "${domain.redirectTo}"`);
      }

      proxy.ws(req, socket, head, {
        target: `ws://${domain.target}`,
        secure: false,
      }, (error) => {
        console.error('Socket upgrade proxy error:', error);
      });
    }).on('error', function (err) {
      reject(err);
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

export const spawn = (args, options) => {
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

export const updateCerts = async () => {
  if (process.env.CA_EAB_KEY_ID && process.env.CA_EAB_HMAC_KEY) {
    await spawn(
      [path.resolve(__dirname, '../acme.sh/acme.sh'), '--register-account', '--eab-kid', process.env.CA_EAB_KEY_ID, '--eab-hmac-key', process.env.CA_EAB_HMAC_KEY],
      process.env,
    );
  }

  await spawn(
    [path.resolve(__dirname, '../acme.sh/acme.sh'), '--issue', '-d', process.env.TLD, '-d', `*.${process.env.TLD}`, '--dns', getDNS(), '--log'],
    {
      env: process.env,
    },
  );
};
