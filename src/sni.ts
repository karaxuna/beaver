import * as tls from 'tls';
import { promises as fs } from 'fs';

const getSecureContext = async () => {
    const [
        key,
        cert,
    ] = await Promise.all([
        `/acme.sh/${process.env.TLD}/${process.env.TLD}.key`,
        `/acme.sh/${process.env.TLD}/fullchain.cer`,
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
        if (!cache[process.env.TLD]) {
            console.log('Getting secure context for:', servername);
            cache[process.env.TLD] = getSecureContext();
            console.log('Cache updated:', cache);
        }

        cache[process.env.TLD]
            .then((context) => {
                cb(null, context);
            })
            .catch((err) => {
                console.warn('Error getting secure context:', err);
                Reflect.deleteProperty(cache, process.env.TLD);
                console.log('Cache updated:', cache);
                cb(err);
            });
    };
};
