import * as http from 'http';
import * as https from 'https';
import * as httpProxy from 'http-proxy';
import { URL } from 'url';
import { SNIConfig, createSNICallback, Domain } from './sni';
import { updateDNSRecord } from './ddns';

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
        if (!res.headersSent) {
            if (typeof res.writeHead === 'function') {
                res.writeHead(500, {
                    'content-type': 'application/json'
                });
            }
        }

        res.end(JSON.stringify(err));
    });

    const httpsOptions = {
        SNICallback: await createSNICallback(config)
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
            const url = new URL(
                req.url,
                `http://${req.headers.host}`,
            );

            const domain = config.domains.find((domain_) => {
                return (url.hostname + url.pathname).startsWith(domain_.name);
            });

            if (!domain) {
                throw new Error(`Domain not found: ${req.headers.host}`);
            }

            if ('redirectTo' in domain) {
                throw new Error(`Cannot upgrade socket, because domain is redirected to "${domain.redirectTo}"`);
            }

            proxy.ws(req, socket, head, {
                target: `ws://${domain.target}`
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

export const startDdnsJob = async ({
    token,
    tld,
    timeout = 30 * 60 * 1000,
}: {
    token: string;
    tld: string;
    timeout?: number;
}) => {
    try {
        const record = await updateDNSRecord(tld, {
            token,
        });

        console.log('DNS record updated:', record);
    } catch (error) {
        console.error(error);
    }

    setTimeout(() => {
        return startDdnsJob({ tld, token });
    }, timeout);
};
