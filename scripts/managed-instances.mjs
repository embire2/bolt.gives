#!/usr/bin/env node

import crypto from 'node:crypto';

const MANAGED_INSTANCE_STATUSES = new Set(['provisioning', 'active', 'updating', 'failed', 'suspended', 'expired']);

export function hashManagedInstanceValue(value) {
  return crypto
    .createHash('sha256')
    .update(String(value || ''))
    .digest('hex');
}

export function normalizeManagedInstanceEmail(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

export function slugifyManagedInstanceSubdomain(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export function buildManagedInstanceHostname(projectName, rootDomain = 'pages.dev') {
  const normalizedProject = slugifyManagedInstanceSubdomain(projectName);
  const normalizedRootDomain = String(rootDomain || 'pages.dev')
    .trim()
    .toLowerCase()
    .replace(/^\.+|\.+$/g, '');

  return normalizedProject && normalizedRootDomain ? `${normalizedProject}.${normalizedRootDomain}` : normalizedProject;
}

function normalizeManagedInstanceHostCandidate(value) {
  const raw = String(value || '').trim().toLowerCase();

  if (!raw) {
    return '';
  }

  if (raw.includes('://')) {
    try {
      return new URL(raw).host.toLowerCase();
    } catch {
      return '';
    }
  }

  return raw.replace(/^\.+|\.+$/g, '');
}

export function resolveManagedInstancePagesAddress(project, fallbackProjectName, rootDomain = 'pages.dev') {
  const candidates = [];

  if (typeof project?.subdomain === 'string') {
    candidates.push(project.subdomain);
  }

  if (Array.isArray(project?.domains)) {
    candidates.push(...project.domains);
  }

  for (const candidate of candidates) {
    const host = normalizeManagedInstanceHostCandidate(candidate);

    if (host) {
      return {
        routeHostname: host,
        pagesUrl: `https://${host}`,
      };
    }
  }

  const fallbackHost = buildManagedInstanceHostname(fallbackProjectName, rootDomain);

  return {
    routeHostname: fallbackHost,
    pagesUrl: `https://${fallbackHost}`,
  };
}

export function buildManagedInstancePagesEnvConfig({ hostedFreeRelayOrigin = '' } = {}) {
  const envVars = {};

  if (String(hostedFreeRelayOrigin || '').trim()) {
    envVars.BOLT_HOSTED_FREE_RELAY_ORIGIN = {
      type: 'plain_text',
      value: String(hostedFreeRelayOrigin).trim(),
    };
  }

  return {
    preview: {
      env_vars: Object.keys(envVars).length ? envVars : null,
    },
    production: {
      env_vars: Object.keys(envVars).length ? envVars : null,
    },
  };
}

export function createManagedInstanceSessionSecret() {
  return crypto.randomBytes(24).toString('hex');
}

export function createManagedInstanceTrialExpiry(trialDays = 0) {
  const numericTrialDays = Number(trialDays);
  const effectiveTrialDays = Number.isFinite(numericTrialDays) ? numericTrialDays : 0;

  if (effectiveTrialDays <= 0) {
    return null;
  }

  return new Date(Date.now() + effectiveTrialDays * 24 * 60 * 60 * 1000).toISOString();
}

export function appendManagedInstanceEvent(registry, event) {
  const nextEvents = Array.isArray(registry.events) ? registry.events.slice(-499) : [];

  nextEvents.push({
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    ...event,
  });

  registry.events = nextEvents;
}

function buildSanitizedManagedInstance(instance) {
  return {
    id: instance.id,
    name: instance.name,
    email: instance.email,
    projectName: instance.projectName,
    routeHostname: instance.routeHostname,
    pagesUrl: instance.pagesUrl,
    plan: instance.plan,
    status: instance.status,
    createdAt: instance.createdAt,
    updatedAt: instance.updatedAt,
    trialEndsAt: instance.trialEndsAt,
    currentGitSha: instance.currentGitSha || null,
    previousGitSha: instance.previousGitSha || null,
    lastRolloutAt: instance.lastRolloutAt || null,
    lastDeploymentUrl: instance.lastDeploymentUrl || null,
    lastError: instance.lastError || null,
    suspendedAt: instance.suspendedAt || null,
    expiredAt: instance.expiredAt || null,
    sourceBranch: instance.sourceBranch || 'main',
  };
}

export function sanitizeManagedInstanceForClient(instance) {
  return buildSanitizedManagedInstance(instance);
}

export function sanitizeManagedInstanceForOperator(instance) {
  return buildSanitizedManagedInstance(instance);
}

export function normalizeManagedInstanceRegistry(
  input,
  { defaultRootDomain = 'pages.dev', defaultTrialDays = 0 } = {},
) {
  const now = new Date().toISOString();
  const instances = Array.isArray(input?.instances) ? input.instances : [];
  const indefiniteTrialMode = Number(defaultTrialDays) <= 0;

  return {
    rootDomain:
      typeof input?.rootDomain === 'string' && input.rootDomain.trim() ? input.rootDomain.trim() : defaultRootDomain,
    instances: instances.map((instance) => {
      const normalizedEmail = normalizeManagedInstanceEmail(instance.email);
      const projectName =
        slugifyManagedInstanceSubdomain(instance.projectName) ||
        slugifyManagedInstanceSubdomain(instance.routeHostname?.split('.')?.[0]) ||
        'bolt-gives-trial';
      const routeHostname =
        typeof instance.routeHostname === 'string' && instance.routeHostname.trim()
          ? instance.routeHostname.trim()
          : buildManagedInstanceHostname(projectName, defaultRootDomain);
      const normalizedPlan =
        typeof instance.plan === 'string' && instance.plan.trim()
          ? instance.plan.trim()
          : instance.trialEndsAt
            ? 'experimental-free-15d'
            : 'experimental-free-indefinite';
      const shouldClearTrialExpiry =
        indefiniteTrialMode &&
        normalizedPlan.startsWith('experimental-free-') &&
        instance.status !== 'expired' &&
        !instance.expiredAt;

      return {
        id: String(instance.id || crypto.randomUUID()),
        name: String(instance.name || 'bolt.gives Trial'),
        email: normalizedEmail,
        clientKeyHash:
          typeof instance.clientKeyHash === 'string' && instance.clientKeyHash.trim()
            ? instance.clientKeyHash.trim()
            : hashManagedInstanceValue(normalizedEmail),
        clientSessionSecretHash:
          typeof instance.clientSessionSecretHash === 'string' && instance.clientSessionSecretHash.trim()
            ? instance.clientSessionSecretHash.trim()
            : null,
        projectName,
        routeHostname,
        pagesUrl:
          typeof instance.pagesUrl === 'string' && instance.pagesUrl.trim()
            ? instance.pagesUrl.trim()
            : `https://${routeHostname}`,
        plan:
          shouldClearTrialExpiry && normalizedPlan.startsWith('experimental-free-')
            ? 'experimental-free-indefinite'
            : normalizedPlan,
        status: MANAGED_INSTANCE_STATUSES.has(instance.status) ? instance.status : 'provisioning',
        createdAt: typeof instance.createdAt === 'string' && instance.createdAt ? instance.createdAt : now,
        updatedAt: typeof instance.updatedAt === 'string' && instance.updatedAt ? instance.updatedAt : now,
        trialEndsAt:
          !shouldClearTrialExpiry && typeof instance.trialEndsAt === 'string' && instance.trialEndsAt
            ? instance.trialEndsAt
            : null,
        currentGitSha:
          typeof instance.currentGitSha === 'string' && instance.currentGitSha ? instance.currentGitSha : null,
        previousGitSha:
          typeof instance.previousGitSha === 'string' && instance.previousGitSha ? instance.previousGitSha : null,
        lastRolloutAt:
          typeof instance.lastRolloutAt === 'string' && instance.lastRolloutAt ? instance.lastRolloutAt : null,
        lastDeploymentUrl:
          typeof instance.lastDeploymentUrl === 'string' && instance.lastDeploymentUrl
            ? instance.lastDeploymentUrl
            : null,
        lastError: typeof instance.lastError === 'string' && instance.lastError ? instance.lastError : null,
        suspendedAt: typeof instance.suspendedAt === 'string' && instance.suspendedAt ? instance.suspendedAt : null,
        expiredAt: typeof instance.expiredAt === 'string' && instance.expiredAt ? instance.expiredAt : null,
        sourceBranch:
          typeof instance.sourceBranch === 'string' && instance.sourceBranch.trim()
            ? instance.sourceBranch.trim()
            : 'main',
      };
    }),
    events: Array.isArray(input?.events) ? input.events.slice(-500) : [],
  };
}

export function getManagedInstanceBySessionSecret(registry, sessionSecret) {
  const normalizedSecret = String(sessionSecret || '').trim();

  if (!normalizedSecret) {
    return null;
  }

  const hashedSecret = hashManagedInstanceValue(normalizedSecret);

  return registry.instances.find((instance) => instance.clientSessionSecretHash === hashedSecret) || null;
}

/**
 * @typedef {Object} ManagedInstanceClaimOptions
 * @property {string} name
 * @property {string} email
 * @property {string} requestedSubdomain
 * @property {string} [rootDomain]
 * @property {number} [trialDays]
 * @property {string | undefined} [sessionSecret]
 */

/**
 * @param {{ rootDomain?: string, instances: any[], events?: any[] }} registry
 * @param {ManagedInstanceClaimOptions} options
 */
export function claimManagedInstanceTrial(
  registry,
  { name, email, requestedSubdomain, rootDomain = 'pages.dev', trialDays = 0, sessionSecret = undefined },
) {
  const normalizedName = String(name || '').trim();
  const normalizedEmail = normalizeManagedInstanceEmail(email);
  const normalizedSubdomain = slugifyManagedInstanceSubdomain(requestedSubdomain);
  const clientKeyHash = hashManagedInstanceValue(normalizedEmail);
  const sessionSecretHash = sessionSecret ? hashManagedInstanceValue(sessionSecret) : null;
  const existingSessionInstance =
    sessionSecretHash &&
    registry.instances.find((instance) => instance.clientSessionSecretHash === sessionSecretHash);

  if (existingSessionInstance) {
    return {
      kind: 'existing',
      sessionSecret,
      instance: existingSessionInstance,
    };
  }

  const existingInstance = registry.instances.find((instance) => instance.clientKeyHash === clientKeyHash) || null;

  if (existingInstance) {
    if (sessionSecretHash && sessionSecretHash === existingInstance.clientSessionSecretHash) {
      return {
        kind: 'existing',
        sessionSecret,
        instance: existingInstance,
      };
    }

    return {
      kind: 'conflict',
      code: 'client-instance-exists',
      instance: existingInstance,
    };
  }

  const existingSubdomain =
    registry.instances.find(
      (instance) =>
        instance.projectName === normalizedSubdomain ||
        instance.routeHostname === buildManagedInstanceHostname(normalizedSubdomain, rootDomain),
    ) || null;

  if (existingSubdomain) {
    return {
      kind: 'conflict',
      code: 'subdomain-unavailable',
      instance: existingSubdomain,
    };
  }

  const effectiveSessionSecret = String(sessionSecret || createManagedInstanceSessionSecret());
  const effectiveRootDomain = String(rootDomain || registry.rootDomain || 'pages.dev');
  const routeHostname = buildManagedInstanceHostname(normalizedSubdomain, effectiveRootDomain);
  const instance = {
    id: crypto.randomUUID(),
    name: normalizedName,
    email: normalizedEmail,
    clientKeyHash,
    clientSessionSecretHash: hashManagedInstanceValue(effectiveSessionSecret),
    projectName: normalizedSubdomain,
    routeHostname,
    pagesUrl: `https://${routeHostname}`,
    plan: trialDays > 0 ? `experimental-free-${trialDays}d` : 'experimental-free-indefinite',
    status: 'provisioning',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    trialEndsAt: createManagedInstanceTrialExpiry(trialDays),
    currentGitSha: null,
    previousGitSha: null,
    lastRolloutAt: null,
    lastDeploymentUrl: null,
    lastError: null,
    suspendedAt: null,
    expiredAt: null,
    sourceBranch: 'main',
  };

  registry.instances.unshift(instance);
  appendManagedInstanceEvent(registry, {
    actor: normalizedEmail,
    action: 'managed-instance.spawn.requested',
    target: routeHostname,
    details: {
      projectName: normalizedSubdomain,
      plan: instance.plan,
    },
  });

  return {
    kind: 'created',
    sessionSecret: effectiveSessionSecret,
    instance,
  };
}
