#!/usr/bin/env node

import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import net from 'node:net';
import crypto from 'node:crypto';
import {
  createPreviewProbeCoordinator,
  extractPreviewPortFromOutput,
  normalizeStartCommand,
  parsePreviewProxyRequestTarget,
  rewritePreviewAssetUrls,
} from './runtime-preview.mjs';
import {
  appendManagedInstanceEvent,
  claimManagedInstanceTrial,
  getManagedInstanceBySessionSecret,
  hashManagedInstanceValue,
  normalizeManagedInstanceRegistry,
  sanitizeManagedInstanceForClient,
  slugifyManagedInstanceSubdomain,
} from './managed-instances.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SCRIPT_DIR = path.resolve(path.dirname(SCRIPT_PATH));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
const HOST = process.env.RUNTIME_HOST || '127.0.0.1';
const PORT = Number(process.env.RUNTIME_PORT || '4321');
const WORK_DIR = process.env.RUNTIME_WORK_DIR || '/home/project';
export function resolveRuntimeWorkspaceRoot(
  env = /** @type {Record<string, string | undefined>} */ (process.env),
  repoRoot = REPO_ROOT,
) {
  const explicitRoot = env.RUNTIME_WORKSPACE_DIR?.trim();

  if (explicitRoot) {
    return path.resolve(explicitRoot);
  }

  return path.resolve(path.dirname(repoRoot), `${path.basename(repoRoot)}-runtime-workspaces`);
}

const PERSIST_ROOT = resolveRuntimeWorkspaceRoot();
const NODE_OPTIONS = process.env.RUNTIME_NODE_OPTIONS || '--max-old-space-size=6142';
const PREVIEW_READY_TIMEOUT_MS = Number(process.env.RUNTIME_PREVIEW_READY_TIMEOUT_MS || '60000');
const COMMAND_TIMEOUT_MS = Number(process.env.RUNTIME_COMMAND_TIMEOUT_MS || '900000');
const PROJECT_MANIFEST_WAIT_MS = Number(process.env.RUNTIME_PROJECT_MANIFEST_WAIT_MS || '12000');
const PREVIEW_PROXY_UPSTREAM_TIMEOUT_MS = Number(process.env.RUNTIME_PREVIEW_PROXY_UPSTREAM_TIMEOUT_MS || '15000');
const PREVIEW_PORT_RANGE_START = Number(process.env.RUNTIME_PREVIEW_PORT_START || '4100');
const PREVIEW_PORT_RANGE_END = Number(process.env.RUNTIME_PREVIEW_PORT_END || '4999');
const MAX_PREVIEW_LOG_LINES = Number(process.env.RUNTIME_PREVIEW_LOG_LINES || '80');
const AUTO_RESTORE_DELAY_MS = Number(process.env.RUNTIME_PREVIEW_AUTO_RESTORE_DELAY_MS || '3500');
const POST_SYNC_PREVIEW_PROBE_DELAY_MS = Number(process.env.RUNTIME_PREVIEW_PROBE_DELAY_MS || '1200');
const POST_SYNC_PREVIEW_PROBE_WINDOW_MS = Number(process.env.RUNTIME_PREVIEW_PROBE_WINDOW_MS || '12000');
const POST_SYNC_PREVIEW_PROBE_INTERVAL_MS = Number(process.env.RUNTIME_PREVIEW_PROBE_INTERVAL_MS || '1500');
const PREVIEW_PROXY_RETRY_DELAYS_MS = [200, 500, 1000, 1500];
const PRESERVED_DIRS = new Set(['node_modules', '.git', '.next', 'dist', 'build', 'coverage']);
const PREVIEW_ERROR_PATTERNS = [
  /\[plugin:vite:[^\]]+\]/i,
  /Pre-transform error/i,
  /Transform failed with \d+ error/i,
  /Failed to resolve import/i,
  /Failed to scan for dependencies from entries/i,
  /Unexpected token/i,
  /Expected [^\n]+ but found end of file/i,
  /PREVIEW_UNCAUGHT_EXCEPTION/i,
  /PREVIEW_UNHANDLED_REJECTION/i,
  /ELIFECYCLE/i,
  /Command failed/i,
  /error when starting dev server/i,
  /Uncaught\s+(?:Error|TypeError|ReferenceError|SyntaxError|RangeError)/i,
  /Unhandled\s+Promise\s+Rejection/i,
];
const TENANT_REGISTRY_PATH =
  process.env.RUNTIME_TENANT_REGISTRY_PATH || path.join(PERSIST_ROOT, 'tenant-registry.json');
const TENANT_INVITE_TTL_MS = Number(process.env.RUNTIME_TENANT_INVITE_TTL_MS || `${72 * 60 * 60 * 1000}`);
const MANAGED_INSTANCE_REGISTRY_PATH =
  process.env.RUNTIME_MANAGED_INSTANCE_REGISTRY_PATH || path.join(PERSIST_ROOT, 'managed-instance-registry.json');
const MANAGED_INSTANCE_TRIAL_DAYS = Number(process.env.RUNTIME_MANAGED_INSTANCE_TRIAL_DAYS || '15');
const MANAGED_INSTANCE_ROOT_DOMAIN = process.env.RUNTIME_MANAGED_INSTANCE_ROOT_DOMAIN || 'pages.dev';
const MANAGED_INSTANCE_SOURCE_BRANCH = process.env.RUNTIME_MANAGED_INSTANCE_SOURCE_BRANCH || 'main';
const MANAGED_INSTANCE_DEPLOY_DIR =
  process.env.RUNTIME_MANAGED_INSTANCE_DEPLOY_DIR || path.join(REPO_ROOT, 'build', 'client');
const MANAGED_INSTANCE_SYNC_INTERVAL_MS = Number(process.env.RUNTIME_MANAGED_INSTANCE_SYNC_INTERVAL_MS || '600000');
const MANAGED_INSTANCE_DELETE_ON_SUSPEND = process.env.RUNTIME_MANAGED_INSTANCE_DELETE_ON_SUSPEND === '1';
const MANAGED_INSTANCE_PUBLIC_ENABLED = process.env.RUNTIME_MANAGED_INSTANCE_ENABLED !== 'false';

const sessions = new Map();
const managedInstanceLocks = new Map();
let managedInstanceSyncTimer = null;

const PROJECT_MANIFEST_FILES = ['package.json', 'package.json5', 'package.yaml'];
const SOURCE_IMPORT_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.mts', '.cts']);
const STYLE_IMPORT_EXTENSIONS = new Set(['.css', '.scss', '.sass', '.less']);
const LEGACY_TAILWIND_DIRECTIVE_RE =
  /^\s*(?:@import\s+['"]tailwindcss\/(?:base|components|utilities)['"]\s*;|@tailwind\s+(?:base|components|utilities)\s*;)\s*$/gim;

function hashTenantSecret(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function createTenantInviteToken() {
  return crypto.randomBytes(24).toString('hex');
}

function createRandomTenantPassword() {
  return crypto.randomBytes(18).toString('hex');
}

function createTenantInviteExpiry() {
  return new Date(Date.now() + TENANT_INVITE_TTL_MS).toISOString();
}

function createWorkspaceDependencyFingerprint(packageJsonRaw, lockfileRaw = '') {
  return crypto.createHash('sha256').update(`${packageJsonRaw}\n---lockfile---\n${lockfileRaw}`).digest('hex');
}

function slugifyTenantName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function buildTenantSlug(name, email, existingTenants = []) {
  const base = slugifyTenantName(name) || slugifyTenantName(String(email || '').split('@')[0]) || 'tenant';
  const existing = new Set(existingTenants.map((tenant) => tenant.slug).filter(Boolean));

  if (!existing.has(base)) {
    return base;
  }

  let suffix = 2;

  while (existing.has(`${base}-${suffix}`)) {
    suffix += 1;
  }

  return `${base}-${suffix}`;
}

function buildTenantWorkspaceDir(slug) {
  return path.join(PERSIST_ROOT, 'tenants', slug);
}

function isLikelyValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function appendTenantAuditEvent(registry, event) {
  const nextEvents = Array.isArray(registry.auditTrail) ? registry.auditTrail.slice(-199) : [];

  nextEvents.push({
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    ...event,
  });

  registry.auditTrail = nextEvents;
}

function sanitizeTenantForClient(tenant) {
  return {
    id: tenant.id,
    name: tenant.name,
    email: tenant.email,
    slug: tenant.slug,
    workspaceDir: tenant.workspaceDir,
    createdAt: tenant.createdAt,
    updatedAt: tenant.updatedAt,
    passwordUpdatedAt: tenant.passwordUpdatedAt,
    status: tenant.status,
    lastLoginAt: tenant.lastLoginAt,
    mustChangePassword: tenant.mustChangePassword !== false,
    inviteExpiresAt: tenant.inviteExpiresAt || null,
    inviteIssuedAt: tenant.inviteIssuedAt || null,
    invitePurpose: tenant.invitePurpose || null,
    approvedAt: tenant.approvedAt || null,
    approvedBy: tenant.approvedBy || null,
    disabledAt: tenant.disabledAt || null,
    disabledBy: tenant.disabledBy || null,
  };
}

function createDefaultTenantAdmin() {
  return {
    username: 'admin',
    passwordHash: hashTenantSecret('admin'),
    mustChangePassword: true,
    updatedAt: new Date().toISOString(),
    lastLoginAt: null,
  };
}

export function normalizeTenantRegistry(input) {
  const now = new Date().toISOString();
  const admin = input?.admin || {};
  const tenants = Array.isArray(input?.tenants) ? input.tenants : [];

  return {
    admin: {
      username: typeof admin.username === 'string' && admin.username.trim() ? admin.username.trim() : 'admin',
      passwordHash:
        typeof admin.passwordHash === 'string' && admin.passwordHash.trim()
          ? admin.passwordHash.trim()
          : hashTenantSecret('admin'),
      mustChangePassword: admin.mustChangePassword !== false,
      updatedAt: typeof admin.updatedAt === 'string' && admin.updatedAt ? admin.updatedAt : now,
      passwordUpdatedAt:
        typeof admin.passwordUpdatedAt === 'string' && admin.passwordUpdatedAt ? admin.passwordUpdatedAt : now,
      lastLoginAt: typeof admin.lastLoginAt === 'string' ? admin.lastLoginAt : null,
    },
    tenants: tenants.map((tenant) => {
      const normalizedName = String(tenant.name || 'Untitled Tenant');
      const normalizedEmail = String(tenant.email || '')
        .trim()
        .toLowerCase();
      const slug =
        typeof tenant.slug === 'string' && tenant.slug.trim()
          ? tenant.slug.trim()
          : slugifyTenantName(normalizedName) || 'tenant';

      return {
        id: String(tenant.id || Date.now()),
        name: normalizedName,
        email: normalizedEmail,
        slug,
        workspaceDir:
          typeof tenant.workspaceDir === 'string' && tenant.workspaceDir.trim()
            ? tenant.workspaceDir.trim()
            : buildTenantWorkspaceDir(slug),
        passwordHash: typeof tenant.passwordHash === 'string' ? tenant.passwordHash : hashTenantSecret('changeme'),
        createdAt: typeof tenant.createdAt === 'string' && tenant.createdAt ? tenant.createdAt : now,
        updatedAt: typeof tenant.updatedAt === 'string' && tenant.updatedAt ? tenant.updatedAt : now,
        passwordUpdatedAt:
          typeof tenant.passwordUpdatedAt === 'string' && tenant.passwordUpdatedAt ? tenant.passwordUpdatedAt : now,
        status: ['pending', 'disabled', 'active'].includes(tenant.status) ? tenant.status : 'active',
        lastLoginAt: typeof tenant.lastLoginAt === 'string' ? tenant.lastLoginAt : null,
        mustChangePassword: tenant.mustChangePassword !== false,
        inviteToken: typeof tenant.inviteToken === 'string' && tenant.inviteToken ? tenant.inviteToken : null,
        inviteExpiresAt:
          typeof tenant.inviteExpiresAt === 'string' && tenant.inviteExpiresAt ? tenant.inviteExpiresAt : null,
        inviteIssuedAt:
          typeof tenant.inviteIssuedAt === 'string' && tenant.inviteIssuedAt ? tenant.inviteIssuedAt : null,
        invitePurpose:
          tenant.invitePurpose === 'password-reset' || tenant.invitePurpose === 'onboarding'
            ? tenant.invitePurpose
            : null,
        approvedAt: typeof tenant.approvedAt === 'string' && tenant.approvedAt ? tenant.approvedAt : null,
        approvedBy: typeof tenant.approvedBy === 'string' && tenant.approvedBy ? tenant.approvedBy : null,
        disabledAt: typeof tenant.disabledAt === 'string' && tenant.disabledAt ? tenant.disabledAt : null,
        disabledBy: typeof tenant.disabledBy === 'string' && tenant.disabledBy ? tenant.disabledBy : null,
      };
    }),
    auditTrail: Array.isArray(input?.auditTrail) ? input.auditTrail.slice(-200) : [],
  };
}

function findTenantByInviteToken(registry, token) {
  const normalized = String(token || '').trim();

  if (!normalized) {
    return null;
  }

  return registry.tenants.find((tenant) => tenant.inviteToken === normalized) || null;
}

async function ensureTenantRegistry() {
  try {
    const raw = await fs.readFile(TENANT_REGISTRY_PATH, 'utf8');
    const registry = normalizeTenantRegistry(JSON.parse(raw));
    await writeTenantRegistry(registry);
    return registry;
  } catch {
    await fs.mkdir(path.dirname(TENANT_REGISTRY_PATH), { recursive: true });
    const registry = normalizeTenantRegistry({
      admin: createDefaultTenantAdmin(),
      tenants: [],
    });
    await fs.writeFile(TENANT_REGISTRY_PATH, JSON.stringify(registry, null, 2), 'utf8');
    return registry;
  }
}

async function writeTenantRegistry(registry) {
  await fs.mkdir(path.dirname(TENANT_REGISTRY_PATH), { recursive: true });
  await fs.writeFile(TENANT_REGISTRY_PATH, JSON.stringify(registry, null, 2), 'utf8');
}

function getManagedInstanceCloudflareConfig() {
  const apiToken = process.env.CLOUDFLARE_API_TOKEN?.trim() || '';
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim() || '';

  return {
    enabled: MANAGED_INSTANCE_PUBLIC_ENABLED && Boolean(apiToken && accountId),
    apiToken,
    accountId,
    rootDomain: MANAGED_INSTANCE_ROOT_DOMAIN,
    sourceBranch: MANAGED_INSTANCE_SOURCE_BRANCH,
  };
}

function buildManagedInstanceSupportState() {
  const config = getManagedInstanceCloudflareConfig();

  if (!MANAGED_INSTANCE_PUBLIC_ENABLED) {
    return {
      supported: false,
      reason: 'Managed Cloudflare trial instances are disabled on this deployment.',
      trialDays: MANAGED_INSTANCE_TRIAL_DAYS,
      rootDomain: MANAGED_INSTANCE_ROOT_DOMAIN,
      sourceBranch: MANAGED_INSTANCE_SOURCE_BRANCH,
    };
  }

  if (!config.enabled) {
    return {
      supported: false,
      reason:
        'Cloudflare managed trial instances are not configured yet. Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID on the runtime service.',
      trialDays: MANAGED_INSTANCE_TRIAL_DAYS,
      rootDomain: MANAGED_INSTANCE_ROOT_DOMAIN,
      sourceBranch: MANAGED_INSTANCE_SOURCE_BRANCH,
    };
  }

  return {
    supported: true,
    reason: null,
    trialDays: MANAGED_INSTANCE_TRIAL_DAYS,
    rootDomain: MANAGED_INSTANCE_ROOT_DOMAIN,
    sourceBranch: MANAGED_INSTANCE_SOURCE_BRANCH,
  };
}

async function ensureManagedInstanceRegistry() {
  try {
    const raw = await fs.readFile(MANAGED_INSTANCE_REGISTRY_PATH, 'utf8');
    const registry = normalizeManagedInstanceRegistry(JSON.parse(raw), { defaultRootDomain: MANAGED_INSTANCE_ROOT_DOMAIN });
    await writeManagedInstanceRegistry(registry);
    return registry;
  } catch {
    await fs.mkdir(path.dirname(MANAGED_INSTANCE_REGISTRY_PATH), { recursive: true });
    const registry = normalizeManagedInstanceRegistry(
      {
        rootDomain: MANAGED_INSTANCE_ROOT_DOMAIN,
        instances: [],
        events: [],
      },
      { defaultRootDomain: MANAGED_INSTANCE_ROOT_DOMAIN },
    );
    await fs.writeFile(MANAGED_INSTANCE_REGISTRY_PATH, JSON.stringify(registry, null, 2), 'utf8');
    return registry;
  }
}

async function writeManagedInstanceRegistry(registry) {
  await fs.mkdir(path.dirname(MANAGED_INSTANCE_REGISTRY_PATH), { recursive: true });
  await fs.writeFile(MANAGED_INSTANCE_REGISTRY_PATH, JSON.stringify(registry, null, 2), 'utf8');
}

async function runManagedInstanceProcess(command, args, { cwd = REPO_ROOT, env = {} } = {}) {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: {
        ...process.env,
        NODE_OPTIONS,
        ...env,
      },
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', reject);
    child.on('close', (code) => {
      resolve({
        code: Number(code || 0),
        stdout,
        stderr,
      });
    });
  });
}

let cachedManagedGitSha = {
  value: null,
  expiresAt: 0,
};

async function resolveCurrentGitSha() {
  const now = Date.now();

  if (cachedManagedGitSha.value && cachedManagedGitSha.expiresAt > now) {
    return cachedManagedGitSha.value;
  }

  const envSha =
    process.env.CF_PAGES_COMMIT_SHA?.trim() || process.env.GITHUB_SHA?.trim() || process.env.BOLT_RELEASE_SHA?.trim();

  if (envSha) {
    cachedManagedGitSha = {
      value: envSha,
      expiresAt: now + 30000,
    };
    return envSha;
  }

  const result = await runManagedInstanceProcess('git', ['rev-parse', 'HEAD']);

  if (result.code !== 0) {
    throw new Error(result.stderr.trim() || 'Unable to resolve current git SHA.');
  }

  cachedManagedGitSha = {
    value: result.stdout.trim(),
    expiresAt: now + 30000,
  };

  return cachedManagedGitSha.value;
}

async function fetchCloudflarePagesProject(projectName) {
  const config = getManagedInstanceCloudflareConfig();

  if (!config.enabled) {
    throw new Error('Cloudflare managed instances are not configured on this runtime.');
  }

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(config.accountId)}/pages/projects/${encodeURIComponent(projectName)}`,
    {
      headers: {
        Authorization: `Bearer ${config.apiToken}`,
      },
    },
  );

  if (response.status === 404) {
    return null;
  }

  const payload = await response.json();

  if (!response.ok || payload?.success === false) {
    const apiError = Array.isArray(payload?.errors) && payload.errors[0]?.message ? payload.errors[0].message : null;
    throw new Error(apiError || `Cloudflare project lookup failed with status ${response.status}.`);
  }

  return payload?.result || null;
}

async function ensureManagedInstanceProjectExists(instance) {
  const existingProject = await fetchCloudflarePagesProject(instance.projectName);

  if (existingProject) {
    return existingProject;
  }

  const config = getManagedInstanceCloudflareConfig();
  const result = await runManagedInstanceProcess(
    'pnpm',
    ['exec', 'wrangler', 'pages', 'project', 'create', instance.projectName, '--production-branch', config.sourceBranch],
    {
      env: {
        CLOUDFLARE_API_TOKEN: config.apiToken,
        CLOUDFLARE_ACCOUNT_ID: config.accountId,
      },
    },
  );

  if (result.code !== 0) {
    const combinedOutput = `${result.stdout}\n${result.stderr}`;

    if (!/already exists/i.test(combinedOutput)) {
      throw new Error(combinedOutput.trim() || `Failed to create Cloudflare Pages project "${instance.projectName}".`);
    }
  }

  return await fetchCloudflarePagesProject(instance.projectName);
}

async function deployManagedInstanceProject(instance, reason = 'manual-refresh') {
  const config = getManagedInstanceCloudflareConfig();
  const gitSha = await resolveCurrentGitSha();

  await fs.access(MANAGED_INSTANCE_DEPLOY_DIR, fsConstants.R_OK);
  await ensureManagedInstanceProjectExists(instance);

  const result = await runManagedInstanceProcess(
    'pnpm',
    [
      'exec',
      'wrangler',
      'pages',
      'deploy',
      MANAGED_INSTANCE_DEPLOY_DIR,
      '--project-name',
      instance.projectName,
      '--branch',
      config.sourceBranch,
      '--commit-hash',
      gitSha,
      '--commit-message',
      `[managed-instance] ${reason}: ${instance.projectName}`,
    ],
    {
      env: {
        CLOUDFLARE_API_TOKEN: config.apiToken,
        CLOUDFLARE_ACCOUNT_ID: config.accountId,
      },
    },
  );

  if (result.code !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || 'Cloudflare deployment failed.');
  }

  const deploymentUrlMatch = `${result.stdout}\n${result.stderr}`.match(/https:\/\/[a-z0-9.-]+\.pages\.dev/gi);

  return {
    gitSha,
    deploymentUrl: deploymentUrlMatch?.at(-1) || `https://${instance.routeHostname}`,
  };
}

function getManagedInstanceLockKey(instance) {
  return instance?.projectName || instance?.clientKeyHash || 'managed-instance';
}

async function runManagedInstanceOperation(lockKey, operation) {
  const previous = managedInstanceLocks.get(lockKey) || Promise.resolve();
  let release;
  const next = new Promise((resolve) => {
    release = resolve;
  });
  managedInstanceLocks.set(lockKey, previous.finally(() => next));

  await previous;

  try {
    return await operation();
  } finally {
    release();

    if (managedInstanceLocks.get(lockKey) === next) {
      managedInstanceLocks.delete(lockKey);
    }
  }
}

async function expireManagedInstanceIfRequired(registry, instance, { actor = 'system' } = {}) {
  if (!instance?.trialEndsAt || !['active', 'failed', 'provisioning', 'updating'].includes(instance.status)) {
    return false;
  }

  if (Date.parse(instance.trialEndsAt) > Date.now()) {
    return false;
  }

  instance.status = 'expired';
  instance.updatedAt = new Date().toISOString();
  instance.expiredAt = new Date().toISOString();
  instance.lastError = 'The 15-day experimental managed instance trial has expired.';
  appendManagedInstanceEvent(registry, {
    actor,
    action: 'managed-instance.expired',
    target: instance.routeHostname,
  });

  if (MANAGED_INSTANCE_DELETE_ON_SUSPEND && getManagedInstanceCloudflareConfig().enabled) {
    try {
      const config = getManagedInstanceCloudflareConfig();
      await runManagedInstanceProcess(
        'pnpm',
        ['exec', 'wrangler', 'pages', 'project', 'delete', instance.projectName, '--yes'],
        {
          env: {
            CLOUDFLARE_API_TOKEN: config.apiToken,
            CLOUDFLARE_ACCOUNT_ID: config.accountId,
          },
        },
      );
    } catch {}
  }

  return true;
}

async function maybeExpireManagedInstances(registry, { actor = 'system' } = {}) {
  let changed = false;

  for (const instance of registry.instances) {
    const didExpire = await expireManagedInstanceIfRequired(registry, instance, { actor });

    if (didExpire) {
      changed = true;
    }
  }

  if (changed) {
    await writeManagedInstanceRegistry(registry);
  }

  return changed;
}

async function refreshManagedInstanceFromCurrentBuild(registry, instance, { actor = 'system', reason = 'refresh' } = {}) {
  return await runManagedInstanceOperation(getManagedInstanceLockKey(instance), async () => {
    instance.status = instance.currentGitSha ? 'updating' : 'provisioning';
    instance.updatedAt = new Date().toISOString();
    instance.lastError = null;
    await writeManagedInstanceRegistry(registry);

    try {
      const deployment = await deployManagedInstanceProject(instance, reason);

      instance.previousGitSha = instance.currentGitSha || null;
      instance.currentGitSha = deployment.gitSha;
      instance.lastRolloutAt = new Date().toISOString();
      instance.updatedAt = new Date().toISOString();
      instance.lastDeploymentUrl = deployment.deploymentUrl;
      instance.lastError = null;
      instance.status = 'active';
      appendManagedInstanceEvent(registry, {
        actor,
        action: instance.previousGitSha ? 'managed-instance.rollout' : 'managed-instance.provisioned',
        target: instance.routeHostname,
        details: {
          gitSha: deployment.gitSha,
        },
      });
      await writeManagedInstanceRegistry(registry);
      return instance;
    } catch (error) {
      instance.status = 'failed';
      instance.updatedAt = new Date().toISOString();
      instance.lastError = error instanceof Error ? error.message : 'Cloudflare deployment failed.';
      appendManagedInstanceEvent(registry, {
        actor,
        action: 'managed-instance.failed',
        target: instance.routeHostname,
        details: {
          error: instance.lastError,
        },
      });
      await writeManagedInstanceRegistry(registry);
      throw error;
    }
  });
}

async function rolloutManagedInstancesToCurrentBuild({ reason = 'auto-rollout', actor = 'system' } = {}) {
  const support = buildManagedInstanceSupportState();

  if (!support.supported) {
    return;
  }

  const registry = await ensureManagedInstanceRegistry();
  await maybeExpireManagedInstances(registry, { actor });
  const gitSha = await resolveCurrentGitSha();

  for (const instance of registry.instances) {
    if (instance.status === 'expired' || instance.status === 'suspended') {
      continue;
    }

    if (instance.currentGitSha === gitSha && instance.status === 'active') {
      continue;
    }

    await refreshManagedInstanceFromCurrentBuild(registry, instance, { actor, reason });
  }
}

function findManagedInstanceBySlug(registry, slug) {
  const normalizedSlug = slugifyManagedInstanceSubdomain(slug);

  return registry.instances.find((instance) => instance.projectName === normalizedSlug) || null;
}

function managedInstanceSessionMatches(instance, sessionSecret) {
  const normalizedSecret = String(sessionSecret || '').trim();

  if (!instance || !normalizedSecret || !instance.clientSessionSecretHash) {
    return false;
  }

  return hashManagedInstanceValue(normalizedSecret) === instance.clientSessionSecretHash;
}

function sendJson(res, status, payload, extraHeaders = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    ...extraHeaders,
  });
  res.end(JSON.stringify(payload));
}

function sendText(res, status, text, extraHeaders = {}) {
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    ...extraHeaders,
  });
  res.end(text);
}

export function applyPreviewResponseHeaders(rawHeaders = {}) {
  const headers = { ...rawHeaders };

  delete headers['x-frame-options'];
  delete headers['X-Frame-Options'];
  delete headers['content-security-policy'];
  delete headers['Content-Security-Policy'];
  delete headers['content-security-policy-report-only'];
  delete headers['Content-Security-Policy-Report-Only'];

  return {
    ...headers,
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
    'Cross-Origin-Opener-Policy': 'same-origin',
  };
}

export function shouldRetryPreviewProxyResponse({ method = 'GET', statusCode = 0, attempt = 0 } = {}) {
  const normalizedMethod = String(method || 'GET').toUpperCase();

  if (normalizedMethod !== 'GET' && normalizedMethod !== 'HEAD') {
    return false;
  }

  if (![502, 503, 504].includes(Number(statusCode))) {
    return false;
  }

  return attempt >= 0 && attempt < PREVIEW_PROXY_RETRY_DELAYS_MS.length;
}

function normalizePreviewText(value) {
  return String(value || '')
    .replace(/\u001b\[[0-9;]*m/g, '')
    .replace(/\u0000/g, '')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function pickPreviewAlertDescription(combinedText) {
  const lines = combinedText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const preferredMatchers = [
    /\[plugin:vite:[^\]]+\].+/i,
    /Pre-transform error.+/i,
    /Transform failed with \d+ error/i,
    /Failed to resolve import.+/i,
    /Failed to scan for dependencies.+/i,
    /Missing ["'][^"']+["'] specifier.+/i,
    /Unexpected token.+/i,
    /Expected .+ but found.+/i,
    /Uncaught\s+(?:Error|TypeError|ReferenceError|SyntaxError|RangeError).+/i,
    /Unhandled\s+Promise\s+Rejection.+/i,
  ];

  for (const matcher of preferredMatchers) {
    const match = lines.find((line) => matcher.test(line));

    if (match) {
      return match;
    }
  }

  const fileLocationLine = lines.find((line) => /\/src\/.+:\d+:\d+/i.test(line) || /file:\s*\/.+:\d+:\d+/i.test(line));

  if (fileLocationLine) {
    return fileLocationLine;
  }

  return lines[0] || 'Preview failed to compile or run.';
}

function extractPreviewAlertFromText(rawText) {
  const combinedText = normalizePreviewText(rawText);

  if (!combinedText) {
    return null;
  }

  if (!PREVIEW_ERROR_PATTERNS.some((pattern) => pattern.test(combinedText))) {
    return null;
  }

  return {
    type: 'error',
    title: 'Preview Error',
    description: pickPreviewAlertDescription(combinedText).slice(0, 220),
    content: combinedText.slice(0, 5000),
    source: 'preview',
  };
}

function createPreviewDiagnostics(status = 'idle') {
  return {
    status,
    healthy: false,
    updatedAt: null,
    recentLogs: [],
    alert: null,
  };
}

function createPreviewRecoveryState() {
  return {
    state: 'idle',
    token: 0,
    message: null,
    updatedAt: null,
  };
}

export function buildPreviewStateSummary(session) {
  return {
    sessionId: session.id,
    preview: session.preview || null,
    status: session.previewDiagnostics.status,
    healthy: session.previewDiagnostics.healthy,
    updatedAt: session.previewDiagnostics.updatedAt,
    alert: session.previewDiagnostics.alert,
    recovery: session.previewRecovery,
  };
}

function writePreviewStateEvent(target, payload) {
  target.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function broadcastPreviewState(session) {
  if (!session.previewSubscribers || session.previewSubscribers.size === 0) {
    return;
  }

  const payload = buildPreviewStateSummary(session);

  for (const subscriber of session.previewSubscribers) {
    try {
      writePreviewStateEvent(subscriber, payload);
    } catch {
      session.previewSubscribers.delete(subscriber);
    }
  }
}

function touchPreviewDiagnostics(session, nextState) {
  session.previewDiagnostics = {
    ...session.previewDiagnostics,
    ...nextState,
    updatedAt: new Date().toISOString(),
  };
  broadcastPreviewState(session);
}

function clearPreviewDiagnostics(session, status = 'idle') {
  session.previewDiagnostics = createPreviewDiagnostics(status);
  broadcastPreviewState(session);
}

function setPreviewRecoveryState(session, state, message = null) {
  const previous = session.previewRecovery || createPreviewRecoveryState();

  session.previewRecovery = {
    state,
    token: previous.token + 1,
    message,
    updatedAt: new Date().toISOString(),
  };
  broadcastPreviewState(session);
}

function clearPreviewRecoveryState(session) {
  session.previewRecovery = {
    ...(session.previewRecovery || createPreviewRecoveryState()),
    state: 'idle',
    message: null,
    updatedAt: new Date().toISOString(),
  };
  broadcastPreviewState(session);
}

function cloneFileMap(fileMap) {
  return JSON.parse(JSON.stringify(fileMap || {}));
}

export function mergeWorkspaceFileMap(currentFileMap, incomingFileMap, options = {}) {
  const { prune = false } = options;
  const nextFileMap = prune ? {} : cloneFileMap(currentFileMap || {});

  for (const [filePath, dirent] of Object.entries(incomingFileMap || {})) {
    if (dirent === undefined || dirent === null) {
      delete nextFileMap[filePath];
      continue;
    }

    nextFileMap[filePath] = { ...dirent };
  }

  return nextFileMap;
}

function appendPreviewDiagnosticEntries(session, channel, rawText) {
  const normalized = normalizePreviewText(rawText);

  if (!normalized) {
    return session.previewDiagnostics.recentLogs;
  }

  const nextLogs = [
    ...session.previewDiagnostics.recentLogs,
    ...normalized
      .split('\n')
      .filter(Boolean)
      .map((line) => `[${channel}] ${line}`),
  ].slice(-MAX_PREVIEW_LOG_LINES);

  touchPreviewDiagnostics(session, {
    recentLogs: nextLogs,
  });

  return nextLogs;
}

function cancelPendingPreviewAutoRestore(session) {
  if (session.autoRestoreTimer) {
    clearTimeout(session.autoRestoreTimer);
    session.autoRestoreTimer = null;
  }
}

function cancelPendingPreviewVerification(session) {
  if (session.previewVerificationTimer) {
    clearTimeout(session.previewVerificationTimer);
    session.previewVerificationTimer = null;
  }
}

function cancelPendingPreviewAutostart(session) {
  if (session.previewAutostartTimer) {
    clearTimeout(session.previewAutostartTimer);
    session.previewAutostartTimer = null;
  }
}

function buildPreviewAlertFingerprint(alert) {
  if (!alert) {
    return '';
  }

  return `${alert.title}\n${alert.description}\n${String(alert.content || '').slice(0, 2000)}`;
}

function markSessionMutationStart(session) {
  cancelPendingPreviewAutoRestore(session);
  cancelPendingPreviewVerification(session);
  cancelPendingPreviewAutostart(session);
  session.workspaceMutationId = Number(session.workspaceMutationId || 0) + 1;
  session.lastAutoRestoreFingerprint = null;

  if (session.previewDiagnostics.healthy && session.currentFileMap && Object.keys(session.currentFileMap).length > 0) {
    session.restorePointFileMap = cloneFileMap(session.currentFileMap);
  }

  clearPreviewRecoveryState(session);
  touchPreviewDiagnostics(session, {
    status: session.preview ? 'starting' : session.previewDiagnostics.status,
    healthy: false,
    alert: null,
  });
}

export async function probeSessionPreviewHealth(session, requestPath = '/') {
  const port = Number(session.preview?.port || 0);
  const existingAlert = requestPath === '/' ? session.previewDiagnostics?.alert || null : null;

  if (!Number.isFinite(port) || port <= 0) {
    return {
      healthy: false,
      statusCode: 0,
      alert: {
        type: 'error',
        title: 'Preview Error',
        description: 'Preview is not running on the hosted runtime.',
        content: 'The hosted runtime has no active preview port for this session.',
        source: 'preview',
      },
    };
  }

  try {
    const response = await fetch(`http://${HOST}:${port}${requestPath}`, {
      redirect: 'manual',
      signal: AbortSignal.timeout(PREVIEW_PROXY_UPSTREAM_TIMEOUT_MS),
    });
    const contentType = String(response.headers.get('content-type') || '');
    const shouldReadBody =
      /text\/html|javascript|ecmascript|text\/css/.test(contentType) ||
      requestPath === '/' ||
      requestPath.endsWith('.html');
    const body = shouldReadBody ? await response.text() : '';
    const alert =
      extractPreviewAlertFromText(body) ||
      existingAlert ||
      (response.status >= 500
        ? {
            type: 'error',
            title: 'Preview Error',
            description: `Preview request failed with status ${response.status}`,
            content:
              normalizePreviewText(body) || `Preview request to ${requestPath} failed with status ${response.status}.`,
            source: 'preview',
          }
        : null);

    return {
      healthy: !alert && response.status >= 200 && response.status < 400,
      statusCode: response.status,
      alert,
    };
  } catch (error) {
    return {
      healthy: false,
      statusCode: 0,
      alert: {
        type: 'error',
        title: 'Preview Error',
        description: error instanceof Error ? error.message : 'Preview health probe failed.',
        content: `Hosted preview probe for ${requestPath} failed.`,
        source: 'preview',
      },
    };
  }
}

export async function restoreSessionLastKnownGoodWorkspace(session, reason = 'preview-error') {
  if (!session.restorePointFileMap || session.autoRestoreInFlight) {
    return false;
  }

  session.autoRestoreInFlight = true;
  setPreviewRecoveryState(
    session,
    'running',
    'The hosted runtime is restoring the last known working workspace after a preview failure.',
  );
  appendPreviewDiagnosticEntries(
    session,
    'recovery',
    `Restoring the last known working workspace snapshot after ${reason}.`,
  );
  touchPreviewDiagnostics(session, {
    status: 'starting',
    healthy: false,
    alert: {
      type: 'info',
      title: 'Preview Recovery In Progress',
      description: 'The hosted runtime is restoring the last known working workspace.',
      content: `Recovery reason: ${reason}.`,
      source: 'preview',
    },
  });

  try {
    await syncWorkspaceSnapshot(session, session.restorePointFileMap, { prune: false });
    session.currentFileMap = cloneFileMap(session.restorePointFileMap);
    let previewRecovered = false;

    if (Number.isFinite(Number(session.preview?.port)) && Number(session.preview?.port) > 0) {
      try {
        await waitForPreview(Number(session.preview.port));
        clearPreviewDiagnostics(session, session.preview ? 'ready' : 'idle');
        appendPreviewDiagnosticEntries(
          session,
          'recovery',
          'Preview is healthy again after restoring the last known working workspace snapshot.',
        );
        touchPreviewDiagnostics(session, {
          status: session.preview ? 'ready' : 'idle',
          healthy: true,
          alert: null,
        });
        previewRecovered = true;
      } catch (error) {
        appendPreviewDiagnosticEntries(
          session,
          'recovery',
          `Workspace snapshot restored, but the preview is still warming up: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
      }
    }

    if (!previewRecovered) {
      appendPreviewDiagnosticEntries(
        session,
        'recovery',
        'Last known working workspace snapshot restored. Waiting for the preview to become healthy again.',
      );
    }

    setPreviewRecoveryState(session, 'restored', 'The last known working workspace snapshot has been restored.');

    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to restore the last known working workspace.';
    appendPreviewDiagnosticEntries(session, 'recovery', `Restore failed: ${message}`);
    touchPreviewDiagnostics(session, {
      status: 'error',
      healthy: false,
      alert: {
        type: 'error',
        title: 'Preview Recovery Failed',
        description: 'The hosted runtime could not restore the last known working workspace.',
        content: message,
        source: 'preview',
      },
    });

    return false;
  } finally {
    session.autoRestoreInFlight = false;
  }
}

function schedulePreviewAutoRestore(session, alert) {
  if (!session.restorePointFileMap || session.autoRestoreInFlight) {
    return;
  }

  const fingerprint = buildPreviewAlertFingerprint(alert);

  if (!fingerprint || session.lastAutoRestoreFingerprint === fingerprint) {
    return;
  }

  cancelPendingPreviewAutoRestore(session);
  const mutationId = session.workspaceMutationId;
  session.autoRestoreTimer = setTimeout(() => {
    session.autoRestoreTimer = null;

    void (async () => {
      if (session.autoRestoreInFlight || session.workspaceMutationId !== mutationId) {
        return;
      }

      const probe = await probeSessionPreviewHealth(session);

      if (session.autoRestoreInFlight || session.workspaceMutationId !== mutationId) {
        return;
      }

      if (!probe.alert) {
        if (probe.healthy) {
          touchPreviewDiagnostics(session, {
            status: session.preview ? 'ready' : 'idle',
            healthy: true,
            alert: null,
          });
        }

        return;
      }

      touchPreviewDiagnostics(session, {
        status: 'error',
        healthy: false,
        alert: probe.alert,
      });
      session.lastAutoRestoreFingerprint = fingerprint;
      await restoreSessionLastKnownGoodWorkspace(session, 'a preview compilation failure');
    })();
  }, AUTO_RESTORE_DELAY_MS);
}

function schedulePreviewVerificationAfterMutation(session, reason = 'a workspace update') {
  if (!session.preview || !session.restorePointFileMap || session.autoRestoreInFlight) {
    return;
  }

  cancelPendingPreviewVerification(session);
  const mutationId = session.workspaceMutationId;

  session.previewVerificationTimer = setTimeout(() => {
    session.previewVerificationTimer = null;

    void (async () => {
      const deadline = Date.now() + POST_SYNC_PREVIEW_PROBE_WINDOW_MS;

      while (Date.now() < deadline) {
        if (session.autoRestoreInFlight || session.workspaceMutationId !== mutationId) {
          return;
        }

        const probe = await probeSessionPreviewHealth(session);

        if (session.autoRestoreInFlight || session.workspaceMutationId !== mutationId) {
          return;
        }

        if (probe.alert) {
          appendPreviewDiagnosticEntries(
            session,
            'probe',
            `Detected preview failure after ${reason}: ${probe.alert.description}`,
          );
          touchPreviewDiagnostics(session, {
            status: 'error',
            healthy: false,
            alert: probe.alert,
          });
          schedulePreviewAutoRestore(session, probe.alert);
          return;
        }

        if (probe.healthy) {
          touchPreviewDiagnostics(session, {
            status: session.preview ? 'ready' : 'idle',
            healthy: true,
            alert: null,
          });
          return;
        }

        await new Promise((resolve) => setTimeout(resolve, POST_SYNC_PREVIEW_PROBE_INTERVAL_MS));
      }

      const timeoutAlert = {
        type: 'error',
        title: 'Preview Error',
        description: `Preview did not recover after ${reason}.`,
        content: 'The hosted runtime could not confirm a healthy preview after the latest workspace mutation.',
        source: 'preview',
      };

      appendPreviewDiagnosticEntries(session, 'probe', timeoutAlert.description);
      touchPreviewDiagnostics(session, {
        status: 'error',
        healthy: false,
        alert: timeoutAlert,
      });
      schedulePreviewAutoRestore(session, timeoutAlert);
    })();
  }, POST_SYNC_PREVIEW_PROBE_DELAY_MS);
}

function recordPreviewLog(session, channel, chunk) {
  const normalized = normalizePreviewText(chunk);

  if (!normalized) {
    return;
  }

  const nextLogs = appendPreviewDiagnosticEntries(session, channel, normalized);
  const detectedAlert = extractPreviewAlertFromText(nextLogs.join('\n'));

  touchPreviewDiagnostics(session, {
    status: detectedAlert ? 'error' : session.previewDiagnostics.status,
    healthy: detectedAlert ? false : session.previewDiagnostics.healthy,
    alert: detectedAlert || session.previewDiagnostics.alert,
  });

  if (detectedAlert) {
    schedulePreviewAutoRestore(session, detectedAlert);
  }
}

export function recordPreviewResponse(session, body, statusCode, upstreamPath) {
  const normalizedBody = normalizePreviewText(body);
  const detectedAlert =
    extractPreviewAlertFromText(normalizedBody) ||
    (statusCode >= 500
      ? {
          type: 'error',
          title: 'Preview Error',
          description: `Preview request failed with status ${statusCode}`,
          content: normalizedBody || `Preview request to ${upstreamPath} failed with status ${statusCode}.`,
          source: 'preview',
        }
      : null);

  const existingAlert = session.previewDiagnostics.alert;

  if (detectedAlert) {
    touchPreviewDiagnostics(session, {
      status: 'error',
      healthy: false,
      alert: detectedAlert,
    });
    schedulePreviewAutoRestore(session, detectedAlert);

    return;
  }

  if (
    statusCode >= 200 &&
    statusCode < 400 &&
    (upstreamPath === '/' || upstreamPath === '/index.html' || upstreamPath.endsWith('.html'))
  ) {
    if (existingAlert) {
      touchPreviewDiagnostics(session, {
        status: 'error',
        healthy: false,
        alert: existingAlert,
      });
      return;
    }

    touchPreviewDiagnostics(session, {
      status: session.preview ? 'ready' : 'idle',
      healthy: true,
      alert: null,
    });
  }
}

export function normalizeSessionId(sessionId) {
  const rawValue = String(sessionId || '').trim();
  const normalized = rawValue.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 96);

  if (!normalized) {
    throw new Error('Missing runtime session id');
  }

  return normalized;
}

function getSession(sessionId) {
  const normalized = normalizeSessionId(sessionId);
  let session = sessions.get(normalized);

  if (!session) {
    session = {
      id: normalized,
      dir: path.join(PERSIST_ROOT, normalized),
      processes: new Map(),
      previewSubscribers: new Set(),
      preview: undefined,
      previewDiagnostics: createPreviewDiagnostics(),
      previewRecovery: createPreviewRecoveryState(),
      currentFileMap: {},
      restorePointFileMap: null,
      workspaceMutationId: 0,
      autoRestoreTimer: null,
      previewVerificationTimer: null,
      previewAutostartTimer: null,
      autoRestoreInFlight: false,
      lastAutoRestoreFingerprint: null,
      lastPreparedDependencyFingerprint: null,
      publicOrigin: null,
      operationQueue: Promise.resolve(),
    };
    sessions.set(normalized, session);
  }

  return session;
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function exists(targetPath) {
  try {
    await fs.access(targetPath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function readWorkspacePackageJson(session) {
  const packageJsonPath = path.join(session.dir, 'package.json');

  if (!(await exists(packageJsonPath))) {
    return null;
  }

  const raw = await fs.readFile(packageJsonPath, 'utf8');
  return {
    path: packageJsonPath,
    raw,
    json: JSON.parse(raw),
  };
}

async function readWorkspaceLockfile(session) {
  const lockfilePath = path.join(session.dir, 'pnpm-lock.yaml');

  if (!(await exists(lockfilePath))) {
    return null;
  }

  const raw = await fs.readFile(lockfilePath, 'utf8');
  return {
    path: lockfilePath,
    raw,
  };
}

async function clearHostedWorkspaceDependencyCaches(session) {
  await fs.rm(path.join(session.dir, 'node_modules', '.vite'), {
    recursive: true,
    force: true,
  });
}

export function inferHostedWorkspaceStartCommand(packageJson) {
  const scripts = packageJson?.scripts || {};

  if (typeof scripts.dev === 'string' && scripts.dev.trim()) {
    return 'pnpm run dev';
  }

  if (typeof scripts.start === 'string' && scripts.start.trim()) {
    return 'pnpm run start';
  }

  if (typeof scripts.preview === 'string' && scripts.preview.trim()) {
    return 'pnpm run preview';
  }

  return null;
}

export function normalizePackageImportSpecifier(specifier) {
  const value = String(specifier || '').trim();

  if (!value || value.startsWith('.') || value.startsWith('/') || value.startsWith('~') || value.startsWith('node:')) {
    return null;
  }

  if (value.startsWith('@')) {
    const [scope, name] = value.split('/');
    return scope && name ? `${scope}/${name}` : null;
  }

  return value.split('/')[0] || null;
}

export function extractWorkspacePackageImports(entries) {
  const packages = new Set();

  for (const entry of entries || []) {
    const extension = path.extname(entry.path || '').toLowerCase();
    const content = String(entry.content || '');

    if (SOURCE_IMPORT_EXTENSIONS.has(extension)) {
      const importPattern =
        /\bimport\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]|\bexport\s+[^'"]*?\s+from\s+['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;

      for (const match of content.matchAll(importPattern)) {
        const normalized = normalizePackageImportSpecifier(match[1] || match[2] || match[3] || '');

        if (normalized) {
          packages.add(normalized);
        }
      }
    }

    if (STYLE_IMPORT_EXTENSIONS.has(extension)) {
      const importPattern = /@import\s+['"]([^'"]+)['"]/g;

      for (const match of content.matchAll(importPattern)) {
        const rawSpecifier = String(match[1] || '').trim();

        if (/^tailwindcss\/(?:base|components|utilities)$/i.test(rawSpecifier)) {
          continue;
        }

        const normalized = normalizePackageImportSpecifier(rawSpecifier);

        if (normalized) {
          packages.add(normalized);
        }
      }
    }
  }

  return [...packages];
}

export function collectMissingWorkspacePackages(entries, packageJson) {
  const declared = new Set([
    ...Object.keys(packageJson?.dependencies || {}),
    ...Object.keys(packageJson?.devDependencies || {}),
    ...Object.keys(packageJson?.peerDependencies || {}),
    ...Object.keys(packageJson?.optionalDependencies || {}),
  ]);

  return extractWorkspacePackageImports(entries).filter((pkg) => !declared.has(pkg));
}

export function sanitizeLegacyTailwindCss(content) {
  const raw = String(content || '');
  const withoutDirectives = raw.replace(LEGACY_TAILWIND_DIRECTIVE_RE, '').replace(/\n{3,}/g, '\n\n').trim();

  if (withoutDirectives === raw.trim()) {
    return {
      changed: false,
      content: raw,
    };
  }

  return {
    changed: true,
    content: `${withoutDirectives}\n`.replace(/^\n+/, ''),
  };
}

async function walkWorkspaceFiles(rootDir) {
  const results = [];
  const queue = ['.'];

  while (queue.length > 0) {
    const current = queue.shift();
    const absolute = current === '.' ? rootDir : path.join(rootDir, current);
    const entries = await fs.readdir(absolute, { withFileTypes: true });

    for (const entry of entries) {
      const relativePath = current === '.' ? entry.name : path.posix.join(current, entry.name);

      if (entry.isDirectory()) {
        if (!PRESERVED_DIRS.has(entry.name)) {
          queue.push(relativePath);
        }

        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const extension = path.extname(entry.name).toLowerCase();

      if (!SOURCE_IMPORT_EXTENSIONS.has(extension) && !STYLE_IMPORT_EXTENSIONS.has(extension)) {
        continue;
      }

      results.push({
        path: relativePath,
        absolutePath: path.join(rootDir, relativePath),
        extension,
        content: await fs.readFile(path.join(rootDir, relativePath), 'utf8'),
      });
    }
  }

  return results;
}

export async function prepareHostedWorkspaceForStart(session, options = {}) {
  const { writeEvent = null } = options;
  const packageJsonRecord = await readWorkspacePackageJson(session);

  if (!packageJsonRecord) {
    return {
      changed: false,
      installedPackages: [],
      sanitizedFiles: [],
    };
  }

  const entries = await walkWorkspaceFiles(session.dir);
  const installedPackages = [];
  const sanitizedFiles = [];
  const packageJson = packageJsonRecord.json;
  const lockfileRecord = await readWorkspaceLockfile(session);
  const dependencyFingerprint = createWorkspaceDependencyFingerprint(packageJsonRecord.raw, lockfileRecord?.raw || '');
  const hasNodeModules = await exists(path.join(session.dir, 'node_modules'));
  const hasTailwindDependency = Boolean(
    packageJson.dependencies?.tailwindcss || packageJson.devDependencies?.tailwindcss,
  );
  const hasTailwindConfig =
    (await exists(path.join(session.dir, 'tailwind.config.js'))) ||
    (await exists(path.join(session.dir, 'tailwind.config.cjs'))) ||
    (await exists(path.join(session.dir, 'tailwind.config.mjs'))) ||
    (await exists(path.join(session.dir, 'tailwind.config.ts'))) ||
    (await exists(path.join(session.dir, 'postcss.config.js'))) ||
    (await exists(path.join(session.dir, 'postcss.config.cjs'))) ||
    (await exists(path.join(session.dir, 'postcss.config.mjs')));

  if (!hasTailwindDependency && !hasTailwindConfig) {
    for (const entry of entries.filter((candidate) => STYLE_IMPORT_EXTENSIONS.has(candidate.extension))) {
      const sanitized = sanitizeLegacyTailwindCss(entry.content);

      if (!sanitized.changed) {
        continue;
      }

      await writeWorkspaceFileAtomic(entry.absolutePath, sanitized.content || '\n');
      sanitizedFiles.push(entry.path);
      entry.content = sanitized.content || '\n';
    }
  }

  const shouldInstallDependencies = !hasNodeModules || session.lastPreparedDependencyFingerprint !== dependencyFingerprint;

  if (shouldInstallDependencies) {
    writeEvent?.({
      type: 'status',
      message: hasNodeModules
        ? 'Dependencies changed. Reinstalling workspace packages before starting preview'
        : 'Installing workspace dependencies before starting preview',
    });

    await new Promise((resolve, reject) => {
      const child = spawn('bash', ['-lc', 'pnpm install --reporter=append-only --no-frozen-lockfile'], {
        cwd: session.dir,
        env: {
          ...process.env,
          CI: '0',
          FORCE_COLOR: '0',
          NODE_OPTIONS,
        },
      });

      let stderr = '';
      child.stdout.on('data', (chunk) => {
        writeEvent?.({ type: 'stdout', chunk: chunk.toString() });
      });
      child.stderr.on('data', (chunk) => {
        const text = chunk.toString();
        stderr += text;
        writeEvent?.({ type: 'stderr', chunk: text });
      });
      child.on('close', (code) => {
        if ((code ?? 1) === 0) {
          resolve(null);
          return;
        }

        reject(new Error(stderr.trim() || `pnpm install failed with exit ${code ?? 1}`));
      });
      child.on('error', reject);
    });

    await clearHostedWorkspaceDependencyCaches(session);
    const refreshedPackageJsonRecord = await readWorkspacePackageJson(session);
    const refreshedLockfileRecord = await readWorkspaceLockfile(session);
    session.lastPreparedDependencyFingerprint = createWorkspaceDependencyFingerprint(
      refreshedPackageJsonRecord?.raw || packageJsonRecord.raw,
      refreshedLockfileRecord?.raw || '',
    );
  } else {
    session.lastPreparedDependencyFingerprint = dependencyFingerprint;
  }

  const missingPackages = collectMissingWorkspacePackages(entries, packageJson).filter((pkg) => pkg !== 'tailwindcss');

  if (missingPackages.length > 0) {
    writeEvent?.({
      type: 'status',
      message: `Installing missing runtime packages: ${missingPackages.join(', ')}`,
    });

    await new Promise((resolve, reject) => {
      const child = spawn('bash', ['-lc', `pnpm add ${missingPackages.map((pkg) => `"${pkg}"`).join(' ')}`], {
        cwd: session.dir,
        env: {
          ...process.env,
          CI: '0',
          FORCE_COLOR: '0',
          NODE_OPTIONS,
        },
      });

      let stderr = '';
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });
      child.stdout.on('data', (chunk) => {
        writeEvent?.({ type: 'stdout', chunk: chunk.toString() });
      });
      child.stderr.on('data', (chunk) => {
        writeEvent?.({ type: 'stderr', chunk: chunk.toString() });
      });
      child.on('close', (code) => {
        if ((code ?? 1) === 0) {
          resolve(null);
          return;
        }

        reject(new Error(stderr.trim() || `pnpm add failed with exit ${code ?? 1}`));
      });
      child.on('error', reject);
    });

    installedPackages.push(...missingPackages);
  }

  return {
    changed: sanitizedFiles.length > 0 || installedPackages.length > 0,
    installedPackages,
    sanitizedFiles,
  };
}

async function writeWorkspaceFileAtomic(targetPath, content, options = {}) {
  const tempSuffix = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const tempPath = `${targetPath}.bolt-sync-${tempSuffix}.tmp`;
  const binary = options.binary === true;
  const buffer = binary ? Buffer.from(content) : Buffer.from(String(content), 'utf8');

  await fs.writeFile(tempPath, buffer);
  await fs.rename(tempPath, targetPath);
}

export function runSessionOperation(session, task) {
  const previous = session.operationQueue || Promise.resolve();
  const next = previous.catch(() => undefined).then(task);

  session.operationQueue = next.catch(() => undefined);

  return next;
}

export function commandNeedsProjectManifest(command = '') {
  const normalized = command.trim().toLowerCase();

  if (!normalized) {
    return false;
  }

  if (/^(npm|pnpm)\s+(create|dlx)\b/.test(normalized)) {
    return false;
  }

  if (/^yarn\s+(create|dlx)\b/.test(normalized)) {
    return false;
  }

  if (/^bun\s+(create|x)\b/.test(normalized)) {
    return false;
  }

  return /^(npm|pnpm|yarn|bun)\s+/.test(normalized);
}

export async function workspaceHasOwnProjectManifest(workspaceDir) {
  for (const fileName of PROJECT_MANIFEST_FILES) {
    // eslint-disable-next-line no-await-in-loop
    if (await exists(path.join(workspaceDir, fileName))) {
      return true;
    }
  }

  return false;
}

export async function waitForProjectManifest(workspaceDir, timeoutMs = PROJECT_MANIFEST_WAIT_MS) {
  const deadline = Date.now() + Math.max(0, timeoutMs);

  while (Date.now() <= deadline) {
    // eslint-disable-next-line no-await-in-loop
    if (await workspaceHasOwnProjectManifest(workspaceDir)) {
      return true;
    }

    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  return workspaceHasOwnProjectManifest(workspaceDir);
}

async function inferWorkspaceStartCommand(session) {
  const packageJsonRecord = await readWorkspacePackageJson(session);

  if (!packageJsonRecord) {
    return null;
  }

  return inferHostedWorkspaceStartCommand(packageJsonRecord.json);
}

async function startHostedPreviewForSession(session) {
  if (session.preview || session.autoRestoreInFlight || session.processes.has('preview')) {
    return false;
  }

  const command = await inferWorkspaceStartCommand(session);

  if (!command) {
    return false;
  }

  const publicOrigin = String(session.publicOrigin || '').trim();

  if (!publicOrigin) {
    return false;
  }

  const response = await fetch(`http://${HOST}:${PORT}/runtime/sessions/${session.id}/command`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-bolt-public-origin': publicOrigin,
    },
    body: JSON.stringify({
      kind: 'start',
      command,
    }),
  });

  if (!response.ok) {
    throw new Error(`Hosted preview autostart failed with status ${response.status}`);
  }

  return true;
}

function scheduleHostedAutoStartAfterSync(session) {
  if (session.preview || session.autoRestoreInFlight || session.processes.has('preview')) {
    return;
  }

  cancelPendingPreviewAutostart(session);
  const mutationId = session.workspaceMutationId;

  session.previewAutostartTimer = setTimeout(() => {
    session.previewAutostartTimer = null;

    void (async () => {
      if (session.workspaceMutationId !== mutationId || session.preview || session.autoRestoreInFlight) {
        return;
      }

      try {
        const started = await startHostedPreviewForSession(session);

        if (!started) {
          return;
        }

        touchPreviewDiagnostics(session, {
          status: 'starting',
          healthy: false,
          alert: null,
        });
        appendPreviewDiagnosticEntries(session, 'autostart', 'Hosted runtime started preview automatically after workspace sync.');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        appendPreviewDiagnosticEntries(session, 'autostart', `Hosted preview autostart failed: ${message}`);
        touchPreviewDiagnostics(session, {
          status: 'error',
          healthy: false,
          alert: {
            type: 'error',
            title: 'Preview Error',
            description: 'Hosted runtime could not auto-start the preview after file sync.',
            content: message,
            source: 'preview',
          },
        });
      }
    })();
  }, 300);
}

async function walkWorkspace(rootDir, relativeDir = '') {
  const absoluteDir = path.join(rootDir, relativeDir);
  let entries = [];

  try {
    entries = await fs.readdir(absoluteDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const results = [];

  for (const entry of entries) {
    const relativePath = relativeDir ? path.posix.join(relativeDir, entry.name) : entry.name;

    if (PRESERVED_DIRS.has(entry.name) && !relativeDir) {
      continue;
    }

    if (entry.isDirectory()) {
      results.push({ path: relativePath, type: 'dir' });
      results.push(...(await walkWorkspace(rootDir, relativePath)));
    } else if (entry.isFile()) {
      results.push({ path: relativePath, type: 'file' });
    }
  }

  return results;
}

function toRelativeWorkspacePath(filePath) {
  const normalized = filePath.replace(/\\/g, '/');

  if (normalized === WORK_DIR) {
    return '';
  }

  if (normalized.startsWith(`${WORK_DIR}/`)) {
    return normalized.slice(WORK_DIR.length + 1);
  }

  return normalized.replace(/^\/+/, '');
}

export async function syncWorkspaceSnapshot(session, fileMap, options = {}) {
  const { prune = true } = options;
  await ensureDir(session.dir);

  const desiredFiles = new Map();
  const desiredDirs = new Set();

  for (const [absolutePath, dirent] of Object.entries(fileMap || {})) {
    if (!dirent) {
      continue;
    }

    const relativePath = toRelativeWorkspacePath(absolutePath);

    if (!relativePath) {
      continue;
    }

    if (dirent.type === 'folder') {
      desiredDirs.add(relativePath);
      continue;
    }

    desiredFiles.set(relativePath, dirent);

    const parentDir = path.posix.dirname(relativePath);

    if (parentDir && parentDir !== '.') {
      const parts = parentDir.split('/');
      let prefix = '';

      for (const part of parts) {
        prefix = prefix ? `${prefix}/${part}` : part;
        desiredDirs.add(prefix);
      }
    }
  }

  const existingEntries = await walkWorkspace(session.dir);

  if (prune) {
    for (const entry of existingEntries) {
      if (entry.type === 'file' && !desiredFiles.has(entry.path)) {
        await fs.rm(path.join(session.dir, entry.path), { force: true });
      }

      if (entry.type === 'dir' && !desiredDirs.has(entry.path)) {
        await fs.rm(path.join(session.dir, entry.path), { recursive: true, force: true });
      }
    }
  }

  for (const dirPath of [...desiredDirs].sort((a, b) => a.length - b.length)) {
    await ensureDir(path.join(session.dir, dirPath));
  }

  for (const [relativePath, dirent] of desiredFiles.entries()) {
    const absolutePath = path.join(session.dir, relativePath);
    await ensureDir(path.dirname(absolutePath));

    if (dirent.isBinary) {
      await writeWorkspaceFileAtomic(absolutePath, Buffer.from(dirent.content || '', 'base64'), { binary: true });
      continue;
    }

    await writeWorkspaceFileAtomic(absolutePath, dirent.content || '');
  }
}

function createEventWriter(res) {
  res.writeHead(200, {
    'Content-Type': 'application/x-ndjson; charset=utf-8',
    'Cache-Control': 'no-store',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
  });

  return (event) => {
    res.write(`${JSON.stringify(event)}\n`);
  };
}

function getRequestOrigin(req) {
  const explicitOrigin = String(req.headers['x-bolt-public-origin'] || '').trim();

  if (explicitOrigin) {
    return explicitOrigin;
  }

  const proto = req.headers['x-forwarded-proto'] || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host || `${HOST}:${PORT}`;
  return `${proto}://${host}`;
}

export function updateSessionPreview(session, req, port) {
  if (!Number.isFinite(Number(port)) || Number(port) <= 0) {
    return session.preview || null;
  }

  const resolvedPort = Number(port);
  const previewBaseUrl = `${getRequestOrigin(req)}/runtime/preview/${session.id}/${resolvedPort}`;

  session.preview = {
    ...(session.preview || {}),
    port: resolvedPort,
    baseUrl: previewBaseUrl,
  };

  broadcastPreviewState(session);

  return session.preview;
}

export function normalizeIncomingPreviewAlert(input) {
  if (!input || typeof input !== 'object') {
    return null;
  }

  const type = String(input.type || 'error').trim() || 'error';
  const title = String(input.title || 'Preview Error').trim() || 'Preview Error';
  const description = String(input.description || '').trim();
  const content = String(input.content || '').trim();

  if (!description && !content) {
    return null;
  }

  return {
    type,
    title,
    description: (description || title).slice(0, 220),
    content: content.slice(0, 5000),
    source: 'preview',
  };
}

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.on('error', () => resolve(false));
    server.listen({ host: HOST, port }, () => {
      server.close(() => resolve(true));
    });
  });
}

async function allocatePreviewPort() {
  for (let port = PREVIEW_PORT_RANGE_START; port <= PREVIEW_PORT_RANGE_END; port++) {
    // eslint-disable-next-line no-await-in-loop
    if (await isPortAvailable(port)) {
      return port;
    }
  }

  throw new Error('No preview port available');
}

async function waitForPreview(port) {
  const deadline = Date.now() + PREVIEW_READY_TIMEOUT_MS;
  const target = `http://${HOST}:${port}/`;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(target, {
        redirect: 'manual',
      });

      if (response.status >= 200 && response.status < 500) {
        return;
      }
    } catch {
      // keep polling
    }

    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(`Preview did not become ready on port ${port}`);
}

async function terminateSessionProcesses(session) {
  cancelPendingPreviewAutoRestore(session);
  cancelPendingPreviewVerification(session);

  for (const [, handle] of session.processes.entries()) {
    handle.process.kill('SIGTERM');
  }

  session.processes.clear();
  session.preview = undefined;
  clearPreviewDiagnostics(session);
  clearPreviewRecoveryState(session);
}

async function handleRunCommand(req, res, session, body) {
  const { command, kind } = body || {};

  if (typeof command !== 'string' || !command.trim()) {
    sendText(res, 400, 'Missing command');
    return;
  }

  const writeEvent = createEventWriter(res);
  const effectiveCommand =
    kind === 'start'
      ? normalizeStartCommand(command, session.preview?.port || (await allocatePreviewPort()))
      : command.trim();
  const previewPort =
    kind === 'start' ? Number(effectiveCommand.match(/--port\s+(\d+)/i)?.[1] || session.preview?.port || 0) : undefined;
  const needsManifest = commandNeedsProjectManifest(effectiveCommand);

  if (needsManifest && !(await workspaceHasOwnProjectManifest(session.dir))) {
    writeEvent({
      type: 'status',
      message: 'Waiting for project files to finish syncing before running package-manager command',
    });
  }

  if (needsManifest && !(await waitForProjectManifest(session.dir))) {
    writeEvent({
      type: 'stderr',
      chunk:
        'Hosted runtime refused to run a package-manager command because the session workspace has no project manifest yet. Scaffold or sync the project files first.\n',
    });
    writeEvent({ type: 'exit', exitCode: 1 });
    res.end();
    return;
  }

  if (kind === 'start') {
    try {
      const preparation = await prepareHostedWorkspaceForStart(session, { writeEvent });

      if (preparation.sanitizedFiles.length > 0) {
        writeEvent({
          type: 'status',
          message: `Architect removed incompatible legacy Tailwind directives from ${preparation.sanitizedFiles.join(', ')}`,
        });
      }

      if (preparation.installedPackages.length > 0) {
        writeEvent({
          type: 'status',
          message: `Architect installed missing runtime packages: ${preparation.installedPackages.join(', ')}`,
        });
      }
    } catch (error) {
      writeEvent({
        type: 'stderr',
        chunk: `${error instanceof Error ? error.message : String(error)}\n`,
      });
      writeEvent({ type: 'exit', exitCode: 1 });
      res.end();
      return;
    }
  }

  markSessionMutationStart(session);
  const env = {
    ...process.env,
    CI: '1',
    FORCE_COLOR: '0',
    NODE_OPTIONS,
    PORT: previewPort ? String(previewPort) : process.env.PORT,
    HOST,
  };

  if (kind === 'start') {
    await terminateSessionProcesses(session);
    clearPreviewDiagnostics(session, 'starting');
  }

  writeEvent({ type: 'status', message: `Running ${kind} command on hosted runtime` });
  const child = spawn('bash', ['-lc', effectiveCommand], {
    cwd: session.dir,
    env,
    detached: kind === 'start',
  });

  const processKey = kind === 'start' ? 'preview' : `command-${Date.now()}`;
  session.processes.set(processKey, { process: child, port: previewPort });

  let output = '';
  let settled = false;
  let previewProbePromise;
  const timeout = setTimeout(() => {
    if (settled) {
      return;
    }

    child.kill('SIGTERM');
  }, COMMAND_TIMEOUT_MS);
  const exitPromise = new Promise((resolve, reject) => {
    child.on('close', (exitCode) => resolve(exitCode ?? 1));
    child.on('error', (error) => reject(error));
  });
  const previewCoordinator = createPreviewProbeCoordinator(waitForPreview);
  previewProbePromise = previewCoordinator.readyPromise;

  const detectPreviewPort = (text) => {
    if (kind !== 'start') {
      return;
    }

    const detectedPort = extractPreviewPortFromOutput(text);

    if (!detectedPort) {
      return;
    }

    updateSessionPreview(session, req, detectedPort);
    previewCoordinator.startProbe(detectedPort);
  };

  child.stdout.on('data', (chunk) => {
    const text = chunk.toString();
    output += text;
    detectPreviewPort(text);
    if (kind === 'start') {
      recordPreviewLog(session, 'stdout', text);
    }
    writeEvent({ type: 'stdout', chunk: text });
  });

  child.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    output += text;
    detectPreviewPort(text);
    if (kind === 'start') {
      recordPreviewLog(session, 'stderr', text);
    }
    writeEvent({ type: 'stderr', chunk: text });
  });

  if (kind === 'start' && previewPort) {
    try {
      await Promise.race([
        previewProbePromise,
        exitPromise.then((exitCode) => {
          throw new Error(`Preview process exited before becoming ready (exit ${exitCode})`);
        }),
      ]);
      const resolvedPort = (await previewProbePromise).port;
      updateSessionPreview(session, req, resolvedPort);
      touchPreviewDiagnostics(session, {
        status: 'ready',
        healthy: true,
        alert: null,
      });
      writeEvent({
        type: 'ready',
        preview: session.preview,
      });
      writeEvent({ type: 'exit', exitCode: 0 });
      clearTimeout(timeout);
      settled = true;
      res.end();
      return;
    } catch (error) {
      touchPreviewDiagnostics(session, {
        status: 'error',
        healthy: false,
        alert: extractPreviewAlertFromText(output) || {
          type: 'error',
          title: 'Preview Error',
          description: error instanceof Error ? error.message : String(error),
          content: normalizePreviewText(output) || (error instanceof Error ? error.message : String(error)),
          source: 'preview',
        },
      });
      writeEvent({ type: 'stderr', chunk: `${error instanceof Error ? error.message : String(error)}\n` });
      child.kill('SIGTERM');
      const exitCode = await exitPromise.catch(() => 1);
      writeEvent({ type: 'exit', exitCode });
      clearTimeout(timeout);
      settled = true;
      res.end();
      return;
    }
  }

  try {
    const exitCode = await exitPromise;

    if (settled) {
      return;
    }

    settled = true;
    clearTimeout(timeout);

    if (kind !== 'start') {
      session.processes.delete(processKey);
    }

    writeEvent({ type: 'exit', exitCode });
    res.end();
  } catch (error) {
    if (settled) {
      return;
    }

    settled = true;
    clearTimeout(timeout);
    writeEvent({ type: 'error', error: error.message });
    res.end();
  }
}

function proxyPreviewRequest(req, res, pathname, attempt = 0) {
  const target = parsePreviewProxyRequestTarget(req.url || pathname);

  if (!target) {
    sendText(res, 404, 'Preview not found');
    return;
  }

  const { sessionId, portRaw, upstreamPath, previewBasePath } = target;
  const session = sessions.get(sessionId);

  if (!session) {
    sendText(res, 404, 'Unknown runtime session');
    return;
  }

  const port = Number(portRaw);
  const method = String(req.method || 'GET').toUpperCase();
  const scheduleRetry = () => {
    if (res.writableEnded || res.destroyed) {
      return;
    }

    const delay = PREVIEW_PROXY_RETRY_DELAYS_MS[attempt] || 0;

    setTimeout(() => {
      proxyPreviewRequest(req, res, pathname, attempt + 1);
    }, delay);
  };
  const upstreamReq = http.request(
    {
      host: HOST,
      port,
      method: req.method,
      path: upstreamPath,
      headers: {
        ...req.headers,
        host: `${HOST}:${port}`,
      },
    },
    (upstreamRes) => {
      const statusCode = upstreamRes.statusCode || 502;

      if (shouldRetryPreviewProxyResponse({ method, statusCode, attempt })) {
        upstreamRes.resume();
        upstreamRes.on('end', scheduleRetry);
        return;
      }

      const headers = { ...upstreamRes.headers };
      const contentType = String(headers['content-type'] || '');
      const shouldRewrite = /text\/html|javascript|ecmascript|text\/css/.test(contentType);

      if (!shouldRewrite) {
        if (statusCode >= 500) {
          const alert = {
            type: 'error',
            title: 'Preview Error',
            description: `Preview request failed with status ${statusCode}`,
            content: `Non-text preview response failed for ${upstreamPath}`,
            source: 'preview',
          };
          touchPreviewDiagnostics(session, {
            status: 'error',
            healthy: false,
            alert,
          });
          schedulePreviewAutoRestore(session, alert);
        }

        res.writeHead(statusCode, applyPreviewResponseHeaders(headers));
        upstreamRes.pipe(res);
        return;
      }

      const chunks = [];
      upstreamRes.on('data', (chunk) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      upstreamRes.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        const rewritten = rewritePreviewAssetUrls(body, previewBasePath);
        recordPreviewResponse(session, rewritten, statusCode, upstreamPath);

        delete headers['content-length'];
        delete headers['content-encoding'];

        res.writeHead(statusCode, applyPreviewResponseHeaders(headers));
        res.end(rewritten);
      });
    },
  );

  upstreamReq.setTimeout(PREVIEW_PROXY_UPSTREAM_TIMEOUT_MS, () => {
    upstreamReq.destroy(new Error(`Preview upstream timed out after ${PREVIEW_PROXY_UPSTREAM_TIMEOUT_MS}ms`));
  });

  upstreamReq.on('error', (error) => {
    if (shouldRetryPreviewProxyResponse({ method, statusCode: 502, attempt })) {
      scheduleRetry();
      return;
    }

    touchPreviewDiagnostics(session, {
      status: 'error',
      healthy: false,
      alert: {
        type: 'error',
        title: 'Preview Error',
        description: `Preview proxy failed: ${error.message}`,
        content: `Proxy request to ${upstreamPath} failed.`,
        source: 'preview',
      },
    });
    schedulePreviewAutoRestore(session, session.previewDiagnostics.alert);
    sendText(res, 502, `Preview proxy failed: ${error.message}`);
  });

  if (req.method === 'GET' || req.method === 'HEAD') {
    upstreamReq.end();
    return;
  }

  req.pipe(upstreamReq);
}

function proxyPreviewUpgrade(req, socket, head) {
  const target = parsePreviewProxyRequestTarget(req.url || '');

  if (!target) {
    socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }

  const { sessionId, portRaw, upstreamPath } = target;
  const session = sessions.get(sessionId);

  if (!session) {
    socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }

  const upstreamSocket = net.connect(Number(portRaw), HOST, () => {
    const headerLines = [`GET ${upstreamPath} HTTP/1.1`];

    for (let index = 0; index < req.rawHeaders.length; index += 2) {
      const name = req.rawHeaders[index];
      const value = req.rawHeaders[index + 1];

      if (!name || value === undefined) {
        continue;
      }

      if (name.toLowerCase() === 'host') {
        headerLines.push(`Host: ${HOST}:${portRaw}`);
        continue;
      }

      headerLines.push(`${name}: ${value}`);
    }

    upstreamSocket.write(`${headerLines.join('\r\n')}\r\n\r\n`);

    if (head?.length) {
      upstreamSocket.write(head);
    }

    socket.pipe(upstreamSocket);
    upstreamSocket.pipe(socket);
  });

  upstreamSocket.on('error', () => {
    if (!socket.destroyed) {
      socket.write('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n');
      socket.destroy();
    }
  });

  socket.on('error', () => {
    if (!upstreamSocket.destroyed) {
      upstreamSocket.destroy();
    }
  });
}

async function readJsonBody(req) {
  let raw = '';

  for await (const chunk of req) {
    raw += chunk.toString();
  }

  if (!raw) {
    return {};
  }

  return JSON.parse(raw);
}

export function createRuntimeServer() {
  return http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
      });
      res.end();
      return;
    }

    const url = new URL(req.url || '/', `http://${req.headers.host || `${HOST}:${PORT}`}`);
    const pathname = url.pathname;
    const searchParams = url.searchParams;

    if (pathname === '/health') {
      sendJson(res, 200, { ok: true, host: HOST, port: PORT, sessions: sessions.size });
      return;
    }

    if (pathname === '/runtime/health') {
      sendJson(res, 200, { ok: true, host: HOST, port: PORT, sessions: sessions.size });
      return;
    }

    if (pathname.startsWith('/runtime/preview/')) {
      proxyPreviewRequest(req, res, pathname);
      return;
    }

    if (req.method === 'GET' && pathname === '/runtime/managed-instances/config') {
      try {
        const support = buildManagedInstanceSupportState();
        sendJson(res, 200, support);
      } catch (error) {
        sendText(res, 500, error instanceof Error ? error.message : 'Failed to inspect managed instance support');
      }
      return;
    }

    if (req.method === 'GET' && pathname === '/runtime/managed-instances/session') {
      try {
        const sessionToken = String(searchParams.get('sessionToken') || '').trim();
        const registry = await ensureManagedInstanceRegistry();
        await maybeExpireManagedInstances(registry, { actor: 'system' });
        const instance = getManagedInstanceBySessionSecret(registry, sessionToken);

        if (!instance) {
          sendText(res, 404, 'Managed instance session not found.');
          return;
        }

        sendJson(res, 200, {
          ok: true,
          instance: sanitizeManagedInstanceForClient(instance),
        });
      } catch (error) {
        sendText(res, 500, error instanceof Error ? error.message : 'Failed to inspect managed instance session');
      }
      return;
    }

    if (req.method === 'POST' && pathname === '/runtime/managed-instances/spawn') {
      try {
        const support = buildManagedInstanceSupportState();

        if (!support.supported) {
          sendText(res, 503, support.reason || 'Managed trial instances are unavailable on this deployment.');
          return;
        }

        const body = await readJsonBody(req);
        const name = String(body.name || '').trim();
        const email = String(body.email || '')
          .trim()
          .toLowerCase();
        const requestedSubdomain = slugifyManagedInstanceSubdomain(body.subdomain);
        const sessionToken = String(body.sessionToken || '').trim();

        if (name.length < 2) {
          sendText(res, 400, 'Display name must be at least 2 characters long.');
          return;
        }

        if (!isLikelyValidEmail(email)) {
          sendText(res, 400, 'A valid email address is required to request a managed trial instance.');
          return;
        }

        if (!requestedSubdomain || requestedSubdomain.length < 3) {
          sendText(res, 400, 'Choose a subdomain with at least 3 letters or numbers.');
          return;
        }

        const registry = await ensureManagedInstanceRegistry();
        await maybeExpireManagedInstances(registry, { actor: email });

        const existingCloudflareProject = await fetchCloudflarePagesProject(requestedSubdomain);

        if (
          existingCloudflareProject &&
          !registry.instances.some((instance) => instance.projectName === requestedSubdomain)
        ) {
          sendText(res, 409, 'That subdomain is already in use. Choose another subdomain.');
          return;
        }

        const claim = claimManagedInstanceTrial(registry, {
          name,
          email,
          requestedSubdomain,
          rootDomain: support.rootDomain,
          trialDays: support.trialDays,
          sessionSecret: sessionToken || undefined,
        });

        if (claim.kind === 'conflict') {
          if (claim.code === 'subdomain-unavailable') {
            sendText(res, 409, 'That subdomain is already assigned to another trial instance.');
            return;
          }

          sendText(
            res,
            409,
            'This client already has a managed trial instance. Reuse the original browser session to manage it.',
          );
          return;
        }

        await writeManagedInstanceRegistry(registry);
        const instance = await refreshManagedInstanceFromCurrentBuild(registry, claim.instance, {
          actor: email,
          reason: claim.kind === 'created' ? 'initial-trial-spawn' : 'resume-existing-trial',
        });

        sendJson(res, 200, {
          ok: true,
          existing: claim.kind === 'existing',
          sessionToken: claim.sessionSecret,
          instance: sanitizeManagedInstanceForClient(instance),
        });
      } catch (error) {
        sendText(res, 500, error instanceof Error ? error.message : 'Failed to provision the managed trial instance.');
      }
      return;
    }

    const managedInstanceRefreshMatch = pathname.match(/^\/runtime\/managed-instances\/([^/]+)\/refresh$/);

    if (req.method === 'POST' && managedInstanceRefreshMatch) {
      try {
        const slug = decodeURIComponent(managedInstanceRefreshMatch[1] || '');
        const body = await readJsonBody(req);
        const sessionToken = String(body.sessionToken || '').trim();
        const registry = await ensureManagedInstanceRegistry();
        await maybeExpireManagedInstances(registry, { actor: 'system' });
        const instance = findManagedInstanceBySlug(registry, slug);

        if (!instance) {
          sendText(res, 404, 'Managed instance not found.');
          return;
        }

        if (!managedInstanceSessionMatches(instance, sessionToken)) {
          sendText(res, 401, 'Managed instance session is invalid.');
          return;
        }

        if (instance.status === 'expired' || instance.status === 'suspended') {
          sendText(res, 400, 'This managed trial instance can no longer be refreshed.');
          return;
        }

        const refreshed = await refreshManagedInstanceFromCurrentBuild(registry, instance, {
          actor: instance.email,
          reason: 'manual-trial-refresh',
        });

        sendJson(res, 200, {
          ok: true,
          instance: sanitizeManagedInstanceForClient(refreshed),
        });
      } catch (error) {
        sendText(res, 500, error instanceof Error ? error.message : 'Failed to refresh the managed instance.');
      }
      return;
    }

    const managedInstanceSuspendMatch = pathname.match(/^\/runtime\/managed-instances\/([^/]+)\/suspend$/);

    if (req.method === 'POST' && managedInstanceSuspendMatch) {
      try {
        const slug = decodeURIComponent(managedInstanceSuspendMatch[1] || '');
        const body = await readJsonBody(req);
        const sessionToken = String(body.sessionToken || '').trim();
        const registry = await ensureManagedInstanceRegistry();
        const instance = findManagedInstanceBySlug(registry, slug);

        if (!instance) {
          sendText(res, 404, 'Managed instance not found.');
          return;
        }

        if (!managedInstanceSessionMatches(instance, sessionToken)) {
          sendText(res, 401, 'Managed instance session is invalid.');
          return;
        }

        instance.status = 'suspended';
        instance.updatedAt = new Date().toISOString();
        instance.suspendedAt = new Date().toISOString();
        instance.lastError = 'Managed trial instance suspended by the client.';
        appendManagedInstanceEvent(registry, {
          actor: instance.email,
          action: 'managed-instance.suspended',
          target: instance.routeHostname,
        });

        if (MANAGED_INSTANCE_DELETE_ON_SUSPEND && getManagedInstanceCloudflareConfig().enabled) {
          const config = getManagedInstanceCloudflareConfig();
          const deletion = await runManagedInstanceProcess(
            'pnpm',
            ['exec', 'wrangler', 'pages', 'project', 'delete', instance.projectName, '--yes'],
            {
              env: {
                CLOUDFLARE_API_TOKEN: config.apiToken,
                CLOUDFLARE_ACCOUNT_ID: config.accountId,
              },
            },
          );

          if (deletion.code !== 0 && !/does not exist/i.test(`${deletion.stdout}\n${deletion.stderr}`)) {
            throw new Error(deletion.stderr.trim() || deletion.stdout.trim() || 'Failed to delete the Pages project.');
          }
        }

        await writeManagedInstanceRegistry(registry);
        sendJson(res, 200, {
          ok: true,
          instance: sanitizeManagedInstanceForClient(instance),
        });
      } catch (error) {
        sendText(res, 500, error instanceof Error ? error.message : 'Failed to suspend the managed instance.');
      }
      return;
    }

    const syncMatch = pathname.match(/^\/runtime\/sessions\/([^/]+)\/sync$/);
    const previewStatusMatch = pathname.match(/^\/runtime\/sessions\/([^/]+)\/preview-status$/);
    const previewEventsMatch = pathname.match(/^\/runtime\/sessions\/([^/]+)\/preview-events$/);
    const snapshotMatch = pathname.match(/^\/runtime\/sessions\/([^/]+)\/snapshot$/);
    const previewAlertMatch = pathname.match(/^\/runtime\/sessions\/([^/]+)\/preview-alert$/);

    if (req.method === 'GET' && pathname === '/runtime/tenant-admin/status') {
      try {
        const registry = await ensureTenantRegistry();
        sendJson(res, 200, {
          supported: true,
          tenants: registry.tenants || [],
          auditTrail: registry.auditTrail || [],
          defaultAdmin: { username: registry.admin?.username || 'admin' },
          admin: {
            username: registry.admin?.username || 'admin',
            mustChangePassword: registry.admin?.mustChangePassword !== false,
            updatedAt: registry.admin?.updatedAt || null,
            passwordUpdatedAt: registry.admin?.passwordUpdatedAt || null,
            lastLoginAt: registry.admin?.lastLoginAt || null,
          },
        });
      } catch (error) {
        sendText(res, 500, error instanceof Error ? error.message : 'Failed to inspect tenant registry');
      }
      return;
    }

    if (req.method === 'POST' && pathname === '/runtime/tenant-admin/verify-admin') {
      try {
        const body = await readJsonBody(req);
        const registry = await ensureTenantRegistry();
        const username = String(body.username || '');
        const password = String(body.password || '');

        if (username !== registry.admin?.username || hashTenantSecret(password) !== registry.admin?.passwordHash) {
          sendText(res, 401, 'Invalid tenant admin credentials.');
          return;
        }

        registry.admin = {
          ...registry.admin,
          lastLoginAt: new Date().toISOString(),
        };
        appendTenantAuditEvent(registry, {
          actor: registry.admin?.username || 'admin',
          action: 'admin.login',
          target: registry.admin?.username || 'admin',
        });
        await writeTenantRegistry(registry);

        sendJson(res, 200, { ok: true });
      } catch (error) {
        sendText(res, 500, error instanceof Error ? error.message : 'Failed to verify tenant admin');
      }
      return;
    }

    if (req.method === 'POST' && pathname === '/runtime/tenant-admin/tenants') {
      try {
        const body = await readJsonBody(req);
        const name = String(body.name || '').trim();
        const email = String(body.email || '')
          .trim()
          .toLowerCase();

        if (!name || !email) {
          sendText(res, 400, 'Name and email are required.');
          return;
        }

        if (!isLikelyValidEmail(email)) {
          sendText(res, 400, 'Tenant admin email must be a valid email address.');
          return;
        }

        const registry = await ensureTenantRegistry();

        if (registry.admin?.mustChangePassword !== false) {
          sendText(res, 400, 'Rotate the bootstrap admin password before creating production tenants.');
          return;
        }

        if (registry.tenants.some((tenant) => tenant.email === email)) {
          sendText(res, 400, 'A tenant with that email already exists.');
          return;
        }

        const slug = buildTenantSlug(name, email, registry.tenants);
        registry.tenants.unshift({
          id: `${Date.now()}`,
          name,
          email,
          slug,
          workspaceDir: buildTenantWorkspaceDir(slug),
          passwordHash: hashTenantSecret(createRandomTenantPassword()),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          passwordUpdatedAt: null,
          status: 'pending',
          lastLoginAt: null,
          mustChangePassword: true,
          inviteToken: null,
          inviteExpiresAt: null,
          inviteIssuedAt: null,
          invitePurpose: null,
          approvedAt: null,
          approvedBy: null,
          disabledAt: null,
          disabledBy: null,
        });
        appendTenantAuditEvent(registry, {
          actor: registry.admin?.username || 'admin',
          action: 'tenant.create.pending',
          target: email,
          details: { slug },
        });

        await fs.mkdir(buildTenantWorkspaceDir(slug), { recursive: true });
        await writeTenantRegistry(registry);
        sendJson(res, 200, { ok: true });
      } catch (error) {
        sendText(res, 500, error instanceof Error ? error.message : 'Failed to create tenant');
      }
      return;
    }

    const tenantApproveMatch = pathname.match(/^\/runtime\/tenant-admin\/tenants\/([^/]+)\/approve$/);

    if (req.method === 'POST' && tenantApproveMatch) {
      try {
        const tenantId = decodeURIComponent(tenantApproveMatch[1] || '');
        const registry = await ensureTenantRegistry();
        const tenant = registry.tenants.find((entry) => entry.id === tenantId);

        if (!tenant) {
          sendText(res, 404, 'Tenant not found.');
          return;
        }

        tenant.status = 'active';
        tenant.updatedAt = new Date().toISOString();
        tenant.approvedAt = new Date().toISOString();
        tenant.approvedBy = registry.admin?.username || 'admin';
        tenant.disabledAt = null;
        tenant.disabledBy = null;
        appendTenantAuditEvent(registry, {
          actor: registry.admin?.username || 'admin',
          action: 'tenant.approve',
          target: tenant.email,
          details: { slug: tenant.slug || '' },
        });

        await writeTenantRegistry(registry);
        sendJson(res, 200, { ok: true, status: tenant.status });
      } catch (error) {
        sendText(res, 500, error instanceof Error ? error.message : 'Failed to approve tenant.');
      }
      return;
    }

    if (req.method === 'POST' && pathname === '/runtime/tenant-admin/admin/password') {
      try {
        const body = await readJsonBody(req);
        const currentPassword = String(body.currentPassword || '');
        const nextPassword = String(body.nextPassword || '').trim();
        const registry = await ensureTenantRegistry();

        if (hashTenantSecret(currentPassword) !== registry.admin?.passwordHash) {
          sendText(res, 401, 'Current admin password is incorrect.');
          return;
        }

        if (nextPassword.length < 10) {
          sendText(res, 400, 'Admin password must be at least 10 characters long.');
          return;
        }

        registry.admin = {
          ...registry.admin,
          passwordHash: hashTenantSecret(nextPassword),
          mustChangePassword: false,
          updatedAt: new Date().toISOString(),
          passwordUpdatedAt: new Date().toISOString(),
        };
        appendTenantAuditEvent(registry, {
          actor: registry.admin?.username || 'admin',
          action: 'admin.password.rotate',
          target: registry.admin?.username || 'admin',
        });

        await writeTenantRegistry(registry);
        sendJson(res, 200, { ok: true });
      } catch (error) {
        sendText(res, 500, error instanceof Error ? error.message : 'Failed to update admin password.');
      }
      return;
    }

    const tenantStatusMatch = pathname.match(/^\/runtime\/tenant-admin\/tenants\/([^/]+)\/status$/);

    if (req.method === 'POST' && tenantStatusMatch) {
      try {
        const body = await readJsonBody(req);
        const nextStatus = body.status === 'disabled' ? 'disabled' : 'active';
        const tenantId = decodeURIComponent(tenantStatusMatch[1] || '');
        const registry = await ensureTenantRegistry();
        const tenant = registry.tenants.find((entry) => entry.id === tenantId);

        if (!tenant) {
          sendText(res, 404, 'Tenant not found.');
          return;
        }

        tenant.status = nextStatus;
        tenant.updatedAt = new Date().toISOString();
        tenant.disabledAt = nextStatus === 'disabled' ? new Date().toISOString() : null;
        tenant.disabledBy = nextStatus === 'disabled' ? registry.admin?.username || 'admin' : null;
        appendTenantAuditEvent(registry, {
          actor: registry.admin?.username || 'admin',
          action: 'tenant.status.update',
          target: tenant.email,
          details: { status: nextStatus },
        });

        await writeTenantRegistry(registry);
        sendJson(res, 200, { ok: true, status: nextStatus });
      } catch (error) {
        sendText(res, 500, error instanceof Error ? error.message : 'Failed to update tenant status.');
      }
      return;
    }

    const tenantInviteMatch = pathname.match(/^\/runtime\/tenant-admin\/tenants\/([^/]+)\/invite$/);

    if (req.method === 'POST' && tenantInviteMatch) {
      try {
        const body = await readJsonBody(req);
        const purpose = body.purpose === 'password-reset' ? 'password-reset' : 'onboarding';
        const tenantId = decodeURIComponent(tenantInviteMatch[1] || '');
        const registry = await ensureTenantRegistry();
        const tenant = registry.tenants.find((entry) => entry.id === tenantId);

        if (!tenant) {
          sendText(res, 404, 'Tenant not found.');
          return;
        }

        if (tenant.status !== 'active') {
          sendText(res, 400, 'Tenant must be approved and active before issuing an invite.');
          return;
        }

        tenant.inviteToken = createTenantInviteToken();
        tenant.inviteIssuedAt = new Date().toISOString();
        tenant.inviteExpiresAt = createTenantInviteExpiry();
        tenant.invitePurpose = purpose;
        tenant.mustChangePassword = true;
        tenant.updatedAt = new Date().toISOString();
        appendTenantAuditEvent(registry, {
          actor: registry.admin?.username || 'admin',
          action: purpose === 'password-reset' ? 'tenant.password.force-reset' : 'tenant.invite.issue',
          target: tenant.email,
          details: { expiresAt: tenant.inviteExpiresAt },
        });

        await writeTenantRegistry(registry);
        sendJson(res, 200, {
          ok: true,
          inviteUrl: `/tenant?invite=${tenant.inviteToken}`,
          inviteExpiresAt: tenant.inviteExpiresAt,
        });
      } catch (error) {
        sendText(res, 500, error instanceof Error ? error.message : 'Failed to issue tenant invite.');
      }
      return;
    }

    if (req.method === 'POST' && pathname === '/runtime/tenant-auth/login') {
      try {
        const body = await readJsonBody(req);
        const email = String(body.email || '')
          .trim()
          .toLowerCase();
        const password = String(body.password || '');
        const registry = await ensureTenantRegistry();
        const tenant = registry.tenants.find((entry) => entry.email === email);

        if (!tenant || tenant.status !== 'active') {
          sendText(res, 401, 'Invalid tenant credentials.');
          return;
        }

        if (tenant.passwordHash !== hashTenantSecret(password)) {
          sendText(res, 401, 'Invalid tenant credentials.');
          return;
        }

        tenant.lastLoginAt = new Date().toISOString();
        tenant.updatedAt = new Date().toISOString();
        appendTenantAuditEvent(registry, {
          actor: tenant.email,
          action: 'tenant.login',
          target: tenant.email,
          details: { slug: tenant.slug || '' },
        });
        await writeTenantRegistry(registry);
        sendJson(res, 200, { ok: true, tenant: sanitizeTenantForClient(tenant) });
      } catch (error) {
        sendText(res, 500, error instanceof Error ? error.message : 'Failed to verify tenant credentials.');
      }
      return;
    }

    if (req.method === 'GET' && pathname === '/runtime/tenant-auth/invite') {
      try {
        const inviteToken = String(searchParams.get('token') || '').trim();
        const registry = await ensureTenantRegistry();
        const tenant = findTenantByInviteToken(registry, inviteToken);

        if (!tenant || !tenant.inviteExpiresAt || Date.parse(tenant.inviteExpiresAt) <= Date.now()) {
          sendText(res, 404, 'Invite token is invalid or expired.');
          return;
        }

        sendJson(res, 200, {
          ok: true,
          tenant: {
            id: tenant.id,
            name: tenant.name,
            email: tenant.email,
            status: tenant.status,
            inviteExpiresAt: tenant.inviteExpiresAt,
            invitePurpose: tenant.invitePurpose || 'onboarding',
          },
        });
      } catch (error) {
        sendText(res, 500, error instanceof Error ? error.message : 'Failed to inspect tenant invite.');
      }
      return;
    }

    if (req.method === 'GET' && pathname === '/runtime/tenant-auth/me') {
      try {
        const tenantId = String(searchParams.get('tenantId') || '').trim();
        const registry = await ensureTenantRegistry();
        const tenant = registry.tenants.find((entry) => entry.id === tenantId);

        if (!tenant) {
          sendText(res, 404, 'Tenant not found.');
          return;
        }

        sendJson(res, 200, { ok: true, tenant: sanitizeTenantForClient(tenant) });
      } catch (error) {
        sendText(res, 500, error instanceof Error ? error.message : 'Failed to inspect tenant account.');
      }
      return;
    }

    if (req.method === 'POST' && pathname === '/runtime/tenant-auth/password') {
      try {
        const body = await readJsonBody(req);
        const tenantId = String(body.tenantId || '').trim();
        const currentPassword = String(body.currentPassword || '');
        const nextPassword = String(body.nextPassword || '').trim();

        if (nextPassword.length < 10) {
          sendText(res, 400, 'Tenant password must be at least 10 characters long.');
          return;
        }

        const registry = await ensureTenantRegistry();
        const tenant = registry.tenants.find((entry) => entry.id === tenantId);

        if (!tenant) {
          sendText(res, 404, 'Tenant not found.');
          return;
        }

        if (tenant.passwordHash !== hashTenantSecret(currentPassword)) {
          sendText(res, 401, 'Current tenant password is incorrect.');
          return;
        }

        tenant.passwordHash = hashTenantSecret(nextPassword);
        tenant.mustChangePassword = false;
        tenant.updatedAt = new Date().toISOString();
        tenant.passwordUpdatedAt = new Date().toISOString();
        appendTenantAuditEvent(registry, {
          actor: tenant.email,
          action: 'tenant.password.rotate',
          target: tenant.email,
        });
        await writeTenantRegistry(registry);
        sendJson(res, 200, { ok: true, tenant: sanitizeTenantForClient(tenant) });
      } catch (error) {
        sendText(res, 500, error instanceof Error ? error.message : 'Failed to update tenant password.');
      }
      return;
    }

    if (req.method === 'POST' && pathname === '/runtime/tenant-auth/invite/accept') {
      try {
        const body = await readJsonBody(req);
        const token = String(body.token || '').trim();
        const nextPassword = String(body.nextPassword || '').trim();

        if (nextPassword.length < 10) {
          sendText(res, 400, 'Tenant password must be at least 10 characters long.');
          return;
        }

        const registry = await ensureTenantRegistry();
        const tenant = findTenantByInviteToken(registry, token);

        if (!tenant || !tenant.inviteExpiresAt || Date.parse(tenant.inviteExpiresAt) <= Date.now()) {
          sendText(res, 404, 'Invite token is invalid or expired.');
          return;
        }

        if (tenant.status !== 'active') {
          sendText(res, 400, 'Tenant is not approved for access yet.');
          return;
        }

        tenant.passwordHash = hashTenantSecret(nextPassword);
        tenant.mustChangePassword = false;
        tenant.updatedAt = new Date().toISOString();
        tenant.passwordUpdatedAt = new Date().toISOString();
        tenant.inviteToken = null;
        tenant.inviteExpiresAt = null;
        appendTenantAuditEvent(registry, {
          actor: tenant.email,
          action: tenant.invitePurpose === 'password-reset' ? 'tenant.password.reset.accepted' : 'tenant.invite.accepted',
          target: tenant.email,
        });
        tenant.invitePurpose = null;
        await writeTenantRegistry(registry);
        sendJson(res, 200, { ok: true, tenant: sanitizeTenantForClient(tenant) });
      } catch (error) {
        sendText(res, 500, error instanceof Error ? error.message : 'Failed to accept tenant invite.');
      }
      return;
    }

    const tenantPasswordMatch = pathname.match(/^\/runtime\/tenant-admin\/tenants\/([^/]+)\/password$/);

    if (req.method === 'POST' && tenantPasswordMatch) {
      try {
        const body = await readJsonBody(req);
        const nextPassword = String(body.password || '').trim();
        const tenantId = decodeURIComponent(tenantPasswordMatch[1] || '');

        if (nextPassword.length < 10) {
          sendText(res, 400, 'Tenant password must be at least 10 characters long.');
          return;
        }

        const registry = await ensureTenantRegistry();
        const tenant = registry.tenants.find((entry) => entry.id === tenantId);

        if (!tenant) {
          sendText(res, 404, 'Tenant not found.');
          return;
        }

        tenant.passwordHash = hashTenantSecret(nextPassword);
        tenant.mustChangePassword = true;
        tenant.updatedAt = new Date().toISOString();
        tenant.passwordUpdatedAt = new Date().toISOString();
        tenant.inviteToken = createTenantInviteToken();
        tenant.inviteIssuedAt = new Date().toISOString();
        tenant.inviteExpiresAt = createTenantInviteExpiry();
        tenant.invitePurpose = 'password-reset';
        appendTenantAuditEvent(registry, {
          actor: registry.admin?.username || 'admin',
          action: 'tenant.password.reset',
          target: tenant.email,
        });

        await writeTenantRegistry(registry);
        sendJson(res, 200, { ok: true });
      } catch (error) {
        sendText(res, 500, error instanceof Error ? error.message : 'Failed to reset tenant password.');
      }
      return;
    }

    if (req.method === 'GET' && previewStatusMatch) {
      try {
        const requestedSessionId = normalizeSessionId(previewStatusMatch[1]);
        const session = getSession(requestedSessionId);
        sendJson(res, 200, {
          sessionId: requestedSessionId,
          preview: session.preview || null,
          status: session.previewDiagnostics.status,
          healthy: session.previewDiagnostics.healthy,
          updatedAt: session.previewDiagnostics.updatedAt,
          recentLogs: session.previewDiagnostics.recentLogs,
          alert: session.previewDiagnostics.alert,
          recovery: session.previewRecovery,
        });
      } catch (error) {
        sendText(res, 500, error instanceof Error ? error.message : 'Failed to inspect preview status');
      }
      return;
    }

    if (req.method === 'GET' && previewEventsMatch) {
      try {
        const requestedSessionId = normalizeSessionId(previewEventsMatch[1]);
        const session = getSession(requestedSessionId);

        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-store',
          Connection: 'keep-alive',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type',
          'X-Accel-Buffering': 'no',
        });

        res.write(': connected\n\n');
        writePreviewStateEvent(res, buildPreviewStateSummary(session));
        session.previewSubscribers.add(res);

        const heartbeat = setInterval(() => {
          try {
            res.write(': keepalive\n\n');
          } catch {
            clearInterval(heartbeat);
            session.previewSubscribers.delete(res);
          }
        }, 15000);

        req.on('close', () => {
          clearInterval(heartbeat);
          session.previewSubscribers.delete(res);
        });
      } catch (error) {
        sendText(res, 500, error instanceof Error ? error.message : 'Failed to subscribe to preview events');
      }
      return;
    }

    if (req.method === 'GET' && snapshotMatch) {
      try {
        const requestedSessionId = normalizeSessionId(snapshotMatch[1]);
        const session = getSession(requestedSessionId);
        sendJson(res, 200, {
          sessionId: requestedSessionId,
          files: session.currentFileMap || {},
          recovery: session.previewRecovery,
        });
      } catch (error) {
        sendText(res, 500, error instanceof Error ? error.message : 'Failed to inspect runtime snapshot');
      }
      return;
    }

    if (req.method === 'POST' && previewAlertMatch) {
      try {
        const requestedSessionId = normalizeSessionId(previewAlertMatch[1]);
        const session = getSession(requestedSessionId);
        const body = await readJsonBody(req);
        const alert = normalizeIncomingPreviewAlert(body.alert);

        if (!alert) {
          sendText(res, 400, 'Missing preview alert payload');
          return;
        }

        appendPreviewDiagnosticEntries(
          session,
          'browser-preview',
          `Browser reported preview failure: ${alert.description}\n${alert.content}`,
        );
        touchPreviewDiagnostics(session, {
          status: 'error',
          healthy: false,
          alert,
        });
        schedulePreviewAutoRestore(session, alert);

        sendJson(res, 200, {
          ok: true,
          sessionId: requestedSessionId,
          recovery: session.previewRecovery,
        });
      } catch (error) {
        sendText(res, 500, error instanceof Error ? error.message : 'Failed to record preview alert');
      }
      return;
    }

    if (req.method === 'POST' && syncMatch) {
      try {
        const requestedSessionId = normalizeSessionId(syncMatch[1]);
        const session = getSession(requestedSessionId);
        const body = await readJsonBody(req);
        const incomingFiles = body.files || {};
        const prune = body.prune === true;
        await runSessionOperation(session, async () => {
          session.publicOrigin = getRequestOrigin(req);
          markSessionMutationStart(session);
          await syncWorkspaceSnapshot(session, incomingFiles, { prune });
          session.currentFileMap = mergeWorkspaceFileMap(session.currentFileMap, incomingFiles, { prune });
          scheduleHostedAutoStartAfterSync(session);
          schedulePreviewVerificationAfterMutation(session, 'a workspace sync');
        });
        sendJson(res, 200, {
          ok: true,
          sessionId: requestedSessionId,
          preview: session.preview || null,
        });
      } catch (error) {
        sendText(res, 500, error instanceof Error ? error.message : 'Workspace sync failed');
      }
      return;
    }

    const commandMatch = pathname.match(/^\/runtime\/sessions\/([^/]+)\/command$/);

    if (req.method === 'POST' && commandMatch) {
      try {
        const session = getSession(normalizeSessionId(commandMatch[1]));
        const body = await readJsonBody(req);
        await runSessionOperation(session, () => handleRunCommand(req, res, session, body));
      } catch (error) {
        sendText(res, 500, error instanceof Error ? error.message : 'Runtime command failed');
      }
      return;
    }

    if (req.method === 'DELETE' && commandMatch) {
      try {
        const session = getSession(normalizeSessionId(commandMatch[1]));
        await runSessionOperation(session, () => terminateSessionProcesses(session));
        sendJson(res, 200, { ok: true });
      } catch (error) {
        sendText(res, 500, error instanceof Error ? error.message : 'Failed to terminate session');
      }
      return;
    }

    sendText(res, 404, 'bolt.gives runtime server');
  });
}

const server = createRuntimeServer();

server.on('upgrade', (req, socket, head) => {
  if ((req.url || '').startsWith('/runtime/preview/')) {
    proxyPreviewUpgrade(req, socket, head);
    return;
  }

  socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
  socket.destroy();
});

function startServer() {
  server.listen(PORT, HOST, () => {
    console.log(`[runtime] listening on http://${HOST}:${PORT}`);
    console.log(`[runtime] workspace dir: ${PERSIST_ROOT}`);

    void rolloutManagedInstancesToCurrentBuild({ reason: 'startup-sync', actor: 'system' }).catch((error) => {
      console.error('[runtime] managed instance startup sync failed:', error);
    });

    if (!managedInstanceSyncTimer && MANAGED_INSTANCE_SYNC_INTERVAL_MS > 0) {
      managedInstanceSyncTimer = setInterval(() => {
        void rolloutManagedInstancesToCurrentBuild({ reason: 'interval-sync', actor: 'system' }).catch((error) => {
          console.error('[runtime] managed instance interval sync failed:', error);
        });
      }, MANAGED_INSTANCE_SYNC_INTERVAL_MS);
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  startServer();
}
