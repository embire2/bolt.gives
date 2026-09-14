import { isIP } from 'node:net';
import fs from 'node:fs/promises';

export async function writePublicZoneCandidate(filename, candidate) {
  await fs.writeFile(filename, candidate, { mode: 0o644, flag: 'wx' });

  // Unlike the credential file, public DNS records must be readable by named.
  await fs.chmod(filename, 0o644);
}

export async function verifySecondarySerial(
  zoneName,
  serial,
  resolveSoa,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const actual = await resolveSoa(zoneName).catch(() => null);

    if (String(actual?.serial) === String(serial)) {
      return;
    }

    await sleep(250);
  }
  throw new Error('BIND did not load the expected DNS serial.');
}

const decode = (value) => Buffer.from(value, 'base64').toString('latin1');
const number = (value) => {
  if (!/^\d+$/.test(String(value)) || Number(value) > 4294967295) {
    throw new Error('Invalid DNS integer.');
  }

  return String(value);
};
const name = (value) => {
  if (!/^[a-zA-Z0-9_*.-]+$/.test(value) || value.length > 254) {
    throw new Error('Invalid DNS record name.');
  }

  return value;
};
const quoted = (value) => {
  if (value.length > 255) {
    throw new Error('DNS character string exceeds 255 bytes.');
  }

  return `"${[...value]
    .map((c) => {
      const n = c.charCodeAt(0);
      return n < 32 || n > 126 || c === '"' || c === '\\' ? `\\${String(n).padStart(3, '0')}` : c;
    })
    .join('')}"`;
};

export function renderCpanelZone(zone, zoneName) {
  const lines = [`; bolt-cpanel-sync serial=${number(zone.serial)}`, `$ORIGIN ${name(zoneName)}.`, '$TTL 14400'];

  for (const record of zone.records) {
    if (!record.record_type) {
      continue;
    }

    const type = record.record_type;
    const data = record.data_b64.map(decode);
    let fields;

    if (type === 'TXT' && data.length) {
      fields = data.map(quoted);
    } else if (type === 'SOA' && data.length === 7) {
      fields = [name(data[0]), name(data[1]), ...data.slice(2).map(number)];
    } else if (['NS', 'CNAME', 'PTR'].includes(type) && data.length === 1) {
      fields = data.map(name);
    } else if (type === 'MX' && data.length === 2) {
      fields = [number(data[0]), name(data[1])];
    } else if (type === 'SRV' && data.length === 4) {
      fields = [...data.slice(0, 3).map(number), name(data[3])];
    } else if (type === 'CAA' && data.length === 3) {
      fields = [number(data[0]), quoted(data[1]), quoted(data[2])];
    } else if (['A', 'AAAA'].includes(type) && data.length === 1 && isIP(data[0]) === (type === 'A' ? 4 : 6)) {
      fields = data;
    } else {
      throw new Error(`Unsupported or malformed DNS record type: ${type}. Preserve the last-good zone.`);
    }

    lines.push(`${name(decode(record.dname_b64))} ${number(record.ttl ?? 14400)} IN ${type} ${fields.join(' ')}`);
  }

  return `${lines.join('\n')}\n`;
}

export function assertForwardZoneSerial(previous, next) {
  const current = String(previous).match(/^; bolt-cpanel-sync serial=(\d+)\n/);

  if (!current) {
    throw new Error('Existing zone was not created by this synchronizer.');
  }

  const delta = (Number(number(next)) - Number(number(current[1])) + 4294967296) % 4294967296;

  if (delta === 0 || delta >= 2147483648) {
    throw new Error('DNS serial did not advance; refusing to replace the current zone.');
  }
}
