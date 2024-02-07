import * as http from 'http';
import * as https from 'https';
import * as httpProxy from 'http-proxy';
import { URL } from 'url';
import { createSNICallback } from './sni';
import { ConnectionContext } from './websocket-server';
import { Domain } from './types';

export const startProxyServer = async (connections: ConnectionContext[]) => {
  const proxy = httpProxy.createProxyServer({
    ws: true,
    changeOrigin: false,
    secure: false,
    autoRewrite: true,
  });

  proxy.on('error', function (err, _req, res) {
    if (!res.headersSent) {
      if (typeof res.writeHead === 'function') {
        res.writeHead(500, {
          'content-type': 'application/json'
        });
      }
    }

    res.end(JSON.stringify(err));
    console.log('Proxy error:', err);
  });

  const httpsOptions = {
    SNICallback: createSNICallback(connections)
  };

  await new Promise<void>((resolve, reject) => {
    https.createServer(httpsOptions, function (req, res) {
      const url = new URL(
        req.url,
        `https://${req.headers.host}`,
      );

      let domain: Domain;
      top:
      for (let connection of connections) {
        for (let domain_ of connection.config.domains) {
          if ((url.hostname + url.pathname).startsWith(domain_.name)) {
            domain = domain_;
            break top;
          }
        }
      }

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

      let domain: Domain;
      top:
      for (let connection of connections) {
        for (let domain_ of connection.config.domains) {
          if ((url.hostname + url.pathname).startsWith(domain_.name)) {
            domain = domain_;
            break top;
          }
        }
      }

      if (!domain) {
        return console.error(`Domain not found: ${req.headers.host}`);
      }

      if ('redirectTo' in domain) {
        return console.error(`Cannot upgrade socket, because domain is redirected to "${domain.redirectTo}"`);
      }

      proxy.ws(req, socket, head, {
        target: `ws://${domain.target}`,
        secure: false,
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
