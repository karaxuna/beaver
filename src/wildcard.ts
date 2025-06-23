export const wildcard = (str: string, pattern: string) => {
  // Escape special regex characters except * and .
  const escapedPattern = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');

  // Convert wildcard pattern to regex:
  // - * becomes .* (matches anything within a segment)
  // - ** becomes .* (matches across segments)
  // - *. becomes [^.]*\. (matches any non-dots followed by a dot)
  const regexPattern = '^' +
    escapedPattern
      .replace(/\*\./g, '[^.]*\\.')  // handle *. cases
      .replace(/\*\*/g, '.*')        // handle ** cases
      .replace(/\*/g, '[^.]*') +      // handle single * cases
    '$';

  const regex = new RegExp(regexPattern);
  return regex.test(str);
}

export function getCertDomains(domains: any[]): string[] {
  const plain = [];              // names without "*."
  const out   = new Set<string>();       // final result

  // 1. separate explicit wildcards & plain names
  for (const { name } of domains) {
    const lower = name.toLowerCase();
    if (lower.startsWith('*.')) out.add(lower);
    else plain.push(lower);
  }

  // 2. always keep an apex that appears explicitly
  for (const host of plain)
    if (host.split('.').length === 2) out.add(host); // foo.com

  // 3. for every plain host, add wildcards for each parent ≥ apex
  for (const host of plain) {
    let parts = host.split('.');
    while (parts.length >= 2) {
      parts = parts.slice(1);               // peel leftmost label
      if (parts.length >= 2)                // skip bare TLDs
        out.add(`*.${parts.join('.')}`);
    }
  }

  // 4. stable order: apex first, then wildcards
  return [...out].sort((a, b) => {
    const aw = a.startsWith('*.') ? 1 : 0;   // wildcard → 1, apex → 0
    const bw = b.startsWith('*.') ? 1 : 0;

    if (aw !== bw) return aw - bw;           // apex before wildcard
    return a.replace(/^\*\./, '').localeCompare(b.replace(/^\*\./, ''));
  });
}

export const getTld = (domain: string) => {
  return domain.split('.').slice(-2).join('.');
};

export const getTldMapping = (domains: any[]): Record<string, string[]> => {
  const mapping: Record<string, string[]> = {};

  for (const { name } of domains) {
    const tld = getTld(name);

    if (!mapping[tld]) {
      mapping[tld] = [];
    }

    mapping[tld].push(name);
  }

  return mapping;
};
