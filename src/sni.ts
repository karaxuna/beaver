import * as tls from 'tls';
import { promises as fs } from 'fs';

const getSecureContext = async (servername: string) => {
    const [
        key,
        cert,
    ] = await Promise.all([
        `/acme.sh/${servername}/${servername}.key`,
        `/acme.sh/${servername}/fullchain.cer`,
    ].map((filePath) => {
        return fs.readFile(filePath, 'utf8');
    }));

    return tls.createSecureContext({
        key,
        cert,
    });
};

export const createSNICallback = async () => {
    const cache = {};

    return (servername: string, cb) => {
        if (!cache[servername]) {
            console.log('Getting secure context for:', servername);
            cache[servername] = getSecureContext(servername);
            console.log('Cache updated:', cache);
        }

        cache[servername]
            .then((context) => {
                cb(null, context);
            })
            .catch((err) => {
                console.warn('Error getting secure context:', err);
                Reflect.deleteProperty(cache, servername);
                console.log('Cache updated:', cache);
                cb(err);
            });
    };
};
