import * as tls from 'tls';
import { promises as fs, /*watch,*/ constants as fsConstants } from 'fs';

export type Domain = {
    name: string;
} & ({
    redirectTo: string;
} | {
    target: string;
});

interface GreenlockConfig {
    packageRoot: string;
    configDir: string;
    packageAgent: string;
    maintainerEmail: string;
    directoryUrl: string;
}

export interface SNIConfig extends GreenlockConfig {
    domains: Domain[];
    godaddyKey: string;
    godaddySecret: string;
}

const getSecureContext = async (retry = 30) => {
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

export const createSNICallback = async (config: SNIConfig) => {
    const cache = {};

    // watch(`/acme.sh/${process.env.TLD}/`, () => {
    //     cache = {};
    // });

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
