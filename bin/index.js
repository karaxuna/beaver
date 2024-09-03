#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { startProxyServer, startDdnsJob, updateCerts } = require('../lib');
const cwd = process.cwd();

const configFilePath = path.resolve(
  cwd, './proxy.json',
);

const configRaw = JSON.parse(
  fs.readFileSync(configFilePath, 'utf8').replaceAll('${TLD}', process.env.TLD),
);

updateCerts().then(() => {
  startDdnsJob().then(() => {
    startProxyServer(configRaw).then(() => {
      console.log('Reverse proxy started on ports 80, 443');
    }).catch((err) => {
      console.error('Reverse proxy exited with error:', err);
      process.exit(1);
    });
  });
});
