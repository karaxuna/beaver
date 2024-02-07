import * as tls from 'tls';
import { promises as fs } from 'fs';
import { Domain } from './types';
import { ConnectionContext } from './websocket-server';

const getSecureContext = async (tld: string) => {
  const [
    key,
    cert,
  ] = await Promise.all([
    `/acme.sh/${tld}/${tld}.key`,
    `/acme.sh/${tld}/fullchain.cer`,
  ].map((filePath) => {
    return fs.readFile(filePath, 'utf8');
  }));

  return tls.createSecureContext({
    key,
    cert,
  });
};

export const createSNICallback = (connections: ConnectionContext[]): tls.TLSSocketOptions['SNICallback'] => {
  const cache = {};

  return (servername: string, cb) => {
    const connection = connections.find((connection) => {
      return connection.config.domains.some((domain) => {
        return domain.name === servername;
      });
    });

    if (!connection) {
      const error = new Error(`Could not find client for ${servername}`);
      console.error(error);
      return cb(error);
    }

    if (!cache[connection.tld]) {
      console.log('Getting secure context for:', servername);
      cache[connection.tld] = getSecureContext(connection.tld);
      console.log('Cache updated:', cache);
    }

    cache[connection.tld]
      .then((context: tls.SecureContext) => {
        cb(null, context);
      })
      .catch((err: Error) => {
        console.warn('Error getting secure context:', err);
        Reflect.deleteProperty(cache, connection.tld);
        console.log('Cache updated:', cache);
        cb(err);
      });
  };
};
