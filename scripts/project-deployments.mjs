#!/usr/bin/env node

import crypto from 'node:crypto';

const PROJECT_DEPLOYMENT_STATUSES = new Set(['active', 'pending-domain-payment', 'failed', 'suspended']);
const RESERVED_BOLT_SUBDOMAINS = new Set([
  'admin',
  'ahmad',
  'api',
  'app',
  'alpha1',
  'assets',
  'bolt',
  'bolt-gives',
  'cdn',
  'create',
  'docs',
  'mail',
  'runtime',
  'status',
  'support',
  'www',
]);

export function slugifyProjectSubdomain(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export function validateProjectSubdomain(value) {
  const subdomain = slugifyProjectSubdomain(value);

  if (!subdomain || subdomain.length < 3) {
    return { ok: false, subdomain, reason: 'Choose a project subdomain with at least 3 letters or numbers.' };
  }

  if (!/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/.test(subdomain)) {
    return { ok: false, subdomain, reason: 'Subdomains must start and end with a letter or number.' };
  }

  if (RESERVED_BOLT_SUBDOMAINS.has(subdomain)) {
    return { ok: false, subdomain, reason: 'That bolt.gives subdomain is reserved.' };
  }

  return { ok: true, subdomain, reason: null };
}

export function normalizeProjectDomainRoot(value = 'bolt.gives') {
  return String(value || 'bolt.gives')
    .trim()
    .toLowerCase()
    .replace(/^\.+|\.+$/g, '');
}

export function buildProjectHostname(subdomain, rootDomain = 'bolt.gives') {
  const cleanSubdomain = slugifyProjectSubdomain(subdomain);
  const cleanRoot = normalizeProjectDomainRoot(rootDomain);
  return cleanSubdomain && cleanRoot ? `${cleanSubdomain}.${cleanRoot}` : cleanSubdomain;
}

export function normalizeCustomDomain(value) {
  const raw = String(value || '')
    .trim()
    .toLowerCase();

  if (!raw) {
    return '';
  }

  try {
    const parsed = raw.includes('://') ? new URL(raw) : new URL(`https://${raw}`);
    return parsed.hostname.replace(/^\.+|\.+$/g, '');
  } catch {
    return raw
      .replace(/[^a-z0-9.-]+/g, '')
      .replace(/\.{2,}/g, '.')
      .replace(/^\.+|\.+$/g, '');
  }
}

export function isLikelyValidCustomDomain(value) {
  const domain = normalizeCustomDomain(value);
  return (
    domain.length >= 4 &&
    domain.length <= 253 &&
    domain.includes('.') &&
    !domain.endsWith('.bolt.gives') &&
    /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])$/.test(domain)
  );
}

export function normalizeProjectDeploymentRegistry(input) {
  const now = new Date().toISOString();
  const deployments = Array.isArray(input?.deployments) ? input.deployments : [];

  return {
    version: 1,
    deployments: deployments.map((deployment) => {
      const subdomain = slugifyProjectSubdomain(deployment.subdomain);
      const hostname = String(deployment.hostname || buildProjectHostname(subdomain)).toLowerCase();

      return {
        id: String(deployment.id || crypto.randomUUID()),
        sessionId: String(deployment.sessionId || ''),
        subdomain,
        hostname,
        status: PROJECT_DEPLOYMENT_STATUSES.has(deployment.status) ? deployment.status : 'active',
        previewPort: Number(deployment.previewPort || 0) || null,
        customDomains: Array.isArray(deployment.customDomains)
          ? deployment.customDomains.map(normalizeProjectCustomDomainRecord).filter(Boolean)
          : [],
        dnsStatus: typeof deployment.dnsStatus === 'string' && deployment.dnsStatus ? deployment.dnsStatus : 'unknown',
        caddyStatus:
          typeof deployment.caddyStatus === 'string' && deployment.caddyStatus ? deployment.caddyStatus : 'unknown',
        lastError: typeof deployment.lastError === 'string' && deployment.lastError ? deployment.lastError : null,
        createdAt: typeof deployment.createdAt === 'string' && deployment.createdAt ? deployment.createdAt : now,
        updatedAt: typeof deployment.updatedAt === 'string' && deployment.updatedAt ? deployment.updatedAt : now,
      };
    }),
    events: Array.isArray(input?.events) ? input.events.slice(-500) : [],
  };
}

function normalizeProjectCustomDomainRecord(record) {
  const domain = normalizeCustomDomain(record?.domain || record);

  if (!domain) {
    return null;
  }

  return {
    domain,
    status:
      record?.status === 'active' || record?.status === 'pending-payment' || record?.status === 'pending-dns'
        ? record.status
        : 'pending-payment',
    stripeCheckoutSessionId:
      typeof record?.stripeCheckoutSessionId === 'string' && record.stripeCheckoutSessionId
        ? record.stripeCheckoutSessionId
        : null,
    createdAt:
      typeof record?.createdAt === 'string' && record.createdAt ? record.createdAt : new Date().toISOString(),
    updatedAt:
      typeof record?.updatedAt === 'string' && record.updatedAt ? record.updatedAt : new Date().toISOString(),
  };
}

export function appendProjectDeploymentEvent(registry, event) {
  const nextEvents = Array.isArray(registry.events) ? registry.events.slice(-499) : [];

  nextEvents.push({
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    ...event,
  });
  registry.events = nextEvents;
}

export function findProjectDeploymentByHost(registry, host) {
  const hostname = String(host || '')
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, '');

  if (!hostname) {
    return null;
  }

  return (
    registry.deployments.find(
      (deployment) =>
        deployment.hostname === hostname ||
        deployment.customDomains.some((customDomain) => customDomain.domain === hostname && customDomain.status === 'active'),
    ) || null
  );
}

export function sanitizeProjectDeploymentForClient(deployment, options = {}) {
  const serverIp = String(options.serverIp || '').trim();

  return {
    id: deployment.id,
    sessionId: deployment.sessionId,
    subdomain: deployment.subdomain,
    hostname: deployment.hostname,
    url: deployment.hostname ? `https://${deployment.hostname}` : null,
    status: deployment.status,
    previewPort: deployment.previewPort || null,
    dnsStatus: deployment.dnsStatus || 'unknown',
    caddyStatus: deployment.caddyStatus || 'unknown',
    customDomains: deployment.customDomains.map((customDomain) => ({
      domain: customDomain.domain,
      status: customDomain.status,
      dnsInstructions:
        customDomain.status === 'active' || customDomain.status === 'pending-dns'
          ? buildCustomDomainDnsInstructions(customDomain.domain, serverIp)
          : null,
    })),
    dnsInstructions: serverIp ? buildCustomDomainDnsInstructions(deployment.hostname, serverIp) : null,
    updatedAt: deployment.updatedAt,
    lastError: deployment.lastError || null,
  };
}

export function buildCustomDomainDnsInstructions(domain, serverIp) {
  const cleanDomain = normalizeCustomDomain(domain);
  const ip = String(serverIp || '').trim();

  return {
    type: 'A',
    name: cleanDomain,
    value: ip,
    ttl: 'Auto',
    note: `Create an A record for ${cleanDomain} pointing to ${ip}. Leave DNS propagation time before retrying HTTPS.`,
  };
}

export function buildResolvedProjectDnsStatus(hostname, serverIp, addresses, fallbackMessage = '') {
  const host = String(hostname || '').trim();
  const ip = String(serverIp || '').trim();
  const resolvedAddresses = Array.isArray(addresses)
    ? addresses.map((address) => String(address || '').trim()).filter(Boolean)
    : [];

  if (!host || !ip || !resolvedAddresses.includes(ip)) {
    return null;
  }

  const suffix = fallbackMessage ? ` ${fallbackMessage}` : '';

  return {
    status: 'active',
    message: `${host} already resolves to ${ip}.${suffix}`.trim(),
  };
}

export function encodeStripeForm(params, prefix = '') {
  const pairs = [];

  for (const [key, value] of Object.entries(params || {})) {
    const nextKey = prefix ? `${prefix}[${key}]` : key;

    if (value === undefined || value === null) {
      continue;
    }

    if (Array.isArray(value)) {
      value.forEach((entry, index) => {
        pairs.push(...encodeStripeForm(entry, `${nextKey}[${index}]`));
      });
      continue;
    }

    if (typeof value === 'object') {
      pairs.push(...encodeStripeForm(value, nextKey));
      continue;
    }

    pairs.push([nextKey, String(value)]);
  }

  return pairs;
}
