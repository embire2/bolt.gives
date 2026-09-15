async function readResponse(response) {
  const chunks = [];
  let bytes = 0;

  for await (const chunk of response.body || []) {
    bytes += chunk.byteLength;

    if (bytes > 2 * 1024 * 1024) {
      throw new Error('DNS response exceeded the size limit.');
    }

    chunks.push(Buffer.from(chunk));
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function hostname(value) {
  const name = String(value || '')
    .toLowerCase()
    .replace(/\.$/, '');

  if (name.length > 253 || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(name)) {
    throw new Error('Invalid DNS hostname configuration.');
  }

  return name;
}

export function cpanelPreviewDnsConfig(env) {
  const origin = new URL(env.CPANEL_API_ORIGIN);

  if (
    origin.protocol !== 'https:' ||
    origin.username ||
    origin.password ||
    origin.pathname !== '/' ||
    origin.search ||
    origin.hash
  ) {
    throw new Error('CPANEL_API_ORIGIN must be an HTTPS origin without credentials or a path.');
  }

  const username = env.CPANEL_API_USERNAME;
  const token = env.CPANEL_API_TOKEN;

  if (!username || !/^[a-zA-Z0-9_]{1,32}$/.test(username)) {
    throw new Error('Set CPANEL_API_USERNAME to the account that owns the API token.');
  }

  if (!token || !/^[a-zA-Z0-9_-]{20,128}$/.test(token)) {
    throw new Error('Set CPANEL_API_TOKEN in protected configuration.');
  }

  const zone = hostname(env.CPANEL_DNS_ZONE);
  const domains = String(env.CPANEL_PREVIEW_DOMAINS || '')
    .split(',')
    .filter(Boolean)
    .map((name) => hostname(name.trim()));

  if (!domains.length || domains.some((name) => !name.endsWith(`.${zone}`))) {
    throw new Error('CPANEL_PREVIEW_DOMAINS must explicitly list Preview namespaces inside the configured zone.');
  }

  return { origin: origin.origin, username, token, zone, domains };
}

// ASCII decoding masks high bits and could turn a foreign TXT record into the ACME value.
const decode = (value) => Buffer.from(String(value || ''), 'base64').toString('latin1');

export function parseCpanelZone(data, zone) {
  if (!Array.isArray(data)) {
    throw new Error('cPanel returned an invalid DNS zone.');
  }

  if (data.some((record) => record.type === 'control' && /^\s*\$ORIGIN\s/i.test(decode(record.text_b64)))) {
    throw new Error('DNS zones with explicit origin directives require operator review.');
  }

  const records = data.map((record) => {
    if (!record.record_type || !record.dname_b64) {
      return record;
    }

    const name = decode(record.dname_b64);
    const absolute = name === '@' ? `${zone}.` : name.endsWith('.') ? name : `${name}.${zone}.`;

    return { ...record, dname_b64: Buffer.from(absolute, 'latin1').toString('base64') };
  });
  const soa = records.find(
    (record) => record.record_type === 'SOA' && decode(record.dname_b64).toLowerCase() === `${zone}.`,
  );
  const serial = decode(soa?.data_b64?.[2]);

  if (!/^\d+$/.test(serial) || !Number.isSafeInteger(Number(serial))) {
    throw new Error('cPanel returned no valid SOA serial for the configured zone.');
  }

  return { serial, records };
}

export function assertCpanelPreviewRouting(zone, domain) {
  const name = `*.${hostname(String(domain).replace(/^\*\./, ''))}.`;
  const explicitRoute = zone.records.some(
    (record) =>
      ['A', 'AAAA', 'CNAME'].includes(record.record_type) &&
      decode(record.dname_b64).toLowerCase() === name &&
      Array.isArray(record.data_b64) &&
      record.data_b64.length > 0,
  );

  // An ACME child creates a closer DNS encloser, preventing fallback to a broader wildcard.
  if (!explicitRoute) {
    throw new Error(`Configure explicit wildcard Preview routing for ${name} before adding certificate TXT records.`);
  }
}

export function cpanelZoneNameservers(zone, zoneName) {
  const names = zone.records
    .filter(
      (record) => record.record_type === 'NS' && decode(record.dname_b64).toLowerCase() === `${hostname(zoneName)}.`,
    )
    .map((record) => hostname(decode(record.data_b64?.[0])));

  if (!names.length) {
    throw new Error('No authoritative nameservers exist in the configured zone.');
  }

  return [...new Set(names)];
}

async function request(config, operation, parameters, fetchImpl) {
  const url = new URL(`/execute/DNS/${operation}`, config.origin);

  for (const [key, value] of Object.entries({ zone: config.zone, ...parameters })) {
    url.searchParams.set(key, String(value));
  }

  let response;

  try {
    response = await fetchImpl(url, {
      headers: { Authorization: `cpanel ${config.username}:${config.token}`, Accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new Error('cPanel DNS request failed or timed out. Check connectivity and account configuration.');
  }

  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`cPanel DNS request was refused (HTTP ${response.status}).`);
  }

  let payload;

  try {
    payload = await readResponse(response);
  } catch {
    throw new Error('cPanel DNS response was invalid or exceeded the size limit.');
  }

  // HTTPS /execute calls return the result directly; the CLI wraps it in `result`.
  const result = payload?.result ?? payload;

  if (result?.status !== 1) {
    const conflict = /serial/i.test(JSON.stringify(result?.errors || []));
    const error = new Error(
      conflict
        ? 'DNS zone changed during validation. Retry with a fresh serial.'
        : 'cPanel refused the DNS operation. Check zone ownership and API permissions.',
    );
    error.code = conflict ? 'DNS_SERIAL_CONFLICT' : 'DNS_API_FAILURE';
    throw error;
  }

  return result.data;
}

export async function readCpanelPreviewZone(config, { fetchImpl = fetch } = {}) {
  return parseCpanelZone(await request(config, 'parse_zone', {}, fetchImpl), config.zone);
}

/** @type {(zone: ReturnType<typeof parseCpanelZone>) => Promise<void>} */
const unchangedZone = async () => undefined;

export async function updateCpanelPreviewChallenge(
  config,
  { domain, value, remove = false },
  { fetchImpl = fetch, beforeChange = unchangedZone } = {},
) {
  const normalized = hostname(String(domain).replace(/^\*\./, ''));

  if (!config.domains.includes(normalized)) {
    throw new Error('Certificate domain is not an allowed Preview namespace.');
  }

  if (!/^[a-zA-Z0-9_-]{43}$/.test(value)) {
    throw new Error('Invalid ACME DNS validation value.');
  }

  const name = `_acme-challenge.${normalized}.`;

  for (let attempt = 0; attempt < 3; attempt++) {
    const zone = await readCpanelPreviewZone(config, { fetchImpl });
    const matching = zone.records.filter(
      (record) =>
        record.record_type === 'TXT' &&
        decode(record.dname_b64).toLowerCase() === name &&
        Array.isArray(record.data_b64) &&
        record.data_b64.map(decode).join('') === value,
    );

    if (remove ? matching.length === 0 : matching.length > 0) {
      return { changed: false, name };
    }

    if (
      zone.records.some((record) => record.record_type === 'CNAME' && decode(record.dname_b64).toLowerCase() === name)
    ) {
      throw new Error('ACME challenge is delegated by CNAME; configure its target rather than replacing it.');
    }

    const parameters = { serial: zone.serial };

    if (remove) {
      for (const [index, record] of matching.entries()) {
        if (!Number.isSafeInteger(record.line_index) || record.line_index < 0) {
          throw new Error('Invalid DNS record line index.');
        }

        parameters[`remove-${index}`] = record.line_index;
      }
    } else {
      parameters.add = JSON.stringify({ dname: name, ttl: 60, record_type: 'TXT', data: [value] });
    }

    await beforeChange(zone);

    try {
      await request(config, 'mass_edit_zone', parameters, fetchImpl);
      return { changed: true, name };
    } catch (error) {
      if (error.code !== 'DNS_SERIAL_CONFLICT' || attempt === 2) {
        throw error;
      }
    }
  }
  throw new Error('DNS validation exhausted its bounded retries.');
}
