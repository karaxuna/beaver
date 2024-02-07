import { SpawnOptionsWithoutStdio, spawn as rawSpawn } from 'child_process';
import * as path from 'path';
import { ConnectionContext } from './websocket-server';

export const spawn = (args, options?: SpawnOptionsWithoutStdio) => {
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

const getDNS = (env: any) => {
  if (env.DO_API_KEY) {
    return 'dns_dgon';
  }
  
  if (env.GD_Key && env.GD_Secret) {
    return 'dns_gd';
  }
  
  if (env.CF_Token && env.CF_Account_ID && env.CF_Zone_ID) {
    return 'dns_cf';
  }

  throw new Error('Unknown dns');
};

export const updateCerts = async (connection: ConnectionContext) => {
  if (connection.config.env.CA_EAB_KEY_ID && connection.config.env.CA_EAB_HMAC_KEY) {
    await spawn(
      [path.resolve(__dirname, '../acme.sh/acme.sh'), '--register-account', '--eab-kid', connection.config.env.CA_EAB_KEY_ID, '--eab-hmac-key', connection.config.env.CA_EAB_HMAC_KEY],
    );
  }

  const dns = getDNS(connection.config.env);

  await spawn(
    [path.resolve(__dirname, '../acme.sh/acme.sh'), '--issue', '-d', connection.tld, '-d', `*.${connection.tld}`, '--dns', dns, '--log'],
    {
      env: connection.config.env,
    }
  );
};
