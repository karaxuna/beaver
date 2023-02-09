const axios = require('axios');

interface UpdateDNSRecordOptions {
    token: string;
}

export const updateDNSRecord = async (domainName: string, { token }: UpdateDNSRecordOptions) => {
    const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
    };

    const domain = await axios.get(
      `https://api.digitalocean.com/v2/domains/${domainName}`,
      { headers }
    );

    const record = domain.data.domain_records.find(
      record => record.name === domainName && record.type === 'A'
    );

    if (!record) {
      throw new Error(`No A record found with name ${domainName}`);
    }

    const ip = domainName.startsWith('local.') ?
        '127.0.0.1' :
        (await axios.get('https://api.ipify.org?format=json')).data.ip;

    const data = {
      type: 'A',
      name: domainName,
      data: ip,
    };

    await axios.put(
      `https://api.digitalocean.com/v2/domains/${domainName}/records/${record.id}`,
      data,
      { headers },
    );

    return data;
};
