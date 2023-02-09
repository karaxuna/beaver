const axios = require('axios');

interface UpdateDNSRecordOptions {
    token: string;
}

export const updateDNSRecord = async (domainName: string, { token }: UpdateDNSRecordOptions) => {
    const rootDomainName = domainName
        .split('.')
        .splice(-2)
        .join('.');

    const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
    };

    const {
        data: {
            domain_records,
        },
    } = await axios.get(
        `https://api.digitalocean.com/v2/domains/${rootDomainName}/records`,
        { headers },
    );

    const recordName = rootDomainName === domainName ?
        '@' :
        domainName.substring(0, domainName.indexOf(rootDomainName) - 1);

    const ip = domainName.startsWith('local.') ?
        '127.0.0.1' :
        (await axios.get('https://api.ipify.org?format=json')).data.ip;

    const data = {
        type: 'A',
        name: recordName,
        data: ip,
    };

    const record = domain_records.find((record) => {
        return record.name === recordName && record.type === 'A';
    });

    if (!record) {
        throw new Error(`DNS record not found. Records: ${JSON.stringify(domain_records)}`);
    }
    
    await axios.put(
        `https://api.digitalocean.com/v2/domains/${rootDomainName}/records/${record.id}`,
        data,
        { headers },
    );

    return data;
};
