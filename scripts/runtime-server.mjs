#!/usr/bin/env node

import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import dns from 'node:dns/promises';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import net from 'node:net';
import tls from 'node:tls';
import crypto from 'node:crypto';
import {
  createPreviewProbeCoordinator,
  extractConfiguredStartPort,
  extractPreviewPortFromOutput,
  normalizeStartCommand,
  parsePreviewProxyRequestTarget,
  rewritePreviewAssetUrls,
} from './runtime-preview.mjs';
import {
  appendManagedInstanceEvent,
  appendManagedInstanceRolloutHistory,
  buildManagedInstanceFleetSummary,
  buildManagedInstancePagesEnvConfig,
  claimManagedInstanceTrial,
  getManagedInstanceBySessionSecret,
  hashManagedInstanceValue,
  normalizeManagedInstanceRegistry,
  resolveManagedInstancePagesAddress,
  sanitizeManagedInstanceForClient,
  sanitizeManagedInstanceForOperator,
  slugifyManagedInstanceSubdomain,
} from './managed-instances.mjs';
import {
  buildAdminDatabaseConfig,
  listBugReports,
  listAdminEmailMessages,
  listClientProfiles,
  listManagedInstanceAssignments,
  recordBugReport,
  syncManagedInstanceAssignments,
  upsertClientProfile,
  upsertManagedInstanceAssignment,
} from './admin-db.mjs';
import {
  buildAdminMailSupport,
  resetAdminMailTransporter,
  sendAdminEmail,
  sendAdminEmailBatch,
  sendBugReportNotification,
  sendContributorApplicationEmails,
} from './admin-mailer.mjs';
import { updateRuntimeEnvFile } from './runtime-env-file.mjs';
import {
  buildRuntimeNodeConfig,
  createRuntimeNodeWorkspaceRecord,
  normalizeRuntimeNodeWorkspaceRegistry,
  runRuntimeNodeProvision,
  sanitizeRuntimeNodeConfigForClient,
  sanitizeRuntimeNodeWorkspaceForClient,
  slugifyRuntimeNodeProject,
  validateRuntimeNodeUsername,
} from './runtime-node-workspaces.mjs';
import {
  appendProjectDeploymentEvent,
  buildCustomDomainDnsInstructions,
  buildProjectHostname,
  buildResolvedProjectDnsStatus,
  encodeStripeForm,
  findProjectDeploymentByHost,
  isLikelyValidCustomDomain,
  normalizeCustomDomain,
  normalizeProjectDeploymentRegistry,
  sanitizeProjectDeploymentForClient,
  validateProjectSubdomain,
} from './project-deployments.mjs';

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
const VITE_MAIN_ENTRY_SRC_RE =
  /<script[^>]+type=(['"])module\1[^>]+src=(['"])(\/src\/main\.(tsx|jsx))\2[^>]*><\/script>/i;
const PREVIEW_ERROR_PATTERNS = [
  /\[plugin:vite:[^\]]+\]/i,
  /Pre-transform error/i,
  /Transform failed with \d+ error/i,
  /Failed to resolve import/i,
  /Failed to scan for dependencies from entries/i,
  /Failed to load url/i,
  /Could not resolve/i,
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
const RUNTIME_NODE_WORKSPACE_REGISTRY_PATH =
  process.env.RUNTIME_NODE_WORKSPACE_REGISTRY_PATH || path.join(PERSIST_ROOT, 'runtime-node-workspaces.json');
const PROJECT_DEPLOYMENT_REGISTRY_PATH =
  process.env.RUNTIME_PROJECT_DEPLOYMENT_REGISTRY_PATH || path.join(PERSIST_ROOT, 'project-deployments.json');
const PROJECT_DOMAIN_ROOT = process.env.BOLT_PROJECT_DOMAIN_ROOT || 'bolt.gives';
const PROJECT_PUBLIC_IP =
  process.env.BOLT_PROJECT_PUBLIC_IP ||
  process.env.BOLT_RUNTIME_NODE_PUBLIC_HOST ||
  process.env.BOLT_RUNTIME_NODE_HOST ||
  '';
const PROJECT_CADDY_ENABLED = process.env.BOLT_PROJECT_CADDY_ENABLED !== 'false';
const PROJECT_CADDY_SNIPPET_DIR = process.env.BOLT_PROJECT_CADDY_SNIPPET_DIR || '/etc/caddy/bolt-gives-projects';
const PROJECT_CADDYFILE_PATH = process.env.BOLT_PROJECT_CADDYFILE_PATH || '/etc/caddy/Caddyfile';
const PROJECT_HTTPS_READY_TIMEOUT_MS = Number(process.env.BOLT_PROJECT_HTTPS_READY_TIMEOUT_MS || '30000');
const PROJECT_HTTPS_READY_INTERVAL_MS = Number(process.env.BOLT_PROJECT_HTTPS_READY_INTERVAL_MS || '1000');
const STRIPE_PUBLISHABLE_KEY = process.env.BOLT_STRIPE_PUBLISHABLE_KEY || '';
const STRIPE_SECRET_KEY = process.env.BOLT_STRIPE_SECRET_KEY || '';
const STRIPE_CUSTOM_DOMAIN_PRICE_USD = Number(process.env.BOLT_STRIPE_CUSTOM_DOMAIN_PRICE_USD || '10');
const MANAGED_INSTANCE_REGISTRY_PATH =
  process.env.RUNTIME_MANAGED_INSTANCE_REGISTRY_PATH || path.join(PERSIST_ROOT, 'managed-instance-registry.json');
const MANAGED_INSTANCE_TRIAL_DAYS = Number(process.env.RUNTIME_MANAGED_INSTANCE_TRIAL_DAYS || '0');
const MANAGED_INSTANCE_ROOT_DOMAIN = process.env.RUNTIME_MANAGED_INSTANCE_ROOT_DOMAIN || 'pages.dev';
const MANAGED_INSTANCE_SOURCE_BRANCH = process.env.RUNTIME_MANAGED_INSTANCE_SOURCE_BRANCH || 'main';
const MANAGED_INSTANCE_DEPLOY_DIR =
  process.env.RUNTIME_MANAGED_INSTANCE_DEPLOY_DIR || path.join(REPO_ROOT, 'build', 'client');
const MANAGED_INSTANCE_SERVER_BUILD_PATH =
  process.env.RUNTIME_MANAGED_INSTANCE_SERVER_BUILD_PATH ||
  path.join(path.dirname(MANAGED_INSTANCE_DEPLOY_DIR), 'server', 'index.js');
const MANAGED_INSTANCE_SYNC_INTERVAL_MS = Number(process.env.RUNTIME_MANAGED_INSTANCE_SYNC_INTERVAL_MS || '600000');
const MANAGED_INSTANCE_DELETE_ON_SUSPEND = process.env.RUNTIME_MANAGED_INSTANCE_DELETE_ON_SUSPEND === '1';
const MANAGED_INSTANCE_PUBLIC_ENABLED = process.env.RUNTIME_MANAGED_INSTANCE_ENABLED !== 'false';
const MANAGED_INSTANCE_HOSTED_FREE_RELAY_ORIGIN =
  process.env.BOLT_MANAGED_INSTANCE_HOSTED_FREE_RELAY_ORIGIN ||
  process.env.BOLT_HOSTED_FREE_RELAY_ORIGIN ||
  'https://bolt.gives';
const MANAGED_INSTANCE_RUNTIME_CONTROL_PUBLIC_URL =
  process.env.BOLT_MANAGED_INSTANCE_RUNTIME_CONTROL_PUBLIC_URL ||
  process.env.BOLT_RUNTIME_CONTROL_PUBLIC_URL ||
  'https://bolt.gives/runtime';
const MANAGED_INSTANCE_HOSTED_FREE_RELAY_SECRET =
  process.env.BOLT_HOSTED_FREE_RELAY_SECRET || process.env.HOSTED_FREE_RELAY_SECRET || '';
const FREE_USAGE_QUOTA_SECRET =
  process.env.BOLT_FREE_USAGE_QUOTA_SECRET ||
  process.env.FREE_USAGE_QUOTA_SECRET ||
  MANAGED_INSTANCE_HOSTED_FREE_RELAY_SECRET;
const FREE_USAGE_QUOTA_PATH =
  process.env.RUNTIME_FREE_USAGE_QUOTA_PATH || path.join(PERSIST_ROOT, 'free-usage-quota.json');
const FREE_USAGE_DAILY_LIMIT_USD = Number(
  process.env.BOLT_FREE_DAILY_USD_LIMIT || process.env.FREE_DAILY_USD_LIMIT || '1',
);
const ADMIN_DB_CONFIG = buildAdminDatabaseConfig();
const ADMIN_PANEL_PUBLIC_URL = process.env.BOLT_ADMIN_PANEL_PUBLIC_URL || 'https://admin.bolt.gives';
const SHOUTBOX_MESSAGES_PATH =
  process.env.RUNTIME_SHOUTBOX_MESSAGES_PATH || path.join(PERSIST_ROOT, 'shout-messages.json');
const MAX_SHOUTBOX_MESSAGES = Number(process.env.RUNTIME_SHOUTBOX_MAX_MESSAGES || '250');
const BUG_REPORTS_RATE_LIMIT = new Map();
const BUG_REPORT_WINDOW_MS = 30 * 60 * 1000;
const BUG_REPORT_MAX_PER_WINDOW = 5;

function normalizeBooleanInput(value) {
  return ['1', 'true', 'yes', 'on'].includes(
    String(value || '')
      .trim()
      .toLowerCase(),
  );
}

function deriveBugReporterKey(req, reporterEmail = '') {
  const forwardedFor = String(req.headers['x-forwarded-for'] || '')
    .split(',')[0]
    ?.trim();
  const connectingIp = String(req.headers['cf-connecting-ip'] || '').trim();
  const remote = String(req.socket?.remoteAddress || '').trim();
  return reporterEmail || connectingIp || forwardedFor || remote || 'unknown';
}

function consumeBugReportRateLimit(key) {
  const now = Date.now();
  const current = BUG_REPORTS_RATE_LIMIT.get(key);

  if (!current || current.resetAt <= now) {
    BUG_REPORTS_RATE_LIMIT.set(key, {
      count: 1,
      resetAt: now + BUG_REPORT_WINDOW_MS,
    });
    return true;
  }

  if (current.count >= BUG_REPORT_MAX_PER_WINDOW) {
    return false;
  }

  current.count += 1;
  BUG_REPORTS_RATE_LIMIT.set(key, current);
  return true;
}

const sessions = new Map();
const managedInstanceLocks = new Map();
const reservedPreviewPorts = new Map();
let managedInstanceSyncTimer = null;
let managedInstanceRolloutPromise = null;
let managedRolloutGuardState = {
  allowed: true,
  reason: null,
  currentSha: null,
  originMainSha: null,
  behindCount: 0,
  checkedAt: null,
  expiresAt: 0,
};

const PROJECT_MANIFEST_FILES = ['package.json', 'package.json5', 'package.yaml'];
const SOURCE_IMPORT_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.mts', '.cts']);
const JSX_SOURCE_EXTENSIONS = new Set(['.jsx', '.tsx']);
const STYLE_IMPORT_EXTENSIONS = new Set(['.css', '.scss', '.sass', '.less']);
const STARTER_ENTRY_FILE_RE =
  /(^|\/)(src\/App\.(?:[jt]sx?|vue|svelte)|app\/page\.(?:[jt]sx?)|src\/main\.(?:[jt]sx?))$/i;
const STARTER_PLACEHOLDER_TEXT = 'Your fallback starter is ready.';
const SNAPSHOT_TEXT_FILE_BYTES_LIMIT = Number(process.env.RUNTIME_SNAPSHOT_TEXT_FILE_BYTES_LIMIT || '1048576');
const LEGACY_TAILWIND_DIRECTIVE_RE =
  /^\s*(?:@import\s+['"]tailwindcss\/(?:base|components|utilities)['"]\s*;|@tailwind\s+(?:base|components|utilities)\s*;)\s*$/gim;
const HOSTED_VITE_BOOTSTRAP_PACKAGE_VERSIONS = {
  react: '^18.3.1',
  reactDom: '^18.3.1',
  vite: '^5.4.19',
  pluginReact: '^4.7.0',
};

function normalizeRuntimeSecret(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

export function authorizeHostedFreeRelaySecret(
  providedSecret,
  expectedSecret = MANAGED_INSTANCE_HOSTED_FREE_RELAY_SECRET,
) {
  const normalizedProvidedSecret = normalizeRuntimeSecret(providedSecret);
  const normalizedExpectedSecret = normalizeRuntimeSecret(expectedSecret);

  if (!normalizedProvidedSecret || !normalizedExpectedSecret) {
    return false;
  }

  return normalizedProvidedSecret === normalizedExpectedSecret;
}

export function authorizeFreeUsageQuotaSecret(providedSecret, expectedSecret = FREE_USAGE_QUOTA_SECRET) {
  return authorizeHostedFreeRelaySecret(providedSecret, expectedSecret);
}

export function getFreeUsageQuotaDayKey(now = new Date()) {
  return new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function getFreeUsageQuotaResetAt(now = new Date()) {
  const shifted = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  const nextLocalMidnight = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate() + 1,
    0,
    0,
    0,
    0,
  );

  return new Date(nextLocalMidnight - 2 * 60 * 60 * 1000).toISOString();
}

function normalizeFreeUsageLimitUsd(value = FREE_USAGE_DAILY_LIMIT_USD) {
  const limit = Number(value);
  return Number.isFinite(limit) && limit > 0 ? limit : 1;
}

function normalizeFreeUsageCostUsd(value) {
  const cost = Number(value);
  return Number.isFinite(cost) && cost > 0 ? cost : 0;
}

function normalizeFreeUsageTokens(value) {
  const tokens = Number(value);
  return Number.isFinite(tokens) && tokens > 0 ? tokens : 0;
}

export function normalizeFreeUsageQuotaLedger(input) {
  const days = {};

  if (!input || typeof input !== 'object' || !input.days || typeof input.days !== 'object') {
    return { version: 1, days };
  }

  for (const [dayKey, rawSubjects] of Object.entries(input.days)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey) || !rawSubjects || typeof rawSubjects !== 'object') {
      continue;
    }

    const subjects = {};

    for (const [subjectHash, rawEntry] of Object.entries(rawSubjects)) {
      if (!/^[a-f0-9]{64}$/i.test(subjectHash) || !rawEntry || typeof rawEntry !== 'object') {
        continue;
      }

      subjects[subjectHash] = {
        costUsd: normalizeFreeUsageCostUsd(rawEntry.costUsd),
        requests: Math.max(0, Math.floor(Number(rawEntry.requests) || 0)),
        promptTokens: normalizeFreeUsageTokens(rawEntry.promptTokens),
        completionTokens: normalizeFreeUsageTokens(rawEntry.completionTokens),
        totalTokens: normalizeFreeUsageTokens(rawEntry.totalTokens),
        updatedAt: typeof rawEntry.updatedAt === 'string' ? rawEntry.updatedAt : null,
      };
    }

    days[dayKey] = subjects;
  }

  return { version: 1, days };
}

export function buildFreeUsageQuotaDecision(entry = {}, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const limitUsd = normalizeFreeUsageLimitUsd(options.limitUsd);
  const usedUsd = normalizeFreeUsageCostUsd(entry?.costUsd);
  const remainingUsd = Math.max(0, limitUsd - usedUsd);
  const allowed = usedUsd < limitUsd;
  const message = allowed
    ? null
    : 'You have hit your FREE daily coding limit for today. You can use your own API key from any provider or wait for the limit to reset at 00:00 GMT+2.';

  return {
    allowed,
    usedUsd,
    remainingUsd,
    limitUsd,
    resetAt: getFreeUsageQuotaResetAt(now),
    resetTimezone: 'GMT+2',
    message,
  };
}

async function readFreeUsageQuotaLedger() {
  try {
    const raw = await fs.readFile(FREE_USAGE_QUOTA_PATH, 'utf8');
    return normalizeFreeUsageQuotaLedger(JSON.parse(raw));
  } catch {
    return normalizeFreeUsageQuotaLedger(null);
  }
}

async function writeFreeUsageQuotaLedger(ledger) {
  await fs.mkdir(path.dirname(FREE_USAGE_QUOTA_PATH), { recursive: true });
  await writeJsonAtomically(FREE_USAGE_QUOTA_PATH, JSON.stringify(normalizeFreeUsageQuotaLedger(ledger), null, 2));
}

function pruneFreeUsageQuotaLedger(ledger, activeDayKey) {
  for (const dayKey of Object.keys(ledger.days)) {
    if (dayKey !== activeDayKey) {
      delete ledger.days[dayKey];
    }
  }
}

function assertValidFreeUsageQuotaSubject(subjectHash) {
  const normalized = String(subjectHash || '')
    .trim()
    .toLowerCase();

  if (!/^[a-f0-9]{64}$/.test(normalized)) {
    throw new Error('Invalid FREE quota subject.');
  }

  return normalized;
}

function normalizeFreeUsageQuotaUsage(usage) {
  if (!usage || typeof usage !== 'object') {
    return {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    };
  }

  const promptTokens = normalizeFreeUsageTokens(usage.promptTokens ?? usage.inputTokens ?? usage.prompt_tokens);
  const completionTokens = normalizeFreeUsageTokens(
    usage.completionTokens ?? usage.outputTokens ?? usage.completion_tokens,
  );
  const totalTokens = Math.max(
    normalizeFreeUsageTokens(usage.totalTokens ?? usage.total_tokens),
    promptTokens + completionTokens,
  );

  return {
    promptTokens,
    completionTokens,
    totalTokens,
  };
}

export async function checkFreeUsageQuota({ subjectHash, limitUsd, now = new Date() } = {}) {
  const normalizedSubjectHash = assertValidFreeUsageQuotaSubject(subjectHash);
  const dayKey = getFreeUsageQuotaDayKey(now);
  const ledger = await readFreeUsageQuotaLedger();
  pruneFreeUsageQuotaLedger(ledger, dayKey);
  const entry = ledger.days[dayKey]?.[normalizedSubjectHash] || {};

  return buildFreeUsageQuotaDecision(entry, { limitUsd, now });
}

export async function recordFreeUsageQuota({ subjectHash, costUsd, usage, limitUsd, now = new Date() } = {}) {
  const normalizedSubjectHash = assertValidFreeUsageQuotaSubject(subjectHash);
  const dayKey = getFreeUsageQuotaDayKey(now);
  const ledger = await readFreeUsageQuotaLedger();
  pruneFreeUsageQuotaLedger(ledger, dayKey);
  const day = ledger.days[dayKey] || {};
  const entry = day[normalizedSubjectHash] || {
    costUsd: 0,
    requests: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    updatedAt: null,
  };
  const normalizedUsage = normalizeFreeUsageQuotaUsage(usage);

  entry.costUsd = normalizeFreeUsageCostUsd(entry.costUsd) + normalizeFreeUsageCostUsd(costUsd);
  entry.requests = Math.max(0, Math.floor(Number(entry.requests) || 0)) + 1;
  entry.promptTokens = normalizeFreeUsageTokens(entry.promptTokens) + normalizedUsage.promptTokens;
  entry.completionTokens = normalizeFreeUsageTokens(entry.completionTokens) + normalizedUsage.completionTokens;
  entry.totalTokens = normalizeFreeUsageTokens(entry.totalTokens) + normalizedUsage.totalTokens;
  entry.updatedAt = now.toISOString();
  day[normalizedSubjectHash] = entry;
  ledger.days[dayKey] = day;

  await writeFreeUsageQuotaLedger(ledger);

  return buildFreeUsageQuotaDecision(entry, { limitUsd, now });
}

function buildClientRegistrationSource(hostname = '') {
  return hostname ? `managed-instance:${String(hostname).trim().toLowerCase()}` : 'managed-instance:runtime';
}

async function syncManagedInstanceToAdminDatabase(instance) {
  if (!ADMIN_DB_CONFIG.enabled || !instance) {
    return;
  }

  await upsertManagedInstanceAssignment(instance);
}

async function syncManagedRegistryToAdminDatabase(registry) {
  if (!ADMIN_DB_CONFIG.enabled || !registry?.instances) {
    return [];
  }

  return await syncManagedInstanceAssignments(registry.instances);
}

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

export function buildManagedInstanceRolloutGuardDecision(input = {}) {
  const hasGitMetadata = input.hasGitMetadata !== false;

  if (!hasGitMetadata) {
    return {
      allowed: false,
      reason: 'Managed-instance rollout requires a live checkout with git metadata at /srv/bolt-gives/.git.',
      currentSha: null,
      originMainSha: null,
      behindCount: 0,
      checkedAt: new Date().toISOString(),
    };
  }

  if (input.fetchError) {
    return {
      allowed: false,
      reason: `Managed-instance rollout guard could not refresh origin/main: ${input.fetchError}`,
      currentSha: input.currentSha || null,
      originMainSha: input.originMainSha || null,
      behindCount: 0,
      checkedAt: new Date().toISOString(),
    };
  }

  const behindCount = Number(input.behindCount || 0);

  if (behindCount > 0) {
    return {
      allowed: false,
      reason: `Managed-instance rollout refused because the live checkout is ${behindCount} commit(s) behind origin/main.`,
      currentSha: input.currentSha || null,
      originMainSha: input.originMainSha || null,
      behindCount,
      checkedAt: new Date().toISOString(),
    };
  }

  return {
    allowed: true,
    reason: null,
    currentSha: input.currentSha || null,
    originMainSha: input.originMainSha || input.currentSha || null,
    behindCount: 0,
    checkedAt: new Date().toISOString(),
  };
}

export function buildManagedInstanceDeployArtifactDecision({
  deployDirReadable,
  serverBuildReadable,
  deployDir = MANAGED_INSTANCE_DEPLOY_DIR,
  serverBuildPath = MANAGED_INSTANCE_SERVER_BUILD_PATH,
}) {
  if (!deployDirReadable) {
    return {
      ready: false,
      reason: `Managed instance deploy artifact is not ready yet: ${deployDir} is missing or unreadable.`,
    };
  }

  if (!serverBuildReadable) {
    return {
      ready: false,
      reason: `Managed instance deploy artifact is not ready yet: ${serverBuildPath} is missing or unreadable.`,
    };
  }

  return { ready: true, reason: null };
}

async function inspectManagedInstanceDeployArtifact() {
  const [deployDirReadable, serverBuildReadable] = await Promise.all([
    fs.access(MANAGED_INSTANCE_DEPLOY_DIR, fsConstants.R_OK).then(
      () => true,
      () => false,
    ),
    fs.access(MANAGED_INSTANCE_SERVER_BUILD_PATH, fsConstants.R_OK).then(
      () => true,
      () => false,
    ),
  ]);

  return buildManagedInstanceDeployArtifactDecision({
    deployDirReadable,
    serverBuildReadable,
  });
}

async function assertManagedInstanceDeployArtifactReady() {
  const artifact = await inspectManagedInstanceDeployArtifact();

  if (!artifact.ready) {
    throw new Error(artifact.reason || 'Managed instance deploy artifact is not ready yet.');
  }
}

async function resolveManagedRolloutGuardState({ force = false } = {}) {
  const now = Date.now();

  if (!force && managedRolloutGuardState.checkedAt && managedRolloutGuardState.expiresAt > now) {
    return managedRolloutGuardState;
  }

  const gitDir = path.join(REPO_ROOT, '.git');

  try {
    await fs.access(gitDir, fsConstants.R_OK);
  } catch {
    managedRolloutGuardState = {
      ...buildManagedInstanceRolloutGuardDecision({ hasGitMetadata: false }),
      expiresAt: now + 60000,
    };
    return managedRolloutGuardState;
  }

  const fetchResult = await runManagedInstanceProcess('git', [
    'fetch',
    'origin',
    MANAGED_INSTANCE_SOURCE_BRANCH,
    '--quiet',
  ]);

  if (fetchResult.code !== 0) {
    managedRolloutGuardState = {
      ...buildManagedInstanceRolloutGuardDecision({
        fetchError: fetchResult.stderr.trim() || fetchResult.stdout.trim() || 'git fetch failed',
      }),
      expiresAt: now + 60000,
    };
    return managedRolloutGuardState;
  }

  const [currentResult, originResult, behindResult] = await Promise.all([
    runManagedInstanceProcess('git', ['rev-parse', 'HEAD']),
    runManagedInstanceProcess('git', ['rev-parse', `origin/${MANAGED_INSTANCE_SOURCE_BRANCH}`]),
    runManagedInstanceProcess('git', ['rev-list', '--count', `HEAD..origin/${MANAGED_INSTANCE_SOURCE_BRANCH}`]),
  ]);

  managedRolloutGuardState = {
    ...buildManagedInstanceRolloutGuardDecision({
      hasGitMetadata: true,
      currentSha: currentResult.code === 0 ? currentResult.stdout.trim() : null,
      originMainSha: originResult.code === 0 ? originResult.stdout.trim() : null,
      behindCount: behindResult.code === 0 ? Number(behindResult.stdout.trim() || '0') : 0,
    }),
    expiresAt: now + 60000,
  };

  return managedRolloutGuardState;
}

async function buildManagedInstanceSupportState() {
  const config = getManagedInstanceCloudflareConfig();

  if (!MANAGED_INSTANCE_PUBLIC_ENABLED) {
    return {
      supported: false,
      reason: 'Managed Cloudflare trial instances are disabled on this deployment.',
      trialDays: MANAGED_INSTANCE_TRIAL_DAYS,
      rootDomain: MANAGED_INSTANCE_ROOT_DOMAIN,
      sourceBranch: MANAGED_INSTANCE_SOURCE_BRANCH,
      rolloutGuard: await resolveManagedRolloutGuardState(),
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
      rolloutGuard: await resolveManagedRolloutGuardState(),
    };
  }

  const rolloutGuard = await resolveManagedRolloutGuardState();

  if (!rolloutGuard.allowed) {
    return {
      supported: false,
      reason: rolloutGuard.reason,
      trialDays: MANAGED_INSTANCE_TRIAL_DAYS,
      rootDomain: MANAGED_INSTANCE_ROOT_DOMAIN,
      sourceBranch: MANAGED_INSTANCE_SOURCE_BRANCH,
      rolloutGuard,
    };
  }

  const deployArtifact = await inspectManagedInstanceDeployArtifact();

  if (!deployArtifact.ready) {
    return {
      supported: false,
      reason: deployArtifact.reason,
      trialDays: MANAGED_INSTANCE_TRIAL_DAYS,
      rootDomain: MANAGED_INSTANCE_ROOT_DOMAIN,
      sourceBranch: MANAGED_INSTANCE_SOURCE_BRANCH,
      rolloutGuard,
    };
  }

  return {
    supported: true,
    reason: null,
    trialDays: MANAGED_INSTANCE_TRIAL_DAYS,
    rootDomain: MANAGED_INSTANCE_ROOT_DOMAIN,
    sourceBranch: MANAGED_INSTANCE_SOURCE_BRANCH,
    rolloutGuard,
  };
}

async function ensureManagedInstanceRegistry() {
  try {
    const raw = await fs.readFile(MANAGED_INSTANCE_REGISTRY_PATH, 'utf8');
    const registry = normalizeManagedInstanceRegistry(JSON.parse(raw), {
      defaultRootDomain: MANAGED_INSTANCE_ROOT_DOMAIN,
      defaultTrialDays: MANAGED_INSTANCE_TRIAL_DAYS,
    });
    const recovered = await maybeRecoverManagedInstanceRegistryFromAdminAssignments(registry);

    if (recovered) {
      await writeManagedInstanceRegistry(recovered);
      return recovered;
    }

    await writeManagedInstanceRegistry(registry);
    return registry;
  } catch {
    await fs.mkdir(path.dirname(MANAGED_INSTANCE_REGISTRY_PATH), { recursive: true });
    const registry =
      (await buildManagedInstanceRegistryFromAdminAssignments()) ||
      normalizeManagedInstanceRegistry(
        {
          rootDomain: MANAGED_INSTANCE_ROOT_DOMAIN,
          instances: [],
          events: [],
        },
        { defaultRootDomain: MANAGED_INSTANCE_ROOT_DOMAIN, defaultTrialDays: MANAGED_INSTANCE_TRIAL_DAYS },
      );
    await writeManagedInstanceRegistry(registry);
    return registry;
  }
}

export async function writeJsonAtomically(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tempPath, payload, 'utf8');
  await fs.rename(tempPath, filePath);
}

async function writeManagedInstanceRegistry(registry) {
  await writeJsonAtomically(MANAGED_INSTANCE_REGISTRY_PATH, JSON.stringify(registry, null, 2));
}

async function ensureRuntimeNodeWorkspaceRegistry() {
  try {
    const raw = await fs.readFile(RUNTIME_NODE_WORKSPACE_REGISTRY_PATH, 'utf8');
    const registry = normalizeRuntimeNodeWorkspaceRegistry(JSON.parse(raw));
    await writeRuntimeNodeWorkspaceRegistry(registry);
    return registry;
  } catch {
    const registry = normalizeRuntimeNodeWorkspaceRegistry({ workspaces: [], events: [] });
    await writeRuntimeNodeWorkspaceRegistry(registry);
    return registry;
  }
}

async function writeRuntimeNodeWorkspaceRegistry(registry) {
  await writeJsonAtomically(RUNTIME_NODE_WORKSPACE_REGISTRY_PATH, JSON.stringify(registry, null, 2));
}

function appendRuntimeNodeWorkspaceEvent(registry, event) {
  const events = Array.isArray(registry.events) ? registry.events.slice(-499) : [];
  events.push({
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    ...event,
  });
  registry.events = events;
}

function buildRuntimeNodeWorkspaceSummary(workspaces = []) {
  return {
    total: workspaces.length,
    active: workspaces.filter((workspace) => workspace.status === 'active').length,
    provisioning: workspaces.filter((workspace) => workspace.status === 'provisioning').length,
    failed: workspaces.filter((workspace) => workspace.status === 'failed').length,
    suspended: workspaces.filter((workspace) => workspace.status === 'suspended').length,
  };
}

function redactRuntimeNodeError(message, secrets = {}) {
  let next = String(message || 'Runtime node provisioning failed.');

  for (const secret of [secrets.cliPassword, secrets.databasePassword]) {
    if (secret) {
      next = next.split(secret).join('[redacted]');
    }
  }

  return next;
}

async function ensureProjectDeploymentRegistry() {
  try {
    const raw = await fs.readFile(PROJECT_DEPLOYMENT_REGISTRY_PATH, 'utf8');
    const registry = normalizeProjectDeploymentRegistry(JSON.parse(raw));
    await writeProjectDeploymentRegistry(registry);
    return registry;
  } catch {
    const registry = normalizeProjectDeploymentRegistry({ deployments: [], events: [] });
    await writeProjectDeploymentRegistry(registry);
    return registry;
  }
}

async function writeProjectDeploymentRegistry(registry) {
  await writeJsonAtomically(PROJECT_DEPLOYMENT_REGISTRY_PATH, JSON.stringify(registry, null, 2));
}

function buildAutoRuntimeNodeProjectSlug(sessionId) {
  const hash = crypto
    .createHash('sha1')
    .update(String(sessionId || ''))
    .digest('hex')
    .slice(0, 16);
  return slugifyRuntimeNodeProject(`project-${hash}`);
}

function buildAutoRuntimeNodeUsername(sessionId) {
  const hash = crypto
    .createHash('sha1')
    .update(String(sessionId || ''))
    .digest('hex')
    .slice(0, 12);
  return `bolt_${hash}`.slice(0, 28);
}

function createStrongRuntimeNodePassword() {
  return `Bolt-${crypto.randomBytes(18).toString('base64url')}9a`;
}

async function ensureRuntimeNodeWorkspaceForSession(session, options = {}) {
  if (session.runtimeNodeWorkspace?.status === 'active' || session.runtimeNodeWorkspace?.status === 'provisioning') {
    return session.runtimeNodeWorkspace;
  }

  if (session.runtimeNodeProvisionPromise) {
    return session.runtimeNodeWorkspace || null;
  }

  const config = buildRuntimeNodeConfig();

  if (!config.supported) {
    session.runtimeNodeWorkspace = {
      supported: false,
      status: 'unavailable',
      reason: config.reason || 'Dedicated runtime-node workspaces are unavailable.',
    };
    return session.runtimeNodeWorkspace;
  }

  const projectSlug = buildAutoRuntimeNodeProjectSlug(session.id);
  const cliUsername = buildAutoRuntimeNodeUsername(session.id);
  const clientEmail = String(options.clientEmail || `workspace-${projectSlug}@bolt.gives`).toLowerCase();
  const clientName = String(options.clientName || 'bolt.gives project workspace').trim();

  session.runtimeNodeProvisionPromise = (async () => {
    let stagedWorkspace = null;
    let stagedSecrets = null;

    try {
      const registry = await ensureRuntimeNodeWorkspaceRegistry();
      const existing = registry.workspaces.find(
        (workspace) => workspace.projectSlug === projectSlug || workspace.cliUsername === cliUsername,
      );

      if (existing) {
        session.runtimeNodeWorkspace = sanitizeRuntimeNodeWorkspaceForClient(existing);
        return existing;
      }

      const { record, secrets } = createRuntimeNodeWorkspaceRecord(
        {
          clientName,
          clientEmail,
          projectName: projectSlug,
          cliUsername,
          cliPassword: createStrongRuntimeNodePassword(),
        },
        config,
      );

      stagedWorkspace = record;
      stagedSecrets = secrets;
      session.runtimeNodeWorkspace = sanitizeRuntimeNodeWorkspaceForClient(record);
      registry.workspaces.unshift(record);
      appendRuntimeNodeWorkspaceEvent(registry, {
        actor: 'runtime-session',
        action: 'runtime-node.workspace.auto-requested',
        target: record.projectSlug,
        details: {
          sessionId: session.id,
          cliUsername: record.cliUsername,
          workspaceDir: record.workspaceDir,
        },
      });
      await writeRuntimeNodeWorkspaceRegistry(registry);
      await runRuntimeNodeProvision(record, secrets, config);

      record.status = 'active';
      record.provisionedAt = new Date().toISOString();
      record.updatedAt = record.provisionedAt;
      record.lastError = null;
      session.runtimeNodeWorkspace = sanitizeRuntimeNodeWorkspaceForClient(record);
      appendRuntimeNodeWorkspaceEvent(registry, {
        actor: 'runtime-session',
        action: 'runtime-node.workspace.auto-provisioned',
        target: record.projectSlug,
        details: {
          sessionId: session.id,
          cliUsername: record.cliUsername,
          workspaceDir: record.workspaceDir,
          databaseName: record.databaseName,
        },
      });
      await writeRuntimeNodeWorkspaceRegistry(registry);
      broadcastPreviewState(session);
      return record;
    } catch (error) {
      const registry = await ensureRuntimeNodeWorkspaceRegistry();
      const message = redactRuntimeNodeError(
        error instanceof Error ? error.message : String(error),
        stagedSecrets || {},
      );

      if (stagedWorkspace) {
        const existing = registry.workspaces.find((workspace) => workspace.id === stagedWorkspace.id);
        const target = existing || stagedWorkspace;
        target.status = 'failed';
        target.updatedAt = new Date().toISOString();
        target.lastError = message;

        if (!existing) {
          registry.workspaces.unshift(target);
        }

        session.runtimeNodeWorkspace = sanitizeRuntimeNodeWorkspaceForClient(target);
        appendRuntimeNodeWorkspaceEvent(registry, {
          actor: 'runtime-session',
          action: 'runtime-node.workspace.auto-failed',
          target: stagedWorkspace.projectSlug,
          details: { sessionId: session.id, error: message },
        });
        await writeRuntimeNodeWorkspaceRegistry(registry);
      } else {
        session.runtimeNodeWorkspace = {
          supported: true,
          status: 'failed',
          reason: message,
        };
      }

      broadcastPreviewState(session);
      return null;
    } finally {
      session.runtimeNodeProvisionPromise = null;
    }
  })();

  void session.runtimeNodeProvisionPromise;
  return session.runtimeNodeWorkspace;
}

export function buildManagedInstanceRegistryFromAssignments(assignments = []) {
  if (!Array.isArray(assignments) || assignments.length === 0) {
    return null;
  }

  return normalizeManagedInstanceRegistry(
    {
      rootDomain: MANAGED_INSTANCE_ROOT_DOMAIN,
      instances: assignments,
      events: [],
    },
    { defaultRootDomain: MANAGED_INSTANCE_ROOT_DOMAIN, defaultTrialDays: MANAGED_INSTANCE_TRIAL_DAYS },
  );
}

export async function buildManagedInstanceRegistryFromAdminAssignments() {
  if (!ADMIN_DB_CONFIG.enabled) {
    return null;
  }

  return buildManagedInstanceRegistryFromAssignments(await listManagedInstanceAssignments());
}

async function maybeRecoverManagedInstanceRegistryFromAdminAssignments(registry) {
  if (!ADMIN_DB_CONFIG.enabled || registry.instances.length > 0) {
    return null;
  }

  return await buildManagedInstanceRegistryFromAdminAssignments();
}

async function runManagedInstanceProcess(command, args, { cwd = REPO_ROOT, env = {}, input = '' } = {}) {
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

    if (child.stdin) {
      if (input) {
        child.stdin.write(input);
      }

      child.stdin.end();
    }

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

function buildManagedInstanceDeploymentConfigs() {
  return buildManagedInstancePagesEnvConfig({
    hostedFreeRelayOrigin: MANAGED_INSTANCE_HOSTED_FREE_RELAY_ORIGIN,
    runtimeControlPublicUrl: MANAGED_INSTANCE_RUNTIME_CONTROL_PUBLIC_URL,
  });
}

async function upsertManagedInstanceProjectSecret(instance, secretName, secretValue) {
  const normalizedSecretValue = String(secretValue || '').trim();

  if (!normalizedSecretValue) {
    return;
  }

  const config = getManagedInstanceCloudflareConfig();
  const result = await runManagedInstanceProcess(
    'pnpm',
    ['exec', 'wrangler', 'pages', 'secret', 'put', secretName, '--project-name', instance.projectName],
    {
      env: {
        CLOUDFLARE_API_TOKEN: config.apiToken,
        CLOUDFLARE_ACCOUNT_ID: config.accountId,
      },
      input: normalizedSecretValue,
    },
  );

  if (result.code !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || `Failed to set Pages secret ${secretName}.`);
  }
}

async function configureManagedInstanceProject(instance) {
  if (!MANAGED_INSTANCE_HOSTED_FREE_RELAY_ORIGIN && !MANAGED_INSTANCE_RUNTIME_CONTROL_PUBLIC_URL) {
    return;
  }

  const config = getManagedInstanceCloudflareConfig();
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(config.accountId)}/pages/projects/${encodeURIComponent(instance.projectName)}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${config.apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        deployment_configs: buildManagedInstanceDeploymentConfigs(),
      }),
    },
  );
  const payload = await response.json();

  if (!response.ok || payload?.success === false) {
    const apiError = Array.isArray(payload?.errors) && payload.errors[0]?.message ? payload.errors[0].message : null;
    throw new Error(apiError || `Cloudflare project configuration failed with status ${response.status}.`);
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
    [
      'exec',
      'wrangler',
      'pages',
      'project',
      'create',
      instance.projectName,
      '--production-branch',
      config.sourceBranch,
    ],
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

export function buildManagedInstanceDeployArgs(instance, config, gitSha, reason = 'manual-refresh') {
  return [
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
    '--commit-dirty=true',
  ];
}

async function deployManagedInstanceProject(instance, reason = 'manual-refresh') {
  const config = getManagedInstanceCloudflareConfig();
  const gitSha = await resolveCurrentGitSha();

  await assertManagedInstanceDeployArtifactReady();
  await ensureManagedInstanceProjectExists(instance);
  await upsertManagedInstanceProjectSecret(
    instance,
    'BOLT_HOSTED_FREE_RELAY_SECRET',
    MANAGED_INSTANCE_HOSTED_FREE_RELAY_SECRET,
  );
  await configureManagedInstanceProject(instance);

  const result = await runManagedInstanceProcess(
    'pnpm',
    buildManagedInstanceDeployArgs(instance, config, gitSha, reason),
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

  const refreshedProject = await fetchCloudflarePagesProject(instance.projectName);
  const pagesAddress = resolveManagedInstancePagesAddress(
    refreshedProject,
    instance.projectName,
    MANAGED_INSTANCE_ROOT_DOMAIN,
  );
  const deploymentUrlMatch = `${result.stdout}\n${result.stderr}`.match(/https:\/\/[a-z0-9.-]+\.pages\.dev/gi);

  return {
    gitSha,
    routeHostname: pagesAddress.routeHostname,
    pagesUrl: pagesAddress.pagesUrl,
    deploymentUrl: deploymentUrlMatch?.at(-1) || pagesAddress.pagesUrl,
  };
}

async function verifyManagedInstanceDeploymentHealth(deployment, { timeoutMs = 90000, pollMs = 3000 } = {}) {
  const startedAt = Date.now();
  const candidates = [
    deployment?.deploymentUrl ? `${String(deployment.deploymentUrl).replace(/\/$/, '')}/api/health` : null,
    deployment?.pagesUrl ? `${String(deployment.pagesUrl).replace(/\/$/, '')}/api/health` : null,
    deployment?.pagesUrl ? `${String(deployment.pagesUrl).replace(/\/$/, '')}/chat` : null,
  ].filter(Boolean);
  let lastError = 'No managed instance URL was available for health verification.';

  while (Date.now() - startedAt <= timeoutMs) {
    for (const url of candidates) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      try {
        const response = await fetch(url, {
          method: 'GET',
          redirect: 'follow',
          signal: controller.signal,
          headers: {
            Accept: 'text/html,application/json',
          },
        });

        if (response.ok) {
          return {
            ok: true,
            url,
            status: response.status,
            checkedAt: new Date().toISOString(),
          };
        }

        lastError = `${url} returned HTTP ${response.status}`;
      } catch (error) {
        lastError = `${url} failed health verification: ${error instanceof Error ? error.message : 'request failed'}`;
      } finally {
        clearTimeout(timeout);
      }
    }

    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }

  return {
    ok: false,
    url: candidates[0] || null,
    status: null,
    checkedAt: new Date().toISOString(),
    error: lastError,
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
  managedInstanceLocks.set(
    lockKey,
    previous.finally(() => next),
  );

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

export function runSerializedManagedInstanceRollout(operation, { reason = 'auto-rollout' } = {}) {
  if (managedInstanceRolloutPromise) {
    console.warn(`[runtime] managed rollout already in progress; skipping overlapping ${reason}.`);
    return managedInstanceRolloutPromise;
  }

  managedInstanceRolloutPromise = Promise.resolve()
    .then(operation)
    .finally(() => {
      managedInstanceRolloutPromise = null;
    });

  return managedInstanceRolloutPromise;
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
  instance.lastError = 'The managed instance reached its scheduled expiry.';
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
    await syncManagedRegistryToAdminDatabase(registry);
  }

  return changed;
}

async function refreshManagedInstanceFromCurrentBuild(
  registry,
  instance,
  { actor = 'system', reason = 'refresh' } = {},
) {
  return await runManagedInstanceOperation(getManagedInstanceLockKey(instance), async () => {
    const previousGoodSha = instance.lastGoodGitSha || instance.currentGitSha || null;
    const previousGoodDeploymentUrl = instance.lastGoodDeploymentUrl || instance.lastDeploymentUrl || null;
    const rolloutEntry = appendManagedInstanceRolloutHistory(instance, {
      actor,
      reason,
      status: 'started',
      targetGitSha: null,
      previousGitSha: instance.currentGitSha || null,
      deploymentUrl: null,
      healthcheckUrl: null,
      rollbackOutcome: null,
      error: null,
      startedAt: new Date().toISOString(),
      finishedAt: null,
    });

    instance.status = instance.currentGitSha ? 'updating' : 'provisioning';
    instance.updatedAt = new Date().toISOString();
    instance.lastError = null;
    await writeManagedInstanceRegistry(registry);

    try {
      const deployment = await deployManagedInstanceProject(instance, reason);
      const health = await verifyManagedInstanceDeploymentHealth(deployment);

      rolloutEntry.targetGitSha = deployment.gitSha;
      rolloutEntry.deploymentUrl = deployment.deploymentUrl;
      rolloutEntry.healthcheckUrl = health.url;
      rolloutEntry.finishedAt = new Date().toISOString();
      instance.lastHealthcheckAt = health.checkedAt;

      if (!health.ok) {
        instance.lastHealthcheckStatus = 'unhealthy';
        instance.lastRollbackAt = rolloutEntry.finishedAt;
        instance.lastRollbackOutcome = previousGoodSha
          ? `Rollback ready: last good ${previousGoodSha} at ${previousGoodDeploymentUrl || 'previous deployment URL unknown'}.`
          : 'Rollback skipped: no previous healthy deployment has been recorded yet.';
        rolloutEntry.status = previousGoodSha ? 'rollback-ready' : 'rollback-skipped';
        rolloutEntry.rollbackOutcome = instance.lastRollbackOutcome;
        rolloutEntry.error = health.error || 'Managed instance health verification failed.';
        throw new Error(rolloutEntry.error);
      }

      instance.previousGitSha = instance.currentGitSha || null;
      instance.currentGitSha = deployment.gitSha;
      instance.lastGoodGitSha = deployment.gitSha;
      instance.lastRolloutAt = new Date().toISOString();
      instance.updatedAt = new Date().toISOString();
      instance.routeHostname = deployment.routeHostname;
      instance.pagesUrl = deployment.pagesUrl;
      instance.lastDeploymentUrl = deployment.deploymentUrl;
      instance.lastGoodDeploymentUrl = deployment.deploymentUrl;
      instance.lastHealthcheckStatus = 'healthy';
      instance.lastRollbackOutcome = null;
      instance.lastError = null;
      instance.status = 'active';
      rolloutEntry.status = 'healthy';
      rolloutEntry.finishedAt = instance.updatedAt;
      appendManagedInstanceEvent(registry, {
        actor,
        action: instance.previousGitSha ? 'managed-instance.rollout' : 'managed-instance.provisioned',
        target: instance.routeHostname,
        details: {
          gitSha: deployment.gitSha,
          healthcheckUrl: health.url || '',
        },
      });
      await writeManagedInstanceRegistry(registry);
      await syncManagedInstanceToAdminDatabase(instance);
      return instance;
    } catch (error) {
      instance.status = 'failed';
      instance.updatedAt = new Date().toISOString();
      instance.lastError = error instanceof Error ? error.message : 'Cloudflare deployment failed.';
      instance.lastGoodGitSha = previousGoodSha;
      instance.lastGoodDeploymentUrl = previousGoodDeploymentUrl;
      instance.lastRollbackAt = instance.lastRollbackAt || new Date().toISOString();
      instance.lastRollbackOutcome =
        instance.lastRollbackOutcome ||
        (previousGoodSha
          ? `Rollback ready: last good ${previousGoodSha} at ${previousGoodDeploymentUrl || 'previous deployment URL unknown'}.`
          : 'Rollback skipped: no previous healthy deployment has been recorded yet.');
      rolloutEntry.status = previousGoodSha ? 'rollback-ready' : 'rollback-skipped';
      rolloutEntry.finishedAt = instance.updatedAt;
      rolloutEntry.rollbackOutcome = instance.lastRollbackOutcome;
      rolloutEntry.error = instance.lastError;
      appendManagedInstanceEvent(registry, {
        actor,
        action: 'managed-instance.failed',
        target: instance.routeHostname,
        details: {
          error: instance.lastError,
          rollbackOutcome: instance.lastRollbackOutcome,
        },
      });
      await writeManagedInstanceRegistry(registry);
      await syncManagedInstanceToAdminDatabase(instance);
      throw error;
    }
  });
}

async function suspendManagedInstanceRecord(
  registry,
  instance,
  { actor = 'system', reason = 'Managed trial instance suspended by the operator.' } = {},
) {
  instance.status = 'suspended';
  instance.updatedAt = new Date().toISOString();
  instance.suspendedAt = new Date().toISOString();
  instance.lastError = reason;
  appendManagedInstanceEvent(registry, {
    actor,
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
  await syncManagedInstanceToAdminDatabase(instance);
  return instance;
}

export function shouldRefreshManagedInstanceForRollout(instance, gitSha) {
  const status = String(instance?.status || '').toLowerCase();

  if (status === 'expired' || status === 'suspended') {
    return false;
  }

  if (instance?.currentGitSha === gitSha && status === 'active') {
    return false;
  }

  return true;
}

async function rolloutManagedInstancesToCurrentBuild({ reason = 'auto-rollout', actor = 'system' } = {}) {
  const support = await buildManagedInstanceSupportState();

  if (!support.supported) {
    return;
  }

  const registry = await ensureManagedInstanceRegistry();
  await maybeExpireManagedInstances(registry, { actor });
  const gitSha = await resolveCurrentGitSha();

  for (const instance of registry.instances) {
    if (!shouldRefreshManagedInstanceForRollout(instance, gitSha)) {
      continue;
    }

    try {
      await refreshManagedInstanceFromCurrentBuild(registry, instance, { actor, reason });
    } catch (error) {
      const target = instance.routeHostname || instance.projectName || instance.id || 'unknown-instance';
      console.error(
        `[runtime] managed instance rollout failed for ${target}; continuing with remaining instances.`,
        error,
      );
    }
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

async function ensureShoutboxStore() {
  try {
    const raw = await fs.readFile(SHOUTBOX_MESSAGES_PATH, 'utf8');
    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed?.messages)) {
      throw new Error('Invalid shoutbox store.');
    }

    return {
      messages: parsed.messages
        .filter((message) => message && typeof message === 'object')
        .slice(-MAX_SHOUTBOX_MESSAGES),
      reports: Array.isArray(parsed.reports) ? parsed.reports.filter(Boolean).slice(-200) : [],
    };
  } catch {
    const initialStore = { messages: [], reports: [] };
    await writeJsonAtomically(SHOUTBOX_MESSAGES_PATH, JSON.stringify(initialStore, null, 2));
    return initialStore;
  }
}

async function writeShoutboxStore(store) {
  const normalizedMessages = Array.isArray(store?.messages) ? store.messages.slice(-MAX_SHOUTBOX_MESSAGES) : [];
  const normalizedReports = Array.isArray(store?.reports) ? store.reports.slice(-200) : [];
  await writeJsonAtomically(
    SHOUTBOX_MESSAGES_PATH,
    JSON.stringify({ messages: normalizedMessages, reports: normalizedReports }, null, 2),
  );
}

function sanitizeShoutMessage(message) {
  return {
    id: String(message.id || ''),
    author: String(message.author || 'Anonymous'),
    content: String(message.content || ''),
    createdAt: String(message.createdAt || new Date().toISOString()),
  };
}

async function listShoutboxMessages() {
  const store = await ensureShoutboxStore();
  return store.messages.map(sanitizeShoutMessage);
}

async function appendShoutboxMessage({ author, content }) {
  const normalizedAuthor =
    String(author || '')
      .trim()
      .slice(0, 80) || 'Anonymous';
  const normalizedContent = String(content || '')
    .replace(/\r\n/g, '\n')
    .trim()
    .slice(0, 600);

  if (!normalizedContent) {
    throw new Error('A shout-out message is required.');
  }

  const store = await ensureShoutboxStore();
  const message = sanitizeShoutMessage({
    id: crypto.randomUUID(),
    author: normalizedAuthor,
    content: normalizedContent,
    createdAt: new Date().toISOString(),
  });
  store.messages.push(message);
  await writeShoutboxStore(store);
  return message;
}

async function reportShoutboxMessage({ messageId, reporter = 'anonymous', reason = '' }) {
  const store = await ensureShoutboxStore();
  const normalizedMessageId = String(messageId || '').trim();
  const message = store.messages.find((candidate) => String(candidate.id) === normalizedMessageId);

  if (!message) {
    throw new Error('Shout-out message not found.');
  }

  const report = {
    id: crypto.randomUUID(),
    messageId: normalizedMessageId,
    reporter:
      String(reporter || 'anonymous')
        .trim()
        .slice(0, 120) || 'anonymous',
    reason:
      String(reason || '')
        .trim()
        .slice(0, 300) || 'user-report',
    createdAt: new Date().toISOString(),
  };

  store.reports = Array.isArray(store.reports) ? store.reports : [];
  store.reports.push(report);
  await writeShoutboxStore(store);

  return report;
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

function shouldInspectPreviewResponseForAlerts(upstreamPath, contentType = '') {
  const normalizedPath = String(upstreamPath || '').split('?')[0] || '/';
  const normalizedType = String(contentType || '').toLowerCase();
  const isDocumentPath =
    normalizedPath === '/' ||
    normalizedPath === '/index.html' ||
    normalizedPath.endsWith('.html') ||
    normalizedPath.endsWith('.htm');
  const isHtmlResponse = normalizedType.includes('text/html');

  return isDocumentPath || isHtmlResponse;
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

const DEV_SERVER_READY_RE =
  /\b(?:VITE v[\d.]+\s+ready in|ready - started server on|Local:\s+http:\/\/(?:127\.0\.0\.1|localhost|0\.0\.0\.0|\[::1\]):\d+)/i;

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

function isDetachedDevServerLifecycleNoise(combinedText) {
  const hasLifecycleFailure = /\bELIFECYCLE\b/i.test(combinedText) || /\bCommand failed\b/i.test(combinedText);

  if (!hasLifecycleFailure || !DEV_SERVER_READY_RE.test(combinedText)) {
    return false;
  }

  const hardFailurePatterns = PREVIEW_ERROR_PATTERNS.filter(
    (pattern) => !/\bELIFECYCLE\b/i.test(pattern.source) && !/\bCommand failed\b/i.test(pattern.source),
  );

  return !hardFailurePatterns.some((pattern) => pattern.test(combinedText));
}

function isLifecycleOnlyPreviewAlert(alert) {
  if (!alert || typeof alert !== 'object') {
    return false;
  }

  const combinedText = normalizePreviewText(`${alert.title || ''}\n${alert.description || ''}\n${alert.content || ''}`);
  const hasLifecycleFailure = /\bELIFECYCLE\b/i.test(combinedText) || /\bCommand failed\b/i.test(combinedText);

  if (!hasLifecycleFailure) {
    return false;
  }

  const hardFailurePatterns = PREVIEW_ERROR_PATTERNS.filter(
    (pattern) => !/\bELIFECYCLE\b/i.test(pattern.source) && !/\bCommand failed\b/i.test(pattern.source),
  );

  return !hardFailurePatterns.some((pattern) => pattern.test(combinedText));
}

function isStarterPlaceholderPreviewAlert(alert) {
  if (!alert || typeof alert !== 'object') {
    return false;
  }

  const combinedText = normalizePreviewText(`${alert.title || ''}\n${alert.description || ''}\n${alert.content || ''}`);

  return /Starter Placeholder Still Visible/i.test(combinedText) || combinedText.includes(STARTER_PLACEHOLDER_TEXT);
}

function canClearPreviewAlertAfterHealthyResponse(session, alert, normalizedBody) {
  if (!alert) {
    return true;
  }

  if (isLifecycleOnlyPreviewAlert(alert)) {
    return true;
  }

  if (!isStarterPlaceholderPreviewAlert(alert)) {
    return false;
  }

  if (normalizedBody.includes(STARTER_PLACEHOLDER_TEXT)) {
    return false;
  }

  return !fileMapContainsStarterPlaceholder(session.currentFileMap);
}

function extractPreviewAlertFromText(rawText) {
  const combinedText = normalizePreviewText(rawText);

  if (!combinedText) {
    return null;
  }

  if (isDetachedDevServerLifecycleNoise(combinedText)) {
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

function buildPreviewRepairingAlert(alert, message = '') {
  const detected = alert?.description ? `Detected: ${alert.description}` : 'Detected a preview startup problem.';

  return {
    type: 'info',
    title: 'Preview Repair In Progress',
    description:
      'A preview problem was detected. bolt.gives is fixing it automatically and will reload the preview when it is ready.',
    content: `${message || detected}\n\n${detected}`,
    source: 'preview',
  };
}

function setPreviewRepairingState(session, alert, message = '') {
  setPreviewRecoveryState(
    session,
    'running',
    message || 'A preview problem was detected. The hosted runtime is applying automatic repair.',
  );
  touchPreviewDiagnostics(session, {
    status: 'repairing',
    healthy: false,
    alert: buildPreviewRepairingAlert(alert, message),
  });
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
    runtimeNodeWorkspace: session.runtimeNodeWorkspace || null,
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

function getFileMapEntry(fileMap, filePath) {
  if (!fileMap || typeof fileMap !== 'object') {
    return null;
  }

  return fileMap[filePath] || null;
}

function hasTextFile(fileMap, filePath) {
  const entry = getFileMapEntry(fileMap, filePath);

  return Boolean(entry && entry.type === 'file' && !entry.isBinary && typeof entry.content === 'string');
}

function getTextFileContent(fileMap, filePath) {
  const entry = getFileMapEntry(fileMap, filePath);

  if (!entry || entry.type !== 'file' || entry.isBinary || typeof entry.content !== 'string') {
    return undefined;
  }

  return entry.content;
}

function fileMapPackageJsonLooksLikeVite(fileMap) {
  const packageJsonContent = getTextFileContent(fileMap, '/home/project/package.json');

  if (typeof packageJsonContent !== 'string') {
    return false;
  }

  try {
    const packageJson = JSON.parse(packageJsonContent);
    const scripts = packageJson?.scripts && typeof packageJson.scripts === 'object' ? packageJson.scripts : {};
    const dependencies =
      packageJson?.dependencies && typeof packageJson.dependencies === 'object' ? packageJson.dependencies : {};
    const devDependencies =
      packageJson?.devDependencies && typeof packageJson.devDependencies === 'object'
        ? packageJson.devDependencies
        : {};

    return (
      Object.values(scripts).some((script) => typeof script === 'string' && /\bvite\b/i.test(script)) ||
      typeof dependencies.vite === 'string' ||
      typeof devDependencies.vite === 'string' ||
      typeof devDependencies['@vitejs/plugin-react'] === 'string'
    );
  } catch {
    return false;
  }
}

function inferExpectedViteMainEntryPath(fileMap) {
  const indexHtmlContent = getTextFileContent(fileMap, '/home/project/index.html');

  if (typeof indexHtmlContent === 'string') {
    const referencedEntryMatch = indexHtmlContent.match(VITE_MAIN_ENTRY_SRC_RE);

    if (referencedEntryMatch?.[3]) {
      return path.posix.join(WORK_DIR, referencedEntryMatch[3].replace(/^\//, ''));
    }
  }

  if (hasTextFile(fileMap, '/home/project/src/main.tsx')) {
    return '/home/project/src/main.tsx';
  }

  if (hasTextFile(fileMap, '/home/project/src/main.jsx')) {
    return '/home/project/src/main.jsx';
  }

  if (hasTextFile(fileMap, '/home/project/src/App.tsx') || hasTextFile(fileMap, '/home/project/tsconfig.app.json')) {
    return '/home/project/src/main.tsx';
  }

  if (hasTextFile(fileMap, '/home/project/src/App.jsx')) {
    return '/home/project/src/main.jsx';
  }

  return null;
}

function inferExpectedViteMainEntryRequestPath(fileMap) {
  const entryPath = inferExpectedViteMainEntryPath(fileMap);

  if (!entryPath || !hasTextFile(fileMap, entryPath)) {
    return null;
  }

  const relativePath = entryPath.replace(WORK_DIR, '').replace(/^\/+/, '');

  return relativePath ? `/${relativePath}` : null;
}

export function buildHostedWorkspaceBootstrapAlert(fileMap) {
  if (!fileMap || typeof fileMap !== 'object') {
    return null;
  }

  const looksLikeViteWorkspace =
    hasTextFile(fileMap, '/home/project/vite.config.ts') ||
    hasTextFile(fileMap, '/home/project/vite.config.js') ||
    hasTextFile(fileMap, '/home/project/src/App.tsx') ||
    hasTextFile(fileMap, '/home/project/src/App.jsx') ||
    hasTextFile(fileMap, '/home/project/src/main.tsx') ||
    hasTextFile(fileMap, '/home/project/src/main.jsx') ||
    fileMapPackageJsonLooksLikeVite(fileMap);

  if (!looksLikeViteWorkspace) {
    return null;
  }

  if (!hasTextFile(fileMap, '/home/project/index.html')) {
    return {
      type: 'error',
      title: 'Preview Error',
      description: 'Hosted workspace is missing index.html.',
      content: 'The hosted workspace does not contain index.html, so the Vite preview cannot boot.',
      source: 'preview',
    };
  }

  const expectedMainEntryPath = inferExpectedViteMainEntryPath(fileMap);

  if (!expectedMainEntryPath || !hasTextFile(fileMap, expectedMainEntryPath)) {
    const expectedLabel = expectedMainEntryPath ? expectedMainEntryPath.replace(`${WORK_DIR}/`, '') : 'src/main.tsx';

    return {
      type: 'error',
      title: 'Preview Error',
      description: `Hosted workspace is missing ${expectedLabel}.`,
      content: `The hosted runtime cannot boot the Vite preview because ${expectedLabel} is missing from the synced workspace.`,
      source: 'preview',
    };
  }

  return null;
}

export async function refreshSessionCurrentFileMapFromDisk(session) {
  const diskFiles = await buildWorkspaceFileMapFromDisk(session);
  session.currentFileMap = cloneFileMap(diskFiles);

  return session.currentFileMap;
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

export function markSessionMutationStart(session) {
  cancelPendingPreviewAutoRestore(session);
  cancelPendingPreviewVerification(session);
  cancelPendingPreviewAutostart(session);
  session.workspaceMutationId = Number(session.workspaceMutationId || 0) + 1;
  session.lastAutoRestoreFingerprint = null;

  const currentFileMap = session.currentFileMap;
  const hasCurrentWorkspaceFiles = currentFileMap && Object.keys(currentFileMap).length > 0;
  const currentWorkspaceIsStarter = hasCurrentWorkspaceFiles && fileMapContainsStarterPlaceholder(currentFileMap);

  if (session.previewDiagnostics.healthy && hasCurrentWorkspaceFiles && !currentWorkspaceIsStarter) {
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
  let rootViteEntryRequestPath = null;

  if (requestPath === '/') {
    try {
      const diskFiles = await buildWorkspaceFileMapFromDisk(session);
      const workspaceBootstrapAlert = buildHostedWorkspaceBootstrapAlert(diskFiles);
      rootViteEntryRequestPath = inferExpectedViteMainEntryRequestPath(diskFiles);

      if (workspaceBootstrapAlert) {
        return {
          healthy: false,
          statusCode: 0,
          alert: existingAlert || workspaceBootstrapAlert,
        };
      }
    } catch {
      // Fall back to network probing when the workspace snapshot cannot be read.
    }
  }

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
    const normalizedBody = normalizePreviewText(body);
    const bodyAlert = extractPreviewAlertFromText(body);
    const responseHasHealthyStatus = response.status >= 200 && response.status < 400;
    const existingAlertCanBeCleared =
      !bodyAlert &&
      responseHasHealthyStatus &&
      canClearPreviewAlertAfterHealthyResponse(session, existingAlert, normalizedBody);
    const alert =
      bodyAlert ||
      (existingAlertCanBeCleared ? null : existingAlert) ||
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

    const result = {
      healthy: !alert && responseHasHealthyStatus,
      statusCode: response.status,
      alert,
    };

    if (requestPath === '/' && result.healthy && rootViteEntryRequestPath) {
      const moduleProbe = await probeSessionPreviewHealth(
        {
          ...session,
          previewDiagnostics: {
            ...(session.previewDiagnostics || createPreviewDiagnostics()),
            alert: null,
          },
        },
        rootViteEntryRequestPath,
      );

      if (!moduleProbe.healthy) {
        return moduleProbe;
      }
    }

    return result;
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
    status: 'repairing',
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
        const recoveryProbe = await probeSessionPreviewHealth({
          ...session,
          previewDiagnostics: {
            ...(session.previewDiagnostics || createPreviewDiagnostics()),
            alert: null,
          },
        });

        if (!recoveryProbe.healthy) {
          throw new Error(recoveryProbe.alert?.description || 'Restored preview did not become healthy.');
        }

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
  if (!session.restorePointFileMap) {
    touchPreviewDiagnostics(session, {
      status: 'error',
      healthy: false,
      alert,
    });
    return;
  }

  if (session.autoRestoreInFlight) {
    return;
  }

  const fingerprint = buildPreviewAlertFingerprint(alert);

  if (!fingerprint || session.lastAutoRestoreFingerprint === fingerprint) {
    return;
  }

  cancelPendingPreviewAutoRestore(session);
  setPreviewRepairingState(
    session,
    alert,
    'Preview repair is queued. The current preview will stay open while recovery runs.',
  );
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

      setPreviewRepairingState(
        session,
        probe.alert,
        'Preview repair is running. Restoring the last known working workspace.',
      );
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

  if (detectedAlert) {
    schedulePreviewAutoRestore(session, detectedAlert);
    return;
  }

  touchPreviewDiagnostics(session, {
    status: session.previewDiagnostics.status,
    healthy: session.previewDiagnostics.healthy,
    alert: session.previewDiagnostics.alert,
  });
}

export function recordPreviewResponse(session, body, statusCode, upstreamPath, contentType = '') {
  const normalizedBody = normalizePreviewText(body);
  const shouldInspectForAlerts = shouldInspectPreviewResponseForAlerts(upstreamPath, contentType);
  const detectedAlert =
    (shouldInspectForAlerts ? extractPreviewAlertFromText(normalizedBody) : null) ||
    (statusCode >= 500
      ? {
          type: 'error',
          title: 'Preview Error',
          description: `Preview request failed with status ${statusCode}`,
          content: normalizedBody || `Preview request to ${upstreamPath} failed with status ${statusCode}.`,
          source: 'preview',
        }
      : null);

  if (detectedAlert) {
    schedulePreviewAutoRestore(session, detectedAlert);

    return;
  }

  if (
    statusCode >= 200 &&
    statusCode < 400 &&
    shouldInspectForAlerts &&
    !(
      session.previewDiagnostics?.status === 'error' &&
      session.previewDiagnostics?.alert &&
      !canClearPreviewAlertAfterHealthyResponse(session, session.previewDiagnostics.alert, normalizedBody)
    )
  ) {
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
      runtimeNodeWorkspace: null,
      runtimeNodeWorkspaceSecretHandoff: null,
      runtimeNodeProvisionPromise: null,
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

function buildHostedWorkspaceBootstrapPackageJson() {
  return `${JSON.stringify(
    {
      name: 'bolt-runtime-app',
      private: true,
      version: '0.0.0',
      type: 'module',
      scripts: {
        dev: 'vite --host 0.0.0.0 --port 5173',
        build: 'vite build',
        preview: 'vite preview --host 0.0.0.0 --port 4173',
      },
      dependencies: {
        react: HOSTED_VITE_BOOTSTRAP_PACKAGE_VERSIONS.react,
        'react-dom': HOSTED_VITE_BOOTSTRAP_PACKAGE_VERSIONS.reactDom,
      },
      devDependencies: {
        vite: HOSTED_VITE_BOOTSTRAP_PACKAGE_VERSIONS.vite,
        '@vitejs/plugin-react': HOSTED_VITE_BOOTSTRAP_PACKAGE_VERSIONS.pluginReact,
      },
    },
    null,
    2,
  )}\n`;
}

function buildHostedWorkspaceBootstrapIndexHtml(mainEntryPath) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>bolt.gives app</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/${String(mainEntryPath || 'src/main.jsx').replace(/^\//, '')}"></script>
  </body>
</html>
`;
}

function buildHostedWorkspaceBootstrapMainEntry(appImportPath) {
  return `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '${appImportPath}';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
`;
}

function buildHostedWorkspaceBootstrapViteConfig() {
  return `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    hmr: false,
  },
});
`;
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

function stripTerminalSequences(text) {
  return String(text || '')
    .replace(/\u001b\[[0-9;]*m/g, '')
    .replace(/\u0000/g, '');
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function shellEscapeSingleArgument(value) {
  return `'${String(value || '').replace(/'/g, `'\\''`)}'`;
}

export function extractUnavailablePackageVersionRepair(stderr = '') {
  const normalized = stripTerminalSequences(stderr);
  const unavailableMatch = normalized.match(
    /No matching version found for\s+(@?[^@\s]+(?:\/[^@\s]+)?)@([^\s'")]+)\.?/i,
  );

  if (!unavailableMatch) {
    return null;
  }

  const packageName = unavailableMatch[1];
  const requestedVersion = unavailableMatch[2];
  const scopedLatestMatch = normalized.match(
    new RegExp(`latest release of\\s+${escapeRegExp(packageName)}\\s+is\\s+["']([^"']+)["']`, 'i'),
  );
  const genericLatestMatch = normalized.match(
    /latest release of\s+(@?[^"'\s]+(?:\/[^"'\s]+)?)\s+is\s+["']([^"']+)["']/i,
  );
  const latestVersion =
    scopedLatestMatch?.[1] ||
    (genericLatestMatch && genericLatestMatch[1] === packageName ? genericLatestMatch[2] : null) ||
    null;

  return {
    packageName,
    requestedVersion,
    latestVersion,
  };
}

async function resolveLatestPackageVersion(packageName, options = {}) {
  const { cwd = REPO_ROOT, writeEvent = null } = options;

  return await new Promise((resolve) => {
    const child = spawn('bash', ['-lc', `pnpm view ${shellEscapeSingleArgument(packageName)} version --json`], {
      cwd,
      env: {
        ...process.env,
        CI: '0',
        FORCE_COLOR: '0',
        NODE_OPTIONS,
      },
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('close', () => {
      const normalized = stripTerminalSequences(stdout).trim();

      if (!normalized) {
        if (stderr.trim()) {
          writeEvent?.({
            type: 'stderr',
            chunk: stderr.toString(),
          });
        }

        resolve(null);
        return;
      }

      try {
        const parsed = JSON.parse(normalized);
        resolve(typeof parsed === 'string' && parsed.trim() ? parsed.trim() : null);
      } catch {
        resolve(normalized.replace(/^"+|"+$/g, '') || null);
      }
    });
    child.on('error', () => resolve(null));
  });
}

function preserveDependencyRangePrefix(requestedVersion, latestVersion) {
  const prefixMatch = String(requestedVersion || '').match(/^([~^])/);
  const prefix = prefixMatch?.[1] || '';

  return `${prefix}${latestVersion}`;
}

export function applyUnavailablePackageVersionRepair(packageJson, repair) {
  if (!packageJson || !repair?.packageName || !repair?.requestedVersion || !repair?.latestVersion) {
    return {
      changed: false,
      nextVersion: null,
    };
  }

  const nextVersion = preserveDependencyRangePrefix(repair.requestedVersion, repair.latestVersion);
  const dependencySections = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
  let changed = false;

  for (const section of dependencySections) {
    const record = packageJson?.[section];

    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      continue;
    }

    if (typeof record[repair.packageName] !== 'string') {
      continue;
    }

    if (record[repair.packageName] === nextVersion) {
      continue;
    }

    record[repair.packageName] = nextVersion;
    changed = true;
  }

  return {
    changed,
    nextVersion: changed ? nextVersion : null,
  };
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

function commandLikelyUsesWorkspaceDependencies(command = '') {
  const normalized = String(command || '')
    .trim()
    .toLowerCase();

  if (!normalized) {
    return false;
  }

  return (
    commandNeedsProjectManifest(normalized) ||
    /\b(vite|next|astro|remix|react-scripts|webpack|parcel|nuxt|svelte-kit)\b/i.test(normalized)
  );
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
  const withoutDirectives = raw
    .replace(LEGACY_TAILWIND_DIRECTIVE_RE, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

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

export function repairUnsafeJsxTextEntities(content) {
  const raw = String(content || '');
  const repaired = raw.replace(
    /(<([A-Za-z][\w:.-]*)(?:\s[^<>]*?)?>)\s*([<>])\s*(<\/\2>)/g,
    (_match, openTag, _tagName, text, closeTag) => `${openTag}${text === '<' ? '&lt;' : '&gt;'}${closeTag}`,
  );

  return {
    changed: repaired !== raw,
    content: repaired,
  };
}

async function repairHostedWorkspaceUnsafeJsxTextEntities(session) {
  const entries = await walkWorkspaceFiles(session.dir);
  const repairedFiles = [];

  for (const entry of entries.filter((candidate) => JSX_SOURCE_EXTENSIONS.has(candidate.extension))) {
    const repaired = repairUnsafeJsxTextEntities(entry.content);

    if (!repaired.changed) {
      continue;
    }

    await writeWorkspaceFileAtomic(entry.absolutePath, repaired.content);
    repairedFiles.push(entry.path);
    entry.content = repaired.content;
  }

  return repairedFiles;
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

async function ensureHostedWorkspaceViteSupportFiles(session) {
  const packageJsonRecord = await readWorkspacePackageJson(session);

  if (!packageJsonRecord?.json) {
    return [];
  }

  const scripts = packageJsonRecord.json.scripts || {};
  const usesVite = Boolean(
    packageJsonRecord.json.dependencies?.vite ||
    packageJsonRecord.json.devDependencies?.vite ||
    Object.values(scripts).some((value) => typeof value === 'string' && /\bvite\b/i.test(value)),
  );

  if (!usesVite) {
    return [];
  }

  const tsconfigPath = path.join(session.dir, 'tsconfig.json');

  if (!(await exists(tsconfigPath))) {
    return [];
  }

  let tsconfig;

  try {
    tsconfig = JSON.parse(await fs.readFile(tsconfigPath, 'utf8'));
  } catch {
    return [];
  }

  const referencedPaths = Array.isArray(tsconfig?.references)
    ? new Set(
        tsconfig.references
          .map((reference) => String(reference?.path || '').trim())
          .filter(Boolean)
          .map((referencePath) => referencePath.replace(/^[.][/\\]/, '')),
      )
    : new Set();

  if (referencedPaths.size === 0) {
    return [];
  }

  const generatedFiles = [];
  const needsTsconfigApp = referencedPaths.has('tsconfig.app.json');
  const needsTsconfigNode = referencedPaths.has('tsconfig.node.json');
  const usesReact = Boolean(
    packageJsonRecord.json.dependencies?.react ||
    packageJsonRecord.json.devDependencies?.react ||
    packageJsonRecord.json.dependencies?.['react-dom'] ||
    packageJsonRecord.json.devDependencies?.['react-dom'],
  );
  const sourceEntries = await walkWorkspaceFiles(session.dir);
  const usesJsSources = sourceEntries.some((entry) => entry.path.startsWith('src/') && /\.jsx?$/.test(entry.path));
  const tsconfigAppPath = path.join(session.dir, 'tsconfig.app.json');
  const tsconfigNodePath = path.join(session.dir, 'tsconfig.node.json');

  if (needsTsconfigApp && !(await exists(tsconfigAppPath))) {
    const tsconfigAppJson = {
      compilerOptions: {
        target: 'ES2020',
        useDefineForClassFields: true,
        lib: ['ES2020', 'DOM', 'DOM.Iterable'],
        module: 'ESNext',
        skipLibCheck: true,
        moduleResolution: 'Bundler',
        allowImportingTsExtensions: true,
        resolveJsonModule: true,
        isolatedModules: true,
        moduleDetection: 'force',
        noEmit: true,
        jsx: usesReact ? 'react-jsx' : 'preserve',
        ...(usesJsSources ? { allowJs: true, checkJs: false } : {}),
      },
      include: ['src'],
    };

    await writeWorkspaceFileAtomic(tsconfigAppPath, `${JSON.stringify(tsconfigAppJson, null, 2)}\n`);
    generatedFiles.push('tsconfig.app.json');
  }

  if (needsTsconfigNode && !(await exists(tsconfigNodePath))) {
    const tsconfigNodeJson = {
      compilerOptions: {
        composite: true,
        skipLibCheck: true,
        module: 'ESNext',
        moduleResolution: 'Bundler',
        allowSyntheticDefaultImports: true,
      },
      include: ['vite.config.*'],
    };

    await writeWorkspaceFileAtomic(tsconfigNodePath, `${JSON.stringify(tsconfigNodeJson, null, 2)}\n`);
    generatedFiles.push('tsconfig.node.json');
  }

  return generatedFiles;
}

function workspacePackageUsesVite(packageJsonRecord) {
  const packageJson = packageJsonRecord?.json || {};
  const scripts = packageJson.scripts || {};

  return Boolean(
    packageJson.dependencies?.vite ||
      packageJson.devDependencies?.vite ||
      Object.values(scripts).some((value) => typeof value === 'string' && /\bvite\b/i.test(value)),
  );
}

function findMatchingBrace(source, openBraceIndex) {
  if (openBraceIndex < 0 || source[openBraceIndex] !== '{') {
    return -1;
  }

  let depth = 0;
  let quote = null;
  let escaped = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let index = openBraceIndex; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (inLineComment) {
      if (char === '\n') {
        inLineComment = false;
      }

      continue;
    }

    if (inBlockComment) {
      if (char === '*' && next === '/') {
        inBlockComment = false;
        index += 1;
      }

      continue;
    }

    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === '\\') {
        escaped = true;
        continue;
      }

      if (char === quote) {
        quote = null;
      }

      continue;
    }

    if (char === '/' && next === '/') {
      inLineComment = true;
      index += 1;
      continue;
    }

    if (char === '/' && next === '*') {
      inBlockComment = true;
      index += 1;
      continue;
    }

    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }

    if (char === '{') {
      depth += 1;
      continue;
    }

    if (char === '}') {
      depth -= 1;

      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

function insertObjectProperty(source, openBraceIndex, propertySource, indent = '  ') {
  const insertAt = openBraceIndex + 1;
  const nextNonWhitespaceIndex = source.slice(insertAt).search(/\S/);
  const isEmptyObject = nextNonWhitespaceIndex >= 0 && source[insertAt + nextNonWhitespaceIndex] === '}';

  if (isEmptyObject) {
    return `${source.slice(0, insertAt)}\n${indent}${propertySource}\n${source.slice(insertAt)}`;
  }

  return `${source.slice(0, insertAt)}\n${indent}${propertySource}\n${source.slice(insertAt)}`;
}

export function applyHostedVitePreviewDefaults(content) {
  const source = String(content || '');

  if (!source.trim()) {
    return { changed: false, content: source };
  }

  const serverMatch = source.match(/\bserver\s*:\s*\{/);

  if (serverMatch?.index !== undefined) {
    const serverOpenBraceIndex = source.indexOf('{', serverMatch.index);
    const serverCloseBraceIndex = findMatchingBrace(source, serverOpenBraceIndex);
    const serverBody =
      serverCloseBraceIndex > serverOpenBraceIndex
        ? source.slice(serverOpenBraceIndex + 1, serverCloseBraceIndex)
        : '';

    if (/\bhmr\s*:\s*false\b/.test(serverBody)) {
      return { changed: false, content: source };
    }

    if (serverCloseBraceIndex > serverOpenBraceIndex) {
      if (/\bhmr\s*:/.test(serverBody)) {
        const repairedServerBody = serverBody.replace(/\bhmr\s*:\s*(?:\{[\s\S]*?\}|[^,\n}]+)/, 'hmr: false');

        return {
          changed: true,
          content: `${source.slice(0, serverOpenBraceIndex + 1)}${repairedServerBody}${source.slice(
            serverCloseBraceIndex,
          )}`,
        };
      }

      return {
        changed: true,
        content: insertObjectProperty(source, serverOpenBraceIndex, 'hmr: false,', '    '),
      };
    }
  }

  const defineConfigMatch = source.match(/\bdefineConfig\s*\(\s*\{/);

  if (defineConfigMatch?.index !== undefined) {
    const openBraceIndex = source.indexOf('{', defineConfigMatch.index);

    return {
      changed: true,
      content: insertObjectProperty(source, openBraceIndex, 'server: { hmr: false },'),
    };
  }

  const defaultObjectMatch = source.match(/\bexport\s+default\s*\{/);

  if (defaultObjectMatch?.index !== undefined) {
    const openBraceIndex = source.indexOf('{', defaultObjectMatch.index);

    return {
      changed: true,
      content: insertObjectProperty(source, openBraceIndex, 'server: { hmr: false },'),
    };
  }

  return { changed: false, content: source };
}

async function ensureHostedWorkspaceVitePreviewDefaults(session) {
  const packageJsonRecord = await readWorkspacePackageJson(session);

  if (!workspacePackageUsesVite(packageJsonRecord)) {
    return [];
  }

  const repairedFiles = [];
  const viteConfigPaths = [
    'vite.config.js',
    'vite.config.mjs',
    'vite.config.cjs',
    'vite.config.ts',
    'vite.config.mts',
    'vite.config.cts',
  ];

  for (const relativePath of viteConfigPaths) {
    const absolutePath = path.join(session.dir, relativePath);

    if (!(await exists(absolutePath))) {
      continue;
    }

    const current = await fs.readFile(absolutePath, 'utf8');
    const next = applyHostedVitePreviewDefaults(current);

    if (!next.changed) {
      continue;
    }

    await writeWorkspaceFileAtomic(absolutePath, next.content);
    repairedFiles.push(relativePath);
  }

  return repairedFiles;
}

export async function ensureHostedWorkspaceProjectBootstrap(session) {
  if (await workspaceHasOwnProjectManifest(session.dir)) {
    return {
      generatedFiles: [],
      inferredStartCommand: null,
    };
  }

  const entries = await walkWorkspaceFiles(session.dir);
  const sourcePaths = new Set(entries.map((entry) => entry.path));
  const packageImports = new Set(extractWorkspacePackageImports(entries));
  const hasReactImports = packageImports.has('react') || packageImports.has('react-dom');
  const hasReactSource = entries.some((entry) => /\.(jsx|tsx)$/i.test(entry.path));

  if (!hasReactImports && !hasReactSource) {
    return {
      generatedFiles: [],
      inferredStartCommand: null,
    };
  }

  const appEntry =
    entries.find((entry) => /^src\/App\.tsx$/i.test(entry.path)) ||
    entries.find((entry) => /^src\/App\.jsx$/i.test(entry.path));
  const mainEntry = entries.find((entry) => /^src\/main\.(?:tsx|jsx|ts|js)$/i.test(entry.path)) || null;
  const indexHtmlPath = path.join(session.dir, 'index.html');
  const viteConfigTsPath = path.join(session.dir, 'vite.config.ts');
  const viteConfigJsPath = path.join(session.dir, 'vite.config.js');
  const hasIndexHtml = await exists(indexHtmlPath);
  const indexHtmlContent = hasIndexHtml ? await fs.readFile(indexHtmlPath, 'utf8') : '';
  const referencedMainPath = indexHtmlContent.match(VITE_MAIN_ENTRY_SRC_RE)?.[3]?.replace(/^\//, '') || null;
  const desiredMainPath =
    referencedMainPath ||
    mainEntry?.path ||
    (appEntry ? `src/main${appEntry.path.endsWith('.tsx') ? '.tsx' : '.jsx'}` : null);

  if (!desiredMainPath) {
    return {
      generatedFiles: [],
      inferredStartCommand: null,
    };
  }

  const generatedFiles = [];

  if (!hasIndexHtml) {
    await writeWorkspaceFileAtomic(indexHtmlPath, buildHostedWorkspaceBootstrapIndexHtml(desiredMainPath));
    generatedFiles.push('index.html');
  }

  if (!sourcePaths.has(desiredMainPath) && appEntry) {
    const mainAbsolutePath = path.join(session.dir, desiredMainPath);
    await fs.mkdir(path.dirname(mainAbsolutePath), { recursive: true });
    await writeWorkspaceFileAtomic(
      mainAbsolutePath,
      buildHostedWorkspaceBootstrapMainEntry(`./${path.posix.basename(appEntry.path).replace(/\.(tsx|jsx)$/i, '')}`),
    );
    generatedFiles.push(desiredMainPath);
  }

  if (!(await exists(viteConfigTsPath)) && !(await exists(viteConfigJsPath))) {
    await writeWorkspaceFileAtomic(viteConfigJsPath, buildHostedWorkspaceBootstrapViteConfig());
    generatedFiles.push('vite.config.js');
  }

  const packageJsonPath = path.join(session.dir, 'package.json');

  if (!(await exists(packageJsonPath))) {
    await writeWorkspaceFileAtomic(packageJsonPath, buildHostedWorkspaceBootstrapPackageJson());
    generatedFiles.push('package.json');
  }

  return {
    generatedFiles,
    inferredStartCommand: generatedFiles.length > 0 ? 'pnpm run dev' : null,
  };
}

export async function repairHostedWorkspaceSupportFilesAfterSync(session) {
  const generatedFiles = await ensureHostedWorkspaceViteSupportFiles(session);
  const previewConfigFiles = await ensureHostedWorkspaceVitePreviewDefaults(session);
  const repairedFiles = await repairHostedWorkspaceUnsafeJsxTextEntities(session);

  if (generatedFiles.length === 0 && previewConfigFiles.length === 0 && repairedFiles.length === 0) {
    return {
      generatedFiles: [],
      previewConfigFiles: [],
      repairedFiles: [],
      fileMap: {},
    };
  }

  const fileMap = {};

  for (const relativePath of [...new Set([...generatedFiles, ...previewConfigFiles, ...repairedFiles])]) {
    const absolutePath = path.join(session.dir, relativePath);
    const workbenchPath = path.posix.join(WORK_DIR, relativePath);
    const content = await fs.readFile(absolutePath, 'utf8');

    fileMap[workbenchPath] = {
      type: 'file',
      content,
      isBinary: false,
    };
  }

  return {
    generatedFiles,
    previewConfigFiles,
    repairedFiles,
    fileMap,
  };
}

export async function prepareHostedWorkspaceForStart(session, options = {}) {
  const {
    writeEvent = null,
    startCommand = '',
    dependencyInstallCommand = 'pnpm install --reporter=append-only --no-frozen-lockfile',
  } = options;
  const bootstrapRepair = await ensureHostedWorkspaceProjectBootstrap(session);
  let packageJsonRecord = await readWorkspacePackageJson(session);

  if (!packageJsonRecord) {
    return {
      changed: bootstrapRepair.generatedFiles.length > 0,
      installedPackages: [],
      repairedFiles: [],
      previewConfigFiles: [],
      sanitizedFiles: [],
      generatedFiles: bootstrapRepair.generatedFiles,
    };
  }

  const installedPackages = [];
  const sanitizedFiles = [];
  const repairedFiles = await repairHostedWorkspaceUnsafeJsxTextEntities(session);
  const generatedFiles = [...bootstrapRepair.generatedFiles, ...(await ensureHostedWorkspaceViteSupportFiles(session))];
  const previewConfigFiles = await ensureHostedWorkspaceVitePreviewDefaults(session);
  let packageJson = packageJsonRecord.json;
  const lockfileRecord = await readWorkspaceLockfile(session);
  const dependencyFingerprint = createWorkspaceDependencyFingerprint(packageJsonRecord.raw, lockfileRecord?.raw || '');
  const hasNodeModules = await exists(path.join(session.dir, 'node_modules'));
  const shouldPrepareDependenciesForStart = Boolean(
    inferHostedWorkspaceStartCommand(packageJson) ||
    bootstrapRepair.inferredStartCommand ||
    commandLikelyUsesWorkspaceDependencies(startCommand),
  );
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

  const entries = await walkWorkspaceFiles(session.dir);

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

  const shouldInstallDependencies =
    shouldPrepareDependenciesForStart &&
    (!hasNodeModules || session.lastPreparedDependencyFingerprint !== dependencyFingerprint);

  if (shouldInstallDependencies) {
    writeEvent?.({
      type: 'status',
      message: hasNodeModules
        ? 'Dependencies changed. Reinstalling workspace packages before starting preview'
        : 'Installing workspace dependencies before starting preview',
    });

    let installAttempts = 0;

    while (true) {
      installAttempts += 1;

      try {
        await new Promise((resolve, reject) => {
          const child = spawn('bash', ['-lc', dependencyInstallCommand], {
            cwd: session.dir,
            env: {
              ...process.env,
              CI: '0',
              FORCE_COLOR: '0',
              NODE_OPTIONS,
            },
          });

          let stdout = '';
          let stderr = '';
          child.stdout.on('data', (chunk) => {
            const text = chunk.toString();
            stdout += text;
            writeEvent?.({ type: 'stdout', chunk: text });
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

            const combinedOutput = `${stdout}\n${stderr}`.trim();
            reject(new Error(combinedOutput || `pnpm install failed with exit ${code ?? 1}`));
          });
          child.on('error', reject);
        });

        break;
      } catch (error) {
        if (installAttempts >= 4) {
          throw error;
        }

        const repair = extractUnavailablePackageVersionRepair(error instanceof Error ? error.message : String(error));

        if (!repair) {
          throw error;
        }

        if (!repair.latestVersion) {
          repair.latestVersion = await resolveLatestPackageVersion(repair.packageName, {
            cwd: session.dir,
            writeEvent,
          });
        }

        const appliedRepair = applyUnavailablePackageVersionRepair(packageJson, repair);

        if (!appliedRepair.changed || !appliedRepair.nextVersion) {
          throw error;
        }

        writeEvent?.({
          type: 'status',
          message: `Package ${repair.packageName}@${repair.requestedVersion} is unavailable. Retrying with ${appliedRepair.nextVersion}.`,
        });
        writeEvent?.({
          type: 'stdout',
          chunk: `Self-heal: updated ${repair.packageName} to ${appliedRepair.nextVersion} before retrying install.\n`,
        });

        packageJsonRecord = {
          ...packageJsonRecord,
          raw: `${JSON.stringify(packageJson, null, 2)}\n`,
        };
        await writeWorkspaceFileAtomic(packageJsonRecord.path, packageJsonRecord.raw);
        await fs.rm(path.join(session.dir, 'pnpm-lock.yaml'), {
          force: true,
        });
      }
    }

    await clearHostedWorkspaceDependencyCaches(session);
    const refreshedPackageJsonRecord = await readWorkspacePackageJson(session);
    const refreshedLockfileRecord = await readWorkspaceLockfile(session);
    packageJson = refreshedPackageJsonRecord?.json || packageJson;
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
    changed:
      sanitizedFiles.length > 0 ||
      repairedFiles.length > 0 ||
      previewConfigFiles.length > 0 ||
      installedPackages.length > 0 ||
      generatedFiles.length > 0,
    installedPackages,
    repairedFiles,
    previewConfigFiles,
    sanitizedFiles,
    generatedFiles,
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

export async function startHostedPreviewForSession(session) {
  if (session.preview || session.autoRestoreInFlight || session.processes.has('preview')) {
    return false;
  }

  const diskFiles = await buildWorkspaceFileMapFromDisk(session);
  const bootstrapAlert = buildHostedWorkspaceBootstrapAlert(diskFiles);

  if (bootstrapAlert) {
    appendPreviewDiagnosticEntries(session, 'autostart', bootstrapAlert.description);
    touchPreviewDiagnostics(session, {
      status: 'error',
      healthy: false,
      alert: bootstrapAlert,
    });
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

  const commandResult = await consumeRuntimeCommandStreamForReady(response);

  if (!commandResult.ready) {
    const detail =
      commandResult.stderr ||
      (Number.isFinite(Number(commandResult.exitCode))
        ? `Runtime start command exited with code ${commandResult.exitCode}.`
        : 'Runtime start command completed without emitting a ready preview event.');

    throw new Error(`Hosted preview autostart did not reach ready state. ${detail}`);
  }

  return true;
}

export async function consumeRuntimeCommandStreamForReady(response) {
  if (!response?.body || typeof response.body.getReader !== 'function') {
    return {
      ready: false,
      exitCode: null,
      stderr: '',
    };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  let ready = false;
  let exitCode = null;
  let stderr = '';

  const handleLine = (line) => {
    const trimmed = String(line || '').trim();

    if (!trimmed) {
      return;
    }

    try {
      const event = JSON.parse(trimmed);

      if (event?.type === 'ready') {
        ready = true;
      }

      if (event?.type === 'exit') {
        exitCode = Number.isFinite(Number(event.exitCode)) ? Number(event.exitCode) : null;
      }

      if (event?.type === 'stderr' && typeof event.chunk === 'string') {
        stderr = `${stderr}${event.chunk}`.slice(-2000);
      }
    } catch {
      // Ignore non-NDJSON keepalive fragments.
    }
  };

  while (true) {
    // eslint-disable-next-line no-await-in-loop
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    pending += decoder.decode(value, { stream: true });
    const lines = pending.split('\n');
    pending = lines.pop() || '';

    for (const line of lines) {
      handleLine(line);
    }
  }

  pending += decoder.decode();
  handleLine(pending);

  return {
    ready,
    exitCode,
    stderr: stderr.trim(),
  };
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
        appendPreviewDiagnosticEntries(
          session,
          'autostart',
          'Hosted runtime started preview automatically after workspace sync.',
        );
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

function isBinaryWorkspaceBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    return false;
  }

  const sample = buffer.subarray(0, Math.min(buffer.length, 4096));

  for (const value of sample) {
    if (value === 0) {
      return true;
    }
  }

  return false;
}

function fileMapContainsStarterPlaceholder(fileMap) {
  if (!fileMap || typeof fileMap !== 'object') {
    return false;
  }

  return Object.entries(fileMap).some(([filePath, dirent]) => {
    if (dirent?.type !== 'file' || typeof dirent.content !== 'string' || dirent.isBinary) {
      return false;
    }

    return STARTER_ENTRY_FILE_RE.test(filePath) && dirent.content.includes(STARTER_PLACEHOLDER_TEXT);
  });
}

export async function buildWorkspaceFileMapFromDisk(session) {
  const entries = await walkWorkspace(session.dir);
  const nextFiles = {};

  for (const entry of entries) {
    const absolutePath = path.join(session.dir, entry.path);
    const workbenchPath = path.posix.join(WORK_DIR, entry.path);

    if (entry.type === 'dir') {
      nextFiles[workbenchPath] = {
        type: 'folder',
      };
      continue;
    }

    const buffer = await fs.readFile(absolutePath);
    const isBinary = isBinaryWorkspaceBuffer(buffer);
    const content = isBinary
      ? buffer.toString('base64')
      : buffer.subarray(0, SNAPSHOT_TEXT_FILE_BYTES_LIMIT).toString('utf8');

    nextFiles[workbenchPath] = {
      type: 'file',
      content,
      isBinary,
    };
  }

  return nextFiles;
}

export async function resolveSessionSnapshotFiles(session) {
  const currentFiles = session.currentFileMap || {};
  const currentFileCount = Object.keys(currentFiles).length;
  const currentHasStarterPlaceholder = fileMapContainsStarterPlaceholder(currentFiles);

  let diskFiles = null;

  try {
    diskFiles = await buildWorkspaceFileMapFromDisk(session);
  } catch {
    diskFiles = null;
  }

  if (!diskFiles) {
    return currentFiles;
  }

  const diskFileCount = Object.keys(diskFiles).length;

  if (diskFileCount === 0) {
    return currentFiles;
  }

  const diskHasStarterPlaceholder = fileMapContainsStarterPlaceholder(diskFiles);
  const shouldUseDiskSnapshot =
    currentFileCount === 0 ||
    diskFileCount > currentFileCount ||
    (currentHasStarterPlaceholder && !diskHasStarterPlaceholder);

  if (!shouldUseDiskSnapshot) {
    return currentFiles;
  }

  session.currentFileMap = cloneFileMap(diskFiles);

  return diskFiles;
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
  const previousPort = Number(session.preview?.port || 0);
  const previewBaseUrl = `${getRequestOrigin(req)}/runtime/preview/${session.id}/${resolvedPort}`;

  if (previousPort > 0 && previousPort !== resolvedPort && reservedPreviewPorts.get(previousPort) === session.id) {
    reservedPreviewPorts.delete(previousPort);
  }

  reservedPreviewPorts.set(resolvedPort, session.id);

  session.preview = {
    ...(session.preview || {}),
    port: resolvedPort,
    baseUrl: previewBaseUrl,
  };

  broadcastPreviewState(session);

  return session.preview;
}

export function startReservedPreviewProbe(session, req, kind, previewPort, previewCoordinator) {
  if (kind !== 'start' || !Number.isFinite(Number(previewPort)) || Number(previewPort) <= 0) {
    return false;
  }

  updateSessionPreview(session, req, Number(previewPort));
  previewCoordinator.startProbe(Number(previewPort));

  return true;
}

export function releaseReservedPreviewPorts(session) {
  for (const [port, ownerSessionId] of reservedPreviewPorts.entries()) {
    if (ownerSessionId === session.id) {
      reservedPreviewPorts.delete(port);
    }
  }
}

export function isPreviewPortReserved(port, sessionId) {
  const ownerSessionId = reservedPreviewPorts.get(Number(port));

  if (!ownerSessionId) {
    return false;
  }

  return sessionId ? ownerSessionId === sessionId : true;
}

export function resolveStalePreviewRedirectPath(session, requestUrl, pathname = requestUrl) {
  const target = parsePreviewProxyRequestTarget(requestUrl || pathname);

  if (!target) {
    return null;
  }

  const currentPreviewPort = Number(session?.preview?.port || 0);

  if (currentPreviewPort <= 0 || currentPreviewPort === Number(target.portRaw)) {
    return null;
  }

  return String(requestUrl || pathname).replace(
    `/runtime/preview/${target.sessionId}/${target.portRaw}`,
    `/runtime/preview/${target.sessionId}/${currentPreviewPort}`,
  );
}

function sendPreviewRepairPage(res, session, detail = 'The preview server is warming up or being repaired.') {
  const escapeHtml = (value) =>
    String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  const recoveryMessage =
    session.previewRecovery?.message ||
    'bolt.gives detected a preview problem and is automatically applying repairs until the app is previewable.';

  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Preview repair in progress</title>
    <style>
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f7f3e8; color: #172033; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      main { width: min(720px, calc(100vw - 32px)); border: 1px solid rgba(15, 23, 42, .12); border-radius: 28px; background: rgba(255, 255, 255, .92); box-shadow: 0 24px 80px rgba(15, 23, 42, .16); padding: 32px; }
      .eyebrow { color: #047857; font-weight: 900; font-size: 12px; letter-spacing: .22em; text-transform: uppercase; }
      h1 { margin: 12px 0; font-size: clamp(28px, 5vw, 46px); line-height: .98; letter-spacing: -.05em; }
      p { color: #475569; line-height: 1.7; }
      .bar { height: 10px; overflow: hidden; border-radius: 999px; background: #dbeafe; margin-top: 24px; }
      .bar::before { content: ""; display: block; width: 42%; height: 100%; border-radius: inherit; background: linear-gradient(90deg, #10b981, #0ea5e9); animation: move 1.6s ease-in-out infinite alternate; }
      code { display: block; white-space: pre-wrap; margin-top: 18px; padding: 14px 16px; border-radius: 16px; background: #0f172a; color: #d1fae5; font-size: 12px; }
      @keyframes move { from { transform: translateX(0); } to { transform: translateX(140%); } }
    </style>
  </head>
  <body>
    <main>
      <div class="eyebrow">Preview repair</div>
      <h1>We found a preview issue and are fixing it.</h1>
      <p>${escapeHtml(recoveryMessage)}</p>
      <div class="bar" aria-label="Repair in progress"></div>
      <code>${escapeHtml(detail)}</code>
    </main>
  </body>
</html>`);
}

function getRequestHost(req) {
  return String(req.headers['x-forwarded-host'] || req.headers.host || '')
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, '');
}

function runShellCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || REPO_ROOT,
      env: { ...process.env, ...(options.env || {}) },
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
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(new Error((stderr || stdout || `${command} exited with ${code}`).trim()));
    });
  });
}

function getCloudflareApiConfig() {
  return {
    token: String(process.env.CLOUDFLARE_API_TOKEN || '').trim(),
    zoneId: String(process.env.CLOUDFLARE_ZONE_ID || process.env.BOLT_PROJECT_CLOUDFLARE_ZONE_ID || '').trim(),
  };
}

async function fetchCloudflareApi(pathname, options = {}) {
  const config = getCloudflareApiConfig();

  if (!config.token) {
    throw new Error('CLOUDFLARE_API_TOKEN is not configured.');
  }

  const response = await fetch(`https://api.cloudflare.com/client/v4${pathname}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload?.success === false) {
    const message = payload?.errors?.[0]?.message || `Cloudflare API failed with status ${response.status}`;
    throw new Error(message);
  }

  return payload;
}

async function resolveCloudflareZoneIdForProjectDomain() {
  const configured = getCloudflareApiConfig().zoneId;

  if (configured) {
    return configured;
  }

  const payload = await fetchCloudflareApi(`/zones?name=${encodeURIComponent(PROJECT_DOMAIN_ROOT)}`);
  const zone = Array.isArray(payload?.result) ? payload.result[0] : null;

  if (!zone?.id) {
    throw new Error(`Cloudflare zone ${PROJECT_DOMAIN_ROOT} was not found.`);
  }

  return zone.id;
}

async function resolveExistingProjectDnsStatus(hostname, fallbackMessage = '') {
  if (!PROJECT_PUBLIC_IP) {
    return null;
  }

  try {
    const addresses = await dns.resolve4(hostname);
    return buildResolvedProjectDnsStatus(hostname, PROJECT_PUBLIC_IP, addresses, fallbackMessage);
  } catch {
    return null;
  }
}

async function ensureProjectSubdomainDnsRecord(hostname) {
  if (!PROJECT_PUBLIC_IP) {
    return { status: 'manual-required', message: 'BOLT_PROJECT_PUBLIC_IP is not configured.' };
  }

  const existingDns = await resolveExistingProjectDnsStatus(
    hostname,
    'Existing DNS or wildcard DNS is already in place.',
  );

  if (existingDns) {
    return existingDns;
  }

  try {
    const zoneId = await resolveCloudflareZoneIdForProjectDomain();
    const existing = await fetchCloudflareApi(
      `/zones/${encodeURIComponent(zoneId)}/dns_records?type=A&name=${encodeURIComponent(hostname)}`,
    );
    const records = Array.isArray(existing?.result) ? existing.result : [];
    const record = records[0];
    const body = {
      type: 'A',
      name: hostname,
      content: PROJECT_PUBLIC_IP,
      ttl: 1,
      proxied: true,
      comment: 'Managed by bolt.gives project publishing.',
    };

    if (record?.id) {
      await fetchCloudflareApi(`/zones/${encodeURIComponent(zoneId)}/dns_records/${encodeURIComponent(record.id)}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
    } else {
      await fetchCloudflareApi(`/zones/${encodeURIComponent(zoneId)}/dns_records`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
    }

    return { status: 'active', message: `A record for ${hostname} points to ${PROJECT_PUBLIC_IP}.` };
  } catch (error) {
    const fallbackDns = await resolveExistingProjectDnsStatus(
      hostname,
      `Cloudflare DNS automation was skipped or unavailable: ${error instanceof Error ? error.message : 'unknown error'}.`,
    );

    if (fallbackDns) {
      return fallbackDns;
    }

    return {
      status: 'manual-required',
      message: error instanceof Error ? error.message : 'Cloudflare DNS setup failed.',
    };
  }
}

function caddySnippetForProjectHost(hostname) {
  return `${hostname} {
\tencode zstd gzip
\theader {
\t\tCache-Control "no-store, max-age=0, must-revalidate"
\t}

\thandle {
\t\treverse_proxy 127.0.0.1:${PORT}
\t}
}
`;
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function probeProjectHttpsHandshake(hostname) {
  return new Promise((resolve) => {
    const socket = tls.connect(
      {
        host: hostname,
        port: 443,
        servername: hostname,
        timeout: Math.min(PROJECT_HTTPS_READY_INTERVAL_MS, 5000),
      },
      () => {
        socket.end();
        resolve({ ok: true, error: null });
      },
    );

    socket.on('timeout', () => {
      socket.destroy(new Error('TLS handshake timed out'));
    });
    socket.on('error', (error) => {
      resolve({ ok: false, error });
    });
  });
}

async function waitForProjectHttpsReady(hostname) {
  if (PROJECT_HTTPS_READY_TIMEOUT_MS <= 0) {
    return { ok: true, message: 'HTTPS readiness wait is disabled.' };
  }

  const deadline = Date.now() + PROJECT_HTTPS_READY_TIMEOUT_MS;
  let lastError = null;

  while (Date.now() <= deadline) {
    // This intentionally performs the first TLS handshake so Caddy can complete
    // ACME before the browser receives the newly published URL.
    // eslint-disable-next-line no-await-in-loop
    const result = await probeProjectHttpsHandshake(hostname);

    if (result.ok) {
      return { ok: true, message: `${hostname} accepts HTTPS connections.` };
    }

    lastError = result.error;
    // eslint-disable-next-line no-await-in-loop
    await delay(PROJECT_HTTPS_READY_INTERVAL_MS);
  }

  return {
    ok: false,
    message: `Timed out waiting for HTTPS on ${hostname}: ${lastError?.message || 'TLS handshake failed'}`,
  };
}

async function ensureProjectCaddyHost(hostname) {
  if (!PROJECT_CADDY_ENABLED) {
    return { status: 'disabled', message: 'Project Caddy automation is disabled.' };
  }

  try {
    await fs.mkdir(PROJECT_CADDY_SNIPPET_DIR, { recursive: true });
    const safeName = hostname.replace(/[^a-z0-9.-]/g, '-');
    const snippetPath = path.join(PROJECT_CADDY_SNIPPET_DIR, `${safeName}.caddy`);
    await fs.writeFile(snippetPath, caddySnippetForProjectHost(hostname), 'utf8');

    let caddyfile = await fs.readFile(PROJECT_CADDYFILE_PATH, 'utf8').catch(() => '');
    const importLine = `import ${PROJECT_CADDY_SNIPPET_DIR}/*.caddy`;

    if (caddyfile && !caddyfile.includes(importLine)) {
      caddyfile = `${caddyfile.trim()}\n\n${importLine}\n`;
      await fs.writeFile(PROJECT_CADDYFILE_PATH, caddyfile, 'utf8');
    }

    await runShellCommand('caddy', ['fmt', '--overwrite', PROJECT_CADDYFILE_PATH]).catch(() => undefined);
    await runShellCommand('caddy', ['reload', '--config', PROJECT_CADDYFILE_PATH]);
    const httpsReady = await waitForProjectHttpsReady(hostname);

    if (!httpsReady.ok) {
      return { status: 'pending', message: httpsReady.message };
    }

    return { status: 'active', message: `Caddy route for ${hostname} is active. ${httpsReady.message}` };
  } catch (error) {
    return {
      status: 'manual-required',
      message: error instanceof Error ? error.message : 'Caddy route setup failed.',
    };
  }
}

async function createStripeCustomDomainCheckout({ deployment, customDomain, req, customerEmail = '' }) {
  if (!STRIPE_SECRET_KEY) {
    throw new Error('Stripe custom-domain billing is not configured on this deployment.');
  }

  const origin = getRequestOrigin(req);
  const unitAmount = Math.round(STRIPE_CUSTOM_DOMAIN_PRICE_USD * 100);
  const payload = {
    mode: 'subscription',
    success_url: `${origin}/chat?custom_domain=success&domain=${encodeURIComponent(customDomain)}`,
    cancel_url: `${origin}/chat?custom_domain=cancelled&domain=${encodeURIComponent(customDomain)}`,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: unitAmount,
          recurring: { interval: 'month' },
          product_data: {
            name: 'bolt.gives custom domain hosting',
            description: `$${STRIPE_CUSTOM_DOMAIN_PRICE_USD}/month hosting for ${customDomain}`,
          },
        },
      },
    ],
    metadata: {
      sessionId: deployment.sessionId,
      subdomain: deployment.subdomain,
      boltHostname: deployment.hostname,
      customDomain,
    },
  };

  if (customerEmail && isLikelyValidEmail(customerEmail)) {
    payload.customer_email = customerEmail;
  }

  const body = new URLSearchParams(encodeStripeForm(payload));
  const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data?.url) {
    throw new Error(data?.error?.message || `Stripe Checkout failed with status ${response.status}`);
  }

  return {
    checkoutSessionId: data.id || null,
    checkoutUrl: data.url,
    publishableKey: STRIPE_PUBLISHABLE_KEY || null,
  };
}

async function proxyPublishedProjectRequest(req, res, deployment) {
  const session = sessions.get(deployment.sessionId);

  if (!session) {
    sendPreviewRepairPage(
      res,
      { previewRecovery: { message: null } },
      'The published project session is not loaded yet.',
    );
    return;
  }

  void ensureRuntimeNodeWorkspaceForSession(session);

  if (!session.preview?.port) {
    scheduleHostedAutoStartAfterSync(session);
    sendPreviewRepairPage(
      res,
      session,
      'The published project preview is starting. This page will be available shortly.',
    );
    return;
  }

  const port = Number(session.preview.port);
  const upstreamReq = http.request(
    {
      host: HOST,
      port,
      method: req.method,
      path: req.url || '/',
      headers: {
        ...req.headers,
        host: `${HOST}:${port}`,
      },
    },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode || 200, applyPreviewResponseHeaders({ ...upstreamRes.headers }));
      upstreamRes.pipe(res);
    },
  );

  upstreamReq.setTimeout(PREVIEW_PROXY_UPSTREAM_TIMEOUT_MS, () => {
    upstreamReq.destroy(new Error(`Published project upstream timed out after ${PREVIEW_PROXY_UPSTREAM_TIMEOUT_MS}ms`));
  });
  upstreamReq.on('error', (error) => {
    const alert = {
      type: 'error',
      title: 'Published Project Preview Error',
      description: `Published project proxy failed: ${error.message}`,
      content: `Proxy request for ${deployment.hostname} failed.`,
      source: 'preview',
    };
    schedulePreviewAutoRestore(session, alert);
    sendPreviewRepairPage(res, session, `Published project proxy failed: ${error.message}`);
  });

  if (req.method === 'GET' || req.method === 'HEAD') {
    upstreamReq.end();
    return;
  }

  req.pipe(upstreamReq);
}

async function maybeHandlePublishedProjectRequest(req, res) {
  const deployment = await resolvePublishedProjectDeploymentForRequest(req);

  if (!deployment) {
    return false;
  }

  await proxyPublishedProjectRequest(req, res, deployment);
  return true;
}

async function resolvePublishedProjectDeploymentForRequest(req) {
  const host = getRequestHost(req);

  if (!host || host === PROJECT_DOMAIN_ROOT || host === `www.${PROJECT_DOMAIN_ROOT}`) {
    return null;
  }

  const registry = await ensureProjectDeploymentRegistry();
  const deployment = findProjectDeploymentByHost(registry, host);

  if (!deployment || deployment.status === 'suspended') {
    return null;
  }

  return deployment;
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
    if (reservedPreviewPorts.has(port)) {
      continue;
    }

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
    terminateSessionProcessHandle(handle);
  }

  session.processes.clear();
  releaseReservedPreviewPorts(session);
  session.preview = undefined;
  clearPreviewDiagnostics(session);
  clearPreviewRecoveryState(session);
}

function terminateSessionProcessHandle(handle, signal = 'SIGTERM') {
  const child = handle?.process;

  if (!child || !Number.isFinite(Number(child.pid))) {
    return;
  }

  if (handle.detached) {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch {
      // Fall back to the direct child below when the process group has already exited.
    }
  }

  try {
    child.kill(signal);
  } catch {
    // The process may already be gone.
  }
}

async function handleRunCommand(req, res, session, body) {
  const { command, kind } = body || {};

  if (typeof command !== 'string' || !command.trim()) {
    sendText(res, 400, 'Missing command');
    return;
  }

  const writeEvent = createEventWriter(res);
  const requestedPreviewPort = kind === 'start' ? session.preview?.port || (await allocatePreviewPort()) : undefined;
  let effectiveCommand = kind === 'start' ? normalizeStartCommand(command, requestedPreviewPort) : command.trim();
  let previewPort =
    kind === 'start' ? extractConfiguredStartPort(effectiveCommand) || Number(requestedPreviewPort || 0) : undefined;
  let needsManifest = commandNeedsProjectManifest(effectiveCommand);

  if (needsManifest && !(await workspaceHasOwnProjectManifest(session.dir))) {
    const bootstrapRepair = await ensureHostedWorkspaceProjectBootstrap(session);

    if (bootstrapRepair.generatedFiles.length > 0) {
      writeEvent({
        type: 'status',
        message: `Architect bootstrapped a runnable workspace manifest: ${bootstrapRepair.generatedFiles.join(', ')}`,
      });
    }
  }

  if (
    kind === 'start' &&
    /(^|&&\s*)(?:npx\s+--yes\s+)?serve\b/i.test(effectiveCommand) &&
    (await workspaceHasOwnProjectManifest(session.dir))
  ) {
    const inferredStartCommand = await inferWorkspaceStartCommand(session);

    if (inferredStartCommand) {
      effectiveCommand = normalizeStartCommand(inferredStartCommand, requestedPreviewPort);
      previewPort = extractConfiguredStartPort(effectiveCommand) || Number(requestedPreviewPort || 0);
      needsManifest = commandNeedsProjectManifest(effectiveCommand);
      writeEvent({
        type: 'status',
        message: `Architect upgraded the preview start command to "${effectiveCommand}" after bootstrapping the workspace runtime.`,
      });
    }
  }

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
      const preparation = await prepareHostedWorkspaceForStart(session, { writeEvent, startCommand: effectiveCommand });

      if (preparation.sanitizedFiles.length > 0) {
        writeEvent({
          type: 'status',
          message: `Architect removed incompatible legacy Tailwind directives from ${preparation.sanitizedFiles.join(', ')}`,
        });
      }

      if (preparation.repairedFiles.length > 0) {
        writeEvent({
          type: 'status',
          message: `Architect repaired unsafe JSX text entities in ${preparation.repairedFiles.join(', ')}`,
        });
      }

      if (preparation.previewConfigFiles.length > 0) {
        writeEvent({
          type: 'status',
          message: `Architect disabled Vite HMR for hosted preview configs: ${preparation.previewConfigFiles.join(', ')}`,
        });
      }

      if (preparation.generatedFiles.length > 0) {
        writeEvent({
          type: 'status',
          message: `Architect generated missing runtime support files: ${preparation.generatedFiles.join(', ')}`,
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

    if (previewPort) {
      reservedPreviewPorts.set(previewPort, session.id);
    }
  }

  writeEvent({ type: 'status', message: `Running ${kind} command on hosted runtime` });
  const child = spawn('bash', ['-lc', effectiveCommand], {
    cwd: session.dir,
    env,
    detached: kind === 'start',
  });

  const processKey = kind === 'start' ? 'preview' : `command-${Date.now()}`;
  session.processes.set(processKey, { process: child, port: previewPort, detached: kind === 'start' });

  let output = '';
  let settled = false;
  let previewProbePromise;
  const timeout = setTimeout(() => {
    if (settled) {
      return;
    }

    terminateSessionProcessHandle({ process: child, port: previewPort, detached: kind === 'start' });
  }, COMMAND_TIMEOUT_MS);
  const exitPromise = new Promise((resolve, reject) => {
    child.on('close', (exitCode) => resolve(exitCode ?? 1));
    child.on('error', (error) => reject(error));
  });
  const previewCoordinator = createPreviewProbeCoordinator(waitForPreview);
  previewProbePromise = previewCoordinator.readyPromise;
  const attachPreviewProcessLivenessMonitor = () => {
    if (kind !== 'start') {
      return;
    }

    child.once('close', (exitCode) => {
      const activeHandle = session.processes.get(processKey);

      if (!activeHandle || activeHandle.process !== child) {
        return;
      }

      session.processes.delete(processKey);
      releaseReservedPreviewPorts(session);
      session.preview = undefined;

      const message = `Hosted preview process exited with code ${exitCode ?? 1}.`;

      appendPreviewDiagnosticEntries(session, 'preview', message);
      touchPreviewDiagnostics(session, {
        status: 'error',
        healthy: false,
        alert: {
          type: 'error',
          title: 'Preview Error',
          description: 'The hosted preview process exited unexpectedly.',
          content: message,
          source: 'preview',
        },
      });
      scheduleHostedAutoStartAfterSync(session);
    });
  };

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

  startReservedPreviewProbe(session, req, kind, previewPort, previewCoordinator);

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
      const initialProbe = await probeSessionPreviewHealth(session);

      if (initialProbe.alert || !initialProbe.healthy) {
        throw new Error(initialProbe.alert?.description || 'Preview did not pass the initial boot verification.');
      }

      touchPreviewDiagnostics(session, {
        status: 'ready',
        healthy: true,
        alert: null,
      });
      attachPreviewProcessLivenessMonitor();
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
      terminateSessionProcessHandle({ process: child, port: previewPort, detached: kind === 'start' });
      const exitCode = await exitPromise.catch(() => 1);
      session.processes.delete(processKey);
      releaseReservedPreviewPorts(session);
      session.preview = undefined;
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
  const nextPreviewPath = resolveStalePreviewRedirectPath(session, req.url || pathname, pathname);

  if (nextPreviewPath) {
    res.writeHead(307, {
      Location: nextPreviewPath,
      'Cache-Control': 'no-store',
    });
    res.end();
    return;
  }

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
        recordPreviewResponse(session, rewritten, statusCode, upstreamPath, contentType);

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

    const alert = {
      type: 'error',
      title: 'Preview Error',
      description: `Preview proxy failed: ${error.message}`,
      content: `Proxy request to ${upstreamPath} failed.`,
      source: 'preview',
    };
    schedulePreviewAutoRestore(session, alert);
    sendPreviewRepairPage(res, session, `Preview proxy failed: ${error.message}`);
  });

  if (req.method === 'GET' || req.method === 'HEAD') {
    upstreamReq.end();
    return;
  }

  req.pipe(upstreamReq);
}

function writeUpgradeError(socket, statusCode, statusText) {
  if (socket.destroyed) {
    return;
  }

  socket.write(`HTTP/1.1 ${statusCode} ${statusText}\r\nConnection: close\r\n\r\n`);
  socket.destroy();
}

export function resolvePublishedProjectUpgradeTarget(deployment, session) {
  if (!deployment || deployment.status === 'suspended') {
    return { ok: false, statusCode: 404, statusText: 'Not Found', reason: 'Project deployment is unavailable.' };
  }

  if (!session) {
    return {
      ok: false,
      statusCode: 503,
      statusText: 'Service Unavailable',
      reason: 'The published project session is not loaded yet.',
    };
  }

  const port = Number(session.preview?.port || deployment.previewPort || 0);

  if (!port) {
    return {
      ok: false,
      statusCode: 503,
      statusText: 'Service Unavailable',
      reason: 'The published project preview is not ready yet.',
    };
  }

  return { ok: true, portRaw: String(port), upstreamPath: null };
}

function proxyUpgradeToPreviewPort(req, socket, head, { portRaw, upstreamPath }) {
  if (!portRaw || !upstreamPath) {
    writeUpgradeError(socket, 404, 'Not Found');
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
      writeUpgradeError(socket, 502, 'Bad Gateway');
    }
  });

  socket.on('error', () => {
    if (!upstreamSocket.destroyed) {
      upstreamSocket.destroy();
    }
  });
}

function proxyPreviewUpgrade(req, socket, head) {
  const target = parsePreviewProxyRequestTarget(req.url || '');

  if (!target) {
    writeUpgradeError(socket, 404, 'Not Found');
    return;
  }

  const { sessionId, portRaw, upstreamPath } = target;
  const session = sessions.get(sessionId);

  if (!session) {
    writeUpgradeError(socket, 404, 'Not Found');
    return;
  }

  proxyUpgradeToPreviewPort(req, socket, head, { portRaw, upstreamPath });
}

function proxyPublishedProjectUpgrade(req, socket, head, deployment) {
  const session = sessions.get(deployment.sessionId);
  const target = resolvePublishedProjectUpgradeTarget(deployment, session);

  if (!target.ok) {
    writeUpgradeError(socket, target.statusCode, target.statusText);
    return;
  }

  proxyUpgradeToPreviewPort(req, socket, head, {
    portRaw: target.portRaw,
    upstreamPath: req.url || '/',
  });
}

async function maybeHandlePublishedProjectUpgrade(req, socket, head) {
  const deployment = await resolvePublishedProjectDeploymentForRequest(req);

  if (!deployment) {
    return false;
  }

  proxyPublishedProjectUpgrade(req, socket, head, deployment);
  return true;
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

    if (!pathname.startsWith('/runtime/') && (await maybeHandlePublishedProjectRequest(req, res))) {
      return;
    }

    if (pathname === '/health') {
      sendJson(res, 200, { ok: true, host: HOST, port: PORT, sessions: sessions.size });
      return;
    }

    if (pathname === '/runtime/health') {
      sendJson(res, 200, { ok: true, host: HOST, port: PORT, sessions: sessions.size });
      return;
    }

    if (req.method === 'POST' && pathname === '/runtime/internal/hosted-free-relay/verify') {
      try {
        const body = await readJsonBody(req);
        const providedSecret = typeof body?.providedSecret === 'string' ? body.providedSecret : '';
        const providerName = typeof body?.providerName === 'string' ? body.providerName : '';

        sendJson(res, 200, {
          authorized: providerName === 'FREE' && authorizeHostedFreeRelaySecret(providedSecret),
        });
      } catch (error) {
        sendText(res, 500, error instanceof Error ? error.message : 'Failed to verify the hosted FREE relay secret.');
      }
      return;
    }

    if (req.method === 'POST' && pathname === '/runtime/internal/free-usage-quota/check') {
      try {
        const providedSecret = String(req.headers['x-bolt-hosted-free-relay-secret'] || '');

        if (!authorizeFreeUsageQuotaSecret(providedSecret)) {
          sendJson(res, 403, { ok: false, message: 'Invalid hosted FREE quota credentials.' });
          return;
        }

        const body = await readJsonBody(req);
        const quota = await checkFreeUsageQuota({
          subjectHash: body?.subjectHash,
          limitUsd: body?.limitUsd,
        });

        sendJson(res, quota.allowed ? 200 : 429, {
          ok: quota.allowed,
          quota,
          message: quota.message,
        });
      } catch (error) {
        sendJson(res, 500, {
          ok: false,
          message: error instanceof Error ? error.message : 'Failed to inspect hosted FREE quota.',
        });
      }
      return;
    }

    if (req.method === 'POST' && pathname === '/runtime/internal/free-usage-quota/record') {
      try {
        const providedSecret = String(req.headers['x-bolt-hosted-free-relay-secret'] || '');

        if (!authorizeFreeUsageQuotaSecret(providedSecret)) {
          sendJson(res, 403, { ok: false, message: 'Invalid hosted FREE quota credentials.' });
          return;
        }

        const body = await readJsonBody(req);
        const quota = await recordFreeUsageQuota({
          subjectHash: body?.subjectHash,
          costUsd: body?.costUsd,
          usage: body?.usage,
          limitUsd: body?.limitUsd,
        });

        sendJson(res, 200, {
          ok: true,
          quota,
        });
      } catch (error) {
        sendJson(res, 500, {
          ok: false,
          message: error instanceof Error ? error.message : 'Failed to record hosted FREE quota.',
        });
      }
      return;
    }

    if (pathname.startsWith('/runtime/preview/')) {
      proxyPreviewRequest(req, res, pathname);
      return;
    }

    if (req.method === 'GET' && pathname === '/runtime/runtime-node/config') {
      try {
        const config = buildRuntimeNodeConfig();
        const registry = await ensureRuntimeNodeWorkspaceRegistry();

        sendJson(res, 200, {
          ok: true,
          ...sanitizeRuntimeNodeConfigForClient(config),
          summary: buildRuntimeNodeWorkspaceSummary(registry.workspaces),
        });
      } catch (error) {
        sendText(res, 500, error instanceof Error ? error.message : 'Failed to inspect runtime node support.');
      }
      return;
    }

    if (req.method === 'POST' && pathname === '/runtime/runtime-node/workspaces') {
      let stagedWorkspace = null;
      let stagedSecrets = null;

      try {
        const config = buildRuntimeNodeConfig();

        if (!config.supported) {
          sendText(res, 503, config.reason || 'Dedicated runtime-node workspaces are unavailable.');
          return;
        }

        const body = await readJsonBody(req);
        const clientName = String(body.clientName || '').trim();
        const clientEmail = String(body.clientEmail || '')
          .trim()
          .toLowerCase();
        const projectName = String(body.projectName || '').trim();
        const cliUsername = String(body.cliUsername || '').trim();
        const cliPassword = String(body.cliPassword || '');
        const usernameValidation = validateRuntimeNodeUsername(cliUsername);
        const projectSlug = slugifyRuntimeNodeProject(projectName);

        if (clientName.length < 2) {
          sendText(res, 400, 'Client name must be at least 2 characters long.');
          return;
        }

        if (!isLikelyValidEmail(clientEmail)) {
          sendText(res, 400, 'A valid email address is required.');
          return;
        }

        if (!projectSlug || projectSlug.length < 3) {
          sendText(res, 400, 'Project name must create a slug with at least 3 letters or numbers.');
          return;
        }

        if (!usernameValidation.ok) {
          sendText(res, 400, usernameValidation.reason);
          return;
        }

        const registry = await ensureRuntimeNodeWorkspaceRegistry();

        if (registry.workspaces.some((workspace) => workspace.projectSlug === projectSlug)) {
          sendText(res, 409, 'That live workspace project slug is already in use.');
          return;
        }

        if (registry.workspaces.some((workspace) => workspace.cliUsername === usernameValidation.username)) {
          sendText(res, 409, 'That CLI username is already in use on the runtime node.');
          return;
        }

        const { record, secrets } = createRuntimeNodeWorkspaceRecord(
          {
            clientName,
            clientEmail,
            projectName,
            cliUsername,
            cliPassword,
          },
          config,
        );

        stagedWorkspace = record;
        stagedSecrets = secrets;
        registry.workspaces.unshift(record);
        appendRuntimeNodeWorkspaceEvent(registry, {
          actor: clientEmail,
          action: 'runtime-node.workspace.requested',
          target: record.projectSlug,
          details: {
            cliUsername: record.cliUsername,
            workspaceDir: record.workspaceDir,
          },
        });
        await writeRuntimeNodeWorkspaceRegistry(registry);

        await runRuntimeNodeProvision(record, secrets, config);

        record.status = 'active';
        record.provisionedAt = new Date().toISOString();
        record.updatedAt = record.provisionedAt;
        record.lastError = null;
        appendRuntimeNodeWorkspaceEvent(registry, {
          actor: clientEmail,
          action: 'runtime-node.workspace.provisioned',
          target: record.projectSlug,
          details: {
            cliUsername: record.cliUsername,
            workspaceDir: record.workspaceDir,
            databaseName: record.databaseName,
          },
        });
        await writeRuntimeNodeWorkspaceRegistry(registry);

        sendJson(res, 200, {
          ok: true,
          workspace: sanitizeRuntimeNodeWorkspaceForClient(record, secrets),
        });
      } catch (error) {
        const registry = await ensureRuntimeNodeWorkspaceRegistry();
        const message = redactRuntimeNodeError(
          error instanceof Error ? error.message : String(error),
          stagedSecrets || {},
        );

        if (stagedWorkspace) {
          const existing = registry.workspaces.find((workspace) => workspace.id === stagedWorkspace.id);
          const target = existing || stagedWorkspace;
          target.status = 'failed';
          target.updatedAt = new Date().toISOString();
          target.lastError = message;

          if (!existing) {
            registry.workspaces.unshift(target);
          }

          appendRuntimeNodeWorkspaceEvent(registry, {
            actor: stagedWorkspace.clientEmail || 'runtime-node',
            action: 'runtime-node.workspace.failed',
            target: stagedWorkspace.projectSlug,
            details: { error: message },
          });
          await writeRuntimeNodeWorkspaceRegistry(registry);
        }

        sendText(res, 500, message || 'Failed to provision the live runtime workspace.');
      }
      return;
    }

    if (req.method === 'GET' && pathname === '/runtime/managed-instances/config') {
      try {
        const support = await buildManagedInstanceSupportState();
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
        const support = await buildManagedInstanceSupportState();

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
        const sourceHost = String(body.sourceHost || '')
          .trim()
          .toLowerCase();
        const clientProfile = {
          name,
          email,
          company: String(body.company || '').trim(),
          role: String(body.role || '').trim(),
          phone: String(body.phone || '').trim(),
          country: String(body.country || '').trim(),
          useCase: String(body.useCase || '').trim(),
          requestedSubdomain,
          registrationSource: buildClientRegistrationSource(sourceHost),
        };

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

        if (ADMIN_DB_CONFIG.enabled) {
          await upsertClientProfile(clientProfile);
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
        await syncManagedInstanceToAdminDatabase(instance);

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
        const support = await buildManagedInstanceSupportState();

        if (!support.supported) {
          sendText(res, 503, support.reason || 'Managed instance rollout is unavailable on this deployment.');
          return;
        }

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

        await suspendManagedInstanceRecord(registry, instance, {
          actor: instance.email,
          reason: 'Managed trial instance suspended by the client.',
        });
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
    const publishMatch = pathname.match(/^\/runtime\/sessions\/([^/]+)\/publish$/);
    const customDomainCheckoutMatch = pathname.match(/^\/runtime\/sessions\/([^/]+)\/custom-domain\/checkout$/);

    if (req.method === 'GET' && pathname === '/runtime/tenant-admin/status') {
      try {
        const registry = await ensureTenantRegistry();
        const managedSupport = await buildManagedInstanceSupportState();
        let managedInstances = [];
        let managedFleetSummary = buildManagedInstanceFleetSummary([]);
        let clientProfiles = [];
        let emailMessages = [];
        let bugReports = [];
        const mailSupport = buildAdminMailSupport();

        if (managedSupport.supported) {
          const managedRegistry = await ensureManagedInstanceRegistry();
          await maybeExpireManagedInstances(managedRegistry, { actor: registry.admin?.username || 'admin' });
          await syncManagedRegistryToAdminDatabase(managedRegistry);
          managedFleetSummary = buildManagedInstanceFleetSummary(managedRegistry.instances);
          managedInstances = managedRegistry.instances
            .slice()
            .sort(
              (left, right) =>
                Date.parse(right.updatedAt || right.createdAt) - Date.parse(left.updatedAt || left.createdAt),
            )
            .map((instance) => sanitizeManagedInstanceForOperator(instance));
        }

        if (ADMIN_DB_CONFIG.enabled) {
          clientProfiles = await listClientProfiles();
          emailMessages = await listAdminEmailMessages(100);
          bugReports = await listBugReports(100);
        }

        sendJson(res, 200, {
          supported: true,
          tenants: registry.tenants || [],
          auditTrail: registry.auditTrail || [],
          managedSupport,
          managedFleetSummary,
          managedInstances,
          clientProfiles,
          emailMessages,
          bugReports,
          mailSupport,
          adminPanelUrl: ADMIN_PANEL_PUBLIC_URL,
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

    const tenantManagedInstanceRefreshMatch = pathname.match(
      /^\/runtime\/tenant-admin\/managed-instances\/([^/]+)\/refresh$/,
    );

    if (req.method === 'POST' && tenantManagedInstanceRefreshMatch) {
      try {
        const support = await buildManagedInstanceSupportState();

        if (!support.supported) {
          sendText(res, 503, support.reason || 'Managed instance rollout is unavailable on this deployment.');
          return;
        }

        const slug = decodeURIComponent(tenantManagedInstanceRefreshMatch[1] || '');
        const registry = await ensureManagedInstanceRegistry();
        await maybeExpireManagedInstances(registry, { actor: 'admin' });
        const instance = findManagedInstanceBySlug(registry, slug);

        if (!instance) {
          sendText(res, 404, 'Managed instance not found.');
          return;
        }

        if (instance.status === 'expired') {
          sendText(res, 400, 'Expired managed trial instances cannot be refreshed.');
          return;
        }

        instance.suspendedAt = null;
        const refreshed = await refreshManagedInstanceFromCurrentBuild(registry, instance, {
          actor: 'admin',
          reason: 'tenant-admin-refresh',
        });

        sendJson(res, 200, {
          ok: true,
          instance: sanitizeManagedInstanceForOperator(refreshed),
        });
      } catch (error) {
        sendText(res, 500, error instanceof Error ? error.message : 'Failed to refresh the managed instance.');
      }
      return;
    }

    const tenantManagedInstanceSuspendMatch = pathname.match(
      /^\/runtime\/tenant-admin\/managed-instances\/([^/]+)\/suspend$/,
    );

    if (req.method === 'POST' && tenantManagedInstanceSuspendMatch) {
      try {
        const slug = decodeURIComponent(tenantManagedInstanceSuspendMatch[1] || '');
        const registry = await ensureManagedInstanceRegistry();
        const instance = findManagedInstanceBySlug(registry, slug);

        if (!instance) {
          sendText(res, 404, 'Managed instance not found.');
          return;
        }

        await suspendManagedInstanceRecord(registry, instance, {
          actor: 'admin',
          reason: 'Managed trial instance suspended by the operator.',
        });

        sendJson(res, 200, {
          ok: true,
          instance: sanitizeManagedInstanceForOperator(instance),
        });
      } catch (error) {
        sendText(res, 500, error instanceof Error ? error.message : 'Failed to suspend the managed instance.');
      }
      return;
    }

    if (req.method === 'POST' && pathname === '/runtime/tenant-admin/mail/config') {
      try {
        const body = await readJsonBody(req);
        const clear = normalizeBooleanInput(body.clear);

        if (clear) {
          await updateRuntimeEnvFile({
            BOLT_ADMIN_SMTP_HOST: null,
            BOLT_ADMIN_SMTP_PORT: null,
            BOLT_ADMIN_SMTP_USER: null,
            BOLT_ADMIN_SMTP_PASSWORD: null,
            BOLT_ADMIN_SMTP_FROM: null,
            BOLT_ADMIN_SMTP_SECURE: null,
          });
          resetAdminMailTransporter();
          sendJson(res, 200, {
            ok: true,
            cleared: true,
            mailSupport: buildAdminMailSupport(),
          });
          return;
        }

        const currentSupport = buildAdminMailSupport();
        const host = String(body.host || '').trim();
        const port = Number(String(body.port || '').trim() || '587');
        const user = String(body.user || '').trim();
        const password = String(body.password || '');
        const fromAddress = String(body.fromAddress || '').trim();
        const secure = normalizeBooleanInput(body.secure) || port === 465;

        if (!host) {
          sendText(res, 400, 'SMTP host is required.');
          return;
        }

        if (!Number.isFinite(port) || port < 1 || port > 65535) {
          sendText(res, 400, 'SMTP port must be between 1 and 65535.');
          return;
        }

        if (!fromAddress || !isLikelyValidEmail(fromAddress)) {
          sendText(res, 400, 'A valid SMTP from address is required.');
          return;
        }

        if (!user && password.trim()) {
          sendText(res, 400, 'Provide the SMTP username before saving a password.');
          return;
        }

        if (user && !password && (!currentSupport.hasPassword || currentSupport.user !== user)) {
          sendText(res, 400, 'Provide the SMTP password when saving a new SMTP username.');
          return;
        }

        await updateRuntimeEnvFile({
          BOLT_ADMIN_SMTP_HOST: host,
          BOLT_ADMIN_SMTP_PORT: String(port),
          BOLT_ADMIN_SMTP_USER: user || null,
          BOLT_ADMIN_SMTP_PASSWORD: user ? (password.trim() ? password : undefined) : null,
          BOLT_ADMIN_SMTP_FROM: fromAddress,
          BOLT_ADMIN_SMTP_SECURE: secure ? 'true' : 'false',
        });
        resetAdminMailTransporter();

        sendJson(res, 200, {
          ok: true,
          cleared: false,
          mailSupport: buildAdminMailSupport(),
        });
      } catch (error) {
        sendText(res, 500, error instanceof Error ? error.message : 'Failed to save SMTP settings.');
      }
      return;
    }

    if (req.method === 'POST' && pathname === '/runtime/tenant-admin/email/send') {
      try {
        const body = await readJsonBody(req);
        const profileEmail = String(body.profileEmail || '')
          .trim()
          .toLowerCase();
        const recipients = Array.isArray(body.recipients)
          ? body.recipients
              .map((recipient) =>
                String(recipient || '')
                  .trim()
                  .toLowerCase(),
              )
              .filter(Boolean)
          : [];
        const subject = String(body.subject || '').trim();
        const messageBody = String(body.body || '').trim();
        const actor = String(body.actor || 'admin').trim() || 'admin';

        if (!profileEmail && recipients.length === 0) {
          sendText(res, 400, 'A valid client email address or recipient list is required.');
          return;
        }

        if (profileEmail && !isLikelyValidEmail(profileEmail)) {
          sendText(res, 400, 'A valid client email address is required.');
          return;
        }

        if (recipients.some((recipient) => !isLikelyValidEmail(recipient))) {
          sendText(res, 400, 'All batch recipients must be valid email addresses.');
          return;
        }

        if (!subject || !messageBody) {
          sendText(res, 400, 'Subject and message body are required.');
          return;
        }

        if (!ADMIN_DB_CONFIG.enabled) {
          sendText(res, 503, 'Admin email requires the Postgres-backed admin database to be configured.');
          return;
        }

        const message =
          recipients.length > 0
            ? await sendAdminEmailBatch({
                recipients,
                subject,
                body: messageBody,
                actor,
              })
            : await sendAdminEmail({
                profileEmail,
                subject,
                body: messageBody,
                actor,
              });

        sendJson(res, 200, {
          ok: true,
          message,
          mailSupport: buildAdminMailSupport(),
        });
      } catch (error) {
        sendText(res, 500, error instanceof Error ? error.message : 'Failed to record the admin email message.');
      }
      return;
    }

    if (req.method === 'POST' && pathname === '/runtime/bug-reports') {
      try {
        const body = await readJsonBody(req);
        const fullName = String(body.fullName || '').trim();
        const reporterEmail = String(body.reporterEmail || '')
          .trim()
          .toLowerCase();
        const issue = String(body.issue || '').trim();
        const summary = String(body.summary || '').trim();
        const pageUrl = String(body.pageUrl || '').trim() || null;
        const appVersion = String(body.appVersion || '').trim() || null;
        const provider = String(body.provider || '').trim() || null;
        const model = String(body.model || '').trim() || null;
        const browser = String(body.browser || '').trim() || null;
        const userAgent = String(req.headers['user-agent'] || '').trim() || null;

        if (!fullName || !reporterEmail || !issue) {
          sendText(res, 400, 'Full name, email address, and issue details are required.');
          return;
        }

        if (!isLikelyValidEmail(reporterEmail)) {
          sendText(res, 400, 'A valid reply email address is required.');
          return;
        }

        if (issue.length < 10) {
          sendText(res, 400, 'Bug reports must include enough detail to investigate the issue.');
          return;
        }

        const rateLimitKey = deriveBugReporterKey(req, reporterEmail);

        if (!consumeBugReportRateLimit(rateLimitKey)) {
          sendText(res, 429, 'Too many bug reports from this session. Please wait before sending another one.');
          return;
        }

        if (!ADMIN_DB_CONFIG.enabled) {
          sendText(res, 503, 'Bug reporting requires the Postgres-backed admin database to be configured.');
          return;
        }

        const notification = await sendBugReportNotification({
          fullName,
          reporterEmail,
          summary,
          issue,
          pageUrl,
          appVersion,
          provider,
          model,
          browser,
        });

        const record = await recordBugReport({
          fullName,
          reporterEmail,
          summary,
          issue,
          pageUrl,
          appVersion,
          provider,
          model,
          browser,
          userAgent,
          status: 'new',
          notificationStatus: notification.status,
          notificationTransport: notification.transport,
          notificationError: notification.error,
          notifiedAt: notification.sentAt,
        });

        sendJson(res, 200, {
          ok: true,
          bugReport: record,
          notification: {
            status: notification.status,
            recipient: notification.recipient,
          },
        });
      } catch (error) {
        sendText(res, 500, error instanceof Error ? error.message : 'Failed to record the bug report.');
      }
      return;
    }

    if (req.method === 'POST' && pathname === '/runtime/contributor-applications') {
      try {
        const body = await readJsonBody(req);
        const fullName = String(body.fullName || '').trim();
        const email = String(body.email || '')
          .trim()
          .toLowerCase();
        const githubUsername = String(body.githubUsername || '')
          .trim()
          .replace(/^@+/, '');
        const experience = String(body.experience || '').trim();
        const why = String(body.why || '').trim();
        const contributionAreas = String(body.contributionAreas || '').trim();

        if (!fullName || !email || !githubUsername || !experience || !why) {
          sendText(res, 400, 'Name, email, GitHub username, experience, and motivation are required.');
          return;
        }

        if (!isLikelyValidEmail(email)) {
          sendText(res, 400, 'A valid email address is required.');
          return;
        }

        if (experience.length < 20 || why.length < 20) {
          sendText(res, 400, 'Contributor applications need more detail before they can be submitted.');
          return;
        }

        const notification = await sendContributorApplicationEmails({
          fullName,
          email,
          githubUsername,
          role: String(body.role || '').trim(),
          location: String(body.location || '').trim(),
          profileUrl: String(body.profileUrl || '').trim(),
          portfolioUrl: String(body.portfolioUrl || '').trim(),
          availability: String(body.availability || '').trim(),
          experience,
          contributionAreas,
          why,
          sourceUrl: String(body.sourceUrl || '').trim(),
          userAgent: String(req.headers['user-agent'] || '').trim(),
        });

        sendJson(res, 200, {
          ok: true,
          notification: {
            status: notification.status,
            recipient: notification.recipient,
            applicantEmail: notification.applicantEmail,
          },
        });
      } catch (error) {
        sendText(res, 500, error instanceof Error ? error.message : 'Failed to submit contributor application.');
      }
      return;
    }

    if (req.method === 'GET' && pathname === '/runtime/shout/messages') {
      try {
        sendJson(res, 200, {
          ok: true,
          messages: await listShoutboxMessages(),
        });
      } catch (error) {
        sendText(res, 500, error instanceof Error ? error.message : 'Failed to load shout-out messages.');
      }
      return;
    }

    if (req.method === 'POST' && pathname === '/runtime/shout/send') {
      try {
        const body = await readJsonBody(req);
        const message = await appendShoutboxMessage({
          author: String(body.author || '').trim(),
          content: String(body.content || '').trim(),
        });

        sendJson(res, 200, {
          ok: true,
          message,
        });
      } catch (error) {
        sendText(res, 400, error instanceof Error ? error.message : 'Failed to send the shout-out message.');
      }
      return;
    }

    if (req.method === 'POST' && pathname === '/runtime/shout/report') {
      try {
        const body = await readJsonBody(req);
        const report = await reportShoutboxMessage({
          messageId: String(body.messageId || '').trim(),
          reporter: String(body.reporter || '').trim(),
          reason: String(body.reason || '').trim(),
        });

        sendJson(res, 200, {
          ok: true,
          report,
        });
      } catch (error) {
        sendText(res, 400, error instanceof Error ? error.message : 'Failed to report the shout-out message.');
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
          sendText(res, 400, 'Rotate the operator password before creating production tenants.');
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
          action:
            tenant.invitePurpose === 'password-reset' ? 'tenant.password.reset.accepted' : 'tenant.invite.accepted',
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
        void ensureRuntimeNodeWorkspaceForSession(session);
        sendJson(res, 200, {
          sessionId: requestedSessionId,
          preview: session.preview || null,
          status: session.previewDiagnostics.status,
          healthy: session.previewDiagnostics.healthy,
          updatedAt: session.previewDiagnostics.updatedAt,
          recentLogs: session.previewDiagnostics.recentLogs,
          alert: session.previewDiagnostics.alert,
          recovery: session.previewRecovery,
          runtimeNodeWorkspace: session.runtimeNodeWorkspace || null,
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
        void ensureRuntimeNodeWorkspaceForSession(session);

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
        void ensureRuntimeNodeWorkspaceForSession(session);
        const files = await resolveSessionSnapshotFiles(session);
        sendJson(res, 200, {
          sessionId: requestedSessionId,
          files,
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

    if (req.method === 'POST' && publishMatch) {
      try {
        const requestedSessionId = normalizeSessionId(publishMatch[1]);
        const session = getSession(requestedSessionId);
        const body = await readJsonBody(req);
        const validation = validateProjectSubdomain(body.subdomain || body.projectSubdomain || requestedSessionId);

        if (!validation.ok) {
          sendText(res, 400, validation.reason);
          return;
        }

        void ensureRuntimeNodeWorkspaceForSession(session);

        if (!session.preview?.port) {
          scheduleHostedAutoStartAfterSync(session);
        }

        const registry = await ensureProjectDeploymentRegistry();
        const hostname = buildProjectHostname(validation.subdomain, PROJECT_DOMAIN_ROOT);
        const existingByHost = registry.deployments.find(
          (deployment) => deployment.hostname === hostname && deployment.sessionId !== requestedSessionId,
        );

        if (existingByHost) {
          sendText(res, 409, 'That bolt.gives project subdomain is already in use.');
          return;
        }

        let deployment = registry.deployments.find(
          (entry) => entry.sessionId === requestedSessionId || entry.hostname === hostname,
        );
        const now = new Date().toISOString();
        const dns = await ensureProjectSubdomainDnsRecord(hostname);
        const caddy = await ensureProjectCaddyHost(hostname);

        if (!deployment) {
          deployment = {
            id: crypto.randomUUID(),
            sessionId: requestedSessionId,
            subdomain: validation.subdomain,
            hostname,
            status: 'active',
            previewPort: Number(session.preview?.port || 0) || null,
            customDomains: [],
            dnsStatus: dns.status,
            caddyStatus: caddy.status,
            lastError:
              dns.status === 'active' && caddy.status === 'active' ? null : `${dns.message} ${caddy.message}`.trim(),
            createdAt: now,
            updatedAt: now,
          };
          registry.deployments.unshift(deployment);
        } else {
          deployment.subdomain = validation.subdomain;
          deployment.hostname = hostname;
          deployment.status = 'active';
          deployment.previewPort = Number(session.preview?.port || 0) || deployment.previewPort || null;
          deployment.dnsStatus = dns.status;
          deployment.caddyStatus = caddy.status;
          deployment.lastError =
            dns.status === 'active' && caddy.status === 'active' ? null : `${dns.message} ${caddy.message}`.trim();
          deployment.updatedAt = now;
        }

        appendProjectDeploymentEvent(registry, {
          actor: 'runtime-session',
          action: 'project.publish',
          target: hostname,
          details: {
            sessionId: requestedSessionId,
            dnsStatus: dns.status,
            caddyStatus: caddy.status,
          },
        });
        await writeProjectDeploymentRegistry(registry);

        sendJson(res, 200, {
          ok: true,
          deployment: sanitizeProjectDeploymentForClient(deployment, { serverIp: PROJECT_PUBLIC_IP }),
          runtimeNodeWorkspace: session.runtimeNodeWorkspace || null,
          dns,
          caddy,
        });
      } catch (error) {
        sendText(res, 500, error instanceof Error ? error.message : 'Failed to publish the project.');
      }
      return;
    }

    if (req.method === 'POST' && customDomainCheckoutMatch) {
      try {
        const requestedSessionId = normalizeSessionId(customDomainCheckoutMatch[1]);
        const body = await readJsonBody(req);
        const customDomain = normalizeCustomDomain(body.customDomain || body.domain);

        if (!isLikelyValidCustomDomain(customDomain)) {
          sendText(res, 400, 'Enter a valid custom domain that is not already under bolt.gives.');
          return;
        }

        const registry = await ensureProjectDeploymentRegistry();
        const deployment = registry.deployments.find((entry) => entry.sessionId === requestedSessionId);

        if (!deployment) {
          sendText(res, 404, 'Publish the project to a bolt.gives subdomain before adding a custom domain.');
          return;
        }

        const existingActive = findProjectDeploymentByHost(registry, customDomain);

        if (existingActive && existingActive.id !== deployment.id) {
          sendText(res, 409, 'That custom domain is already attached to another project.');
          return;
        }

        const checkout = await createStripeCustomDomainCheckout({
          deployment,
          customDomain,
          req,
          customerEmail: String(body.customerEmail || '').trim(),
        });
        const now = new Date().toISOString();
        const existingDomain = deployment.customDomains.find((entry) => entry.domain === customDomain);

        if (existingDomain) {
          existingDomain.status = 'pending-payment';
          existingDomain.stripeCheckoutSessionId = checkout.checkoutSessionId;
          existingDomain.updatedAt = now;
        } else {
          deployment.customDomains.push({
            domain: customDomain,
            status: 'pending-payment',
            stripeCheckoutSessionId: checkout.checkoutSessionId,
            createdAt: now,
            updatedAt: now,
          });
        }

        deployment.status = 'pending-domain-payment';
        deployment.updatedAt = now;
        appendProjectDeploymentEvent(registry, {
          actor: 'runtime-session',
          action: 'project.custom-domain.checkout',
          target: customDomain,
          details: {
            sessionId: requestedSessionId,
            subdomain: deployment.subdomain,
          },
        });
        await writeProjectDeploymentRegistry(registry);

        sendJson(res, 200, {
          ok: true,
          checkoutUrl: checkout.checkoutUrl,
          publishableKey: checkout.publishableKey,
          dnsInstructions: buildCustomDomainDnsInstructions(customDomain, PROJECT_PUBLIC_IP),
          deployment: sanitizeProjectDeploymentForClient(deployment, { serverIp: PROJECT_PUBLIC_IP }),
        });
      } catch (error) {
        sendText(res, 500, error instanceof Error ? error.message : 'Failed to start custom-domain checkout.');
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
        void ensureRuntimeNodeWorkspaceForSession(session);
        await runSessionOperation(session, async () => {
          session.publicOrigin = getRequestOrigin(req);
          markSessionMutationStart(session);
          await syncWorkspaceSnapshot(session, incomingFiles, { prune });
          const supportRepair = await repairHostedWorkspaceSupportFilesAfterSync(session);
          if (supportRepair.generatedFiles.length > 0) {
            appendPreviewDiagnosticEntries(
              session,
              'architect',
              `Architect generated missing runtime support files after sync: ${supportRepair.generatedFiles.join(', ')}`,
            );
          }
          if (supportRepair.repairedFiles.length > 0) {
            appendPreviewDiagnosticEntries(
              session,
              'architect',
              `Architect repaired unsafe JSX text entities after sync: ${supportRepair.repairedFiles.join(', ')}`,
            );
          }
          if (supportRepair.previewConfigFiles.length > 0) {
            appendPreviewDiagnosticEntries(
              session,
              'architect',
              `Architect disabled Vite HMR for hosted preview configs after sync: ${supportRepair.previewConfigFiles.join(', ')}`,
            );
          }
          await refreshSessionCurrentFileMapFromDisk(session);
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
        void ensureRuntimeNodeWorkspaceForSession(session);
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

  void maybeHandlePublishedProjectUpgrade(req, socket, head)
    .then((handled) => {
      if (!handled) {
        writeUpgradeError(socket, 404, 'Not Found');
      }
    })
    .catch(() => {
      writeUpgradeError(socket, 500, 'Internal Server Error');
    });
});

function startServer() {
  server.listen(PORT, HOST, async () => {
    console.log(`[runtime] listening on http://${HOST}:${PORT}`);
    console.log(`[runtime] workspace dir: ${PERSIST_ROOT}`);

    const rolloutGuard = await resolveManagedRolloutGuardState({ force: true });

    if (!rolloutGuard.allowed) {
      console.warn(`[runtime] managed rollout guard active: ${rolloutGuard.reason}`);
    }

    void runSerializedManagedInstanceRollout(
      () => rolloutManagedInstancesToCurrentBuild({ reason: 'startup-sync', actor: 'system' }),
      { reason: 'startup-sync' },
    ).catch((error) => {
      console.error('[runtime] managed instance startup sync failed:', error);
    });

    if (!managedInstanceSyncTimer && MANAGED_INSTANCE_SYNC_INTERVAL_MS > 0) {
      managedInstanceSyncTimer = setInterval(() => {
        void runSerializedManagedInstanceRollout(
          () => rolloutManagedInstancesToCurrentBuild({ reason: 'interval-sync', actor: 'system' }),
          { reason: 'interval-sync' },
        ).catch((error) => {
          console.error('[runtime] managed instance interval sync failed:', error);
        });
      }, MANAGED_INSTANCE_SYNC_INTERVAL_MS);
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  startServer();
}
