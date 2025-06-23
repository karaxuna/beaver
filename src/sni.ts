import * as tls from 'tls';
import { promises as fs } from 'fs';
import { getCertDomains, getTld, wildcard } from './wildcard';

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

export const createSNICallback = (): tls.TlsOptions['SNICallback'] => {
    const cache: Record<string, Promise<tls.SecureContext>> = {};

    return (servername, cb) => {
        const tld = getTld(servername);

        if (!cache[tld]) {
            console.log('Getting secure context for:', servername, 'tld:', tld);
            cache[tld] = getSecureContext(tld);
            console.log('Cache updated:', cache);
        }

        cache[tld]
            .then((context) => {
                cb(null, context);
            })
            .catch((err) => {
                console.warn('Error getting secure context:', err);
                Reflect.deleteProperty(cache, tld);
                console.log('Cache updated:', cache);
                cb(err, null);
            });
    };
};
