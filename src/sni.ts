import * as tls from 'tls';
import { promises as fs } from 'fs';
import { getCertDomains, wildcard } from './wildcard';

const getSecureContext = async (tld: string) => {
    try {
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
    } catch (error) {
        console.error('Error getting secure context:', error, 'certs:', await fs.readdir('/acme.sh'));
        throw error;
    }
};

export const createSNICallback = (config: any): tls.TlsOptions['SNICallback'] => {
    const cache: Record<string, Promise<tls.SecureContext>> = {};

    return (servername, cb) => {
        const name = getCertDomains(config.domains).find((_name) => {
            return wildcard(servername, _name);
        });

        if (!name) {
            return cb(new Error('No domain found for servername: ' + servername), null);
        }

        if (!cache[name]) {
            console.log('Getting secure context for:', servername, 'domain name:', name);
            cache[name] = getSecureContext(name);
            console.log('Cache updated:', cache);
        }

        cache[name]
            .then((context) => {
                cb(null, context);
            })
            .catch((err) => {
                console.warn('Error getting secure context:', err);
                Reflect.deleteProperty(cache, name);
                console.log('Cache updated:', cache);
                cb(err, null);
            });
    };
};
