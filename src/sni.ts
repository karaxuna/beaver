import * as tls from 'tls';
import { promises as fs } from 'fs';
import { wildcard } from './wildcard';

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

export const createSNICallback = async (config: any) => {
    const cache = {};

    return (servername: string, cb) => {
        const domain = config.domains.find((domain: any) => {
            return wildcard(domain.name, servername);
        });

        if (!domain) {
            return cb(new Error('No domain found for servername: ' + servername));
        }

        if (!cache[domain.name]) {
            console.log('Getting secure context for:', servername, 'domain name:', domain.name);
            cache[domain.name] = getSecureContext(domain.name);
            console.log('Cache updated:', cache);
        }

        cache[domain.name]
            .then((context) => {
                cb(null, context);
            })
            .catch((err) => {
                console.warn('Error getting secure context:', err);
                Reflect.deleteProperty(cache, domain.name);
                console.log('Cache updated:', cache);
                cb(err);
            });
    };
};
