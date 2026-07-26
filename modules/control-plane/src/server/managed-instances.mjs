#!/usr/bin/env node

import crypto from 'node:crypto';

const MANAGED_INSTANCE_STATUSES = new Set(['provisioning', 'active', 'updating', 'failed', 'suspended', 'expired']);
const MANAGED_ROLLOUT_STATUSES = new Set(['started', 'healthy', 'failed', 'rollback-skipped', 'rollback-ready']);

function normalizeManagedInstanceRolloutHistoryEntry(entry) {
  return {
    id: String(entry?.id || crypto.randomUUID()),
    actor: String(entry?.actor || 'system'),
    reason: String(entry?.reason || 'rollout'),
    status: MANAGED_ROLLOUT_STATUSES.has(entry?.status) ? entry.status : 'started',
    targetGitSha: typeof entry?.targetGitSha === 'string' && entry.targetGitSha ? entry.targetGitSha : null,
    previousGitSha: typeof entry?.previousGitSha === 'string' && entry.previousGitSha ? entry.previousGitSha : null,
    deploymentUrl: typeof entry?.deploymentUrl === 'string' && entry.deploymentUrl ? entry.deploymentUrl : null,
    healthcheckUrl: typeof entry?.healthcheckUrl === 'string' && entry.healthcheckUrl ? entry.healthcheckUrl : null,
    rollbackOutcome: typeof entry?.rollbackOutcome === 'string' && entry.rollbackOutcome ? entry.rollbackOutcome : null,
    error: typeof entry?.error === 'string' && entry.error ? entry.error : null,
    startedAt: typeof entry?.startedAt === 'string' && entry.startedAt ? entry.startedAt : new Date().toISOString(),
    finishedAt: typeof entry?.finishedAt === 'string' && entry.finishedAt ? entry.finishedAt : null,
  };
}

function normalizeManagedInstanceRolloutHistory(entries) {
  return (Array.isArray(entries) ? entries : []).map(normalizeManagedInstanceRolloutHistoryEntry).slice(-20);
}

export function appendManagedInstanceRolloutHistory(instance, entry) {
  const history = normalizeManagedInstanceRolloutHistory(instance?.rolloutHistory);
  const nextEntry = normalizeManagedInstanceRolloutHistoryEntry(entry);

  history.push(nextEntry);
  instance.rolloutHistory = history.slice(-20);

  return nextEntry;
}

export function buildManagedInstanceFleetSummary(instances = []) {
  const summary = {
    total: instances.length,
    active: 0,
    updating: 0,
    failed: 0,
    suspended: 0,
    expired: 0,
    healthy: 0,
    unhealthy: 0,
    rollbackReady: 0,
    lastGoodSha: null,
  };

  for (const instance of instances) {
    if (instance.status === 'active') {
      summary.active += 1;
    } else if (instance.status === 'updating' || instance.status === 'provisioning') {
      summary.updating += 1;
    } else if (instance.status === 'failed') {
      summary.failed += 1;
    } else if (instance.status === 'suspended') {
      summary.suspended += 1;
    } else if (instance.status === 'expired') {
      summary.expired += 1;
    }

    if (instance.lastHealthcheckStatus === 'healthy') {
      summary.healthy += 1;
    } else if (instance.lastHealthcheckStatus === 'unhealthy') {
      summary.unhealthy += 1;
    }

    if (instance.lastGoodGitSha && instance.status === 'failed') {
      summary.rollbackReady += 1;
    }

    if (!summary.lastGoodSha && instance.lastGoodGitSha) {
      summary.lastGoodSha = instance.lastGoodGitSha;
    }
  }

  return summary;
}

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
  const raw = String(value || '')
    .trim()
    .toLowerCase();

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

export function buildManagedInstancePagesEnvConfig({ hostedFreeRelayOrigin = '', runtimeControlPublicUrl = '' } = {}) {
  const envVars = {};

  if (String(hostedFreeRelayOrigin || '').trim()) {
    envVars.BOLT_HOSTED_FREE_RELAY_ORIGIN = {
      type: 'plain_text',
      value: String(hostedFreeRelayOrigin).trim(),
    };
  }

  if (String(runtimeControlPublicUrl || '').trim()) {
    envVars.BOLT_RUNTIME_CONTROL_PUBLIC_URL = {
      type: 'plain_text',
      value: String(runtimeControlPublicUrl).trim(),
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
    lastGoodGitSha: instance.lastGoodGitSha || null,
    lastRolloutAt: instance.lastRolloutAt || null,
    lastDeploymentUrl: instance.lastDeploymentUrl || null,
    lastGoodDeploymentUrl: instance.lastGoodDeploymentUrl || null,
    lastHealthcheckAt: instance.lastHealthcheckAt || null,
    lastHealthcheckStatus: instance.lastHealthcheckStatus || 'unknown',
    lastRollbackAt: instance.lastRollbackAt || null,
    lastRollbackOutcome: instance.lastRollbackOutcome || null,
    rolloutHistory: normalizeManagedInstanceRolloutHistory(instance.rolloutHistory),
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
        lastGoodGitSha:
          typeof instance.lastGoodGitSha === 'string' && instance.lastGoodGitSha
            ? instance.lastGoodGitSha
            : typeof instance.currentGitSha === 'string' && instance.currentGitSha
              ? instance.currentGitSha
              : null,
        lastRolloutAt:
          typeof instance.lastRolloutAt === 'string' && instance.lastRolloutAt ? instance.lastRolloutAt : null,
        lastDeploymentUrl:
          typeof instance.lastDeploymentUrl === 'string' && instance.lastDeploymentUrl
            ? instance.lastDeploymentUrl
            : null,
        lastGoodDeploymentUrl:
          typeof instance.lastGoodDeploymentUrl === 'string' && instance.lastGoodDeploymentUrl
            ? instance.lastGoodDeploymentUrl
            : typeof instance.lastDeploymentUrl === 'string' && instance.lastDeploymentUrl
              ? instance.lastDeploymentUrl
              : null,
        lastHealthcheckAt:
          typeof instance.lastHealthcheckAt === 'string' && instance.lastHealthcheckAt
            ? instance.lastHealthcheckAt
            : null,
        lastHealthcheckStatus:
          instance.lastHealthcheckStatus === 'healthy' || instance.lastHealthcheckStatus === 'unhealthy'
            ? instance.lastHealthcheckStatus
            : 'unknown',
        lastRollbackAt:
          typeof instance.lastRollbackAt === 'string' && instance.lastRollbackAt ? instance.lastRollbackAt : null,
        lastRollbackOutcome:
          typeof instance.lastRollbackOutcome === 'string' && instance.lastRollbackOutcome
            ? instance.lastRollbackOutcome
            : null,
        rolloutHistory: normalizeManagedInstanceRolloutHistory(instance.rolloutHistory),
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
    sessionSecretHash && registry.instances.find((instance) => instance.clientSessionSecretHash === sessionSecretHash);

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
    lastGoodGitSha: null,
    lastRolloutAt: null,
    lastDeploymentUrl: null,
    lastGoodDeploymentUrl: null,
    lastHealthcheckAt: null,
    lastHealthcheckStatus: 'unknown',
    lastRollbackAt: null,
    lastRollbackOutcome: null,
    rolloutHistory: [],
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
