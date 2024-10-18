import * as psl from 'psl';
import axios from 'axios';

interface UpdateDigitalOceanDNSRecordOptions {
  token: string;
}

export const updateDigitalOceanDNSRecord = async (domainName: string, { token }: UpdateDigitalOceanDNSRecordOptions) => {
  const parsed = psl.parse(domainName);

  if (parsed.error) {
    throw parsed.error;
  }

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  const {
    data: {
      domain_records,
    },
  } = await axios.get(
    `https://api.digitalocean.com/v2/domains/${(parsed as psl.ParsedDomain).domain}/records`,
    { headers },
  );

  const recordName = (parsed as psl.ParsedDomain).subdomain || '@';

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
    `https://api.digitalocean.com/v2/domains/${(parsed as psl.ParsedDomain).domain}/records/${record.id}`,
    data,
    { headers },
  );

  return data;
};
