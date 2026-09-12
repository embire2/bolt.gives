import ipaddr from 'ipaddr.js';

export function isPublicAddress(address) {
  try {
    const parsed = ipaddr.parse(address.replace(/^\[|\]$/g, ''));

    // Exclude private, mapped, transition, multicast and reserved networks.
    return parsed.range() === 'unicast' && (parsed.kind() === 'ipv4' || parsed.match(ipaddr.parseCIDR('2000::/3')));
  } catch {
    return false;
  }
}

export function isAllowedUrl(input) {
  try {
    const url = new URL(input);

    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
      return false;
    }

    const host = url.hostname.toLowerCase().replace(/\.$/, '');

    if (!host || /(^|\.)(localhost|local|internal|home|lan|test|invalid)$/.test(host)) {
      return false;
    }

    if (ipaddr.isValid(host.replace(/^\[|\]$/g, ''))) {
      return isPublicAddress(host);
    }

    return host.includes('.') && /^[a-z0-9.-]+$/.test(host);
  } catch {
    return false;
  }
}
