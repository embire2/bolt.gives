#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { readMergedRuntimeEnv } from './runtime-env-file.mjs';

const DEFAULT_PROJECTS = ['bolt-gives'];
const DEFAULT_RELAY_ORIGIN = 'https://bolt.gives';
const DEFAULT_RUNTIME_CONTROL_URL = 'https://bolt.gives/runtime';
const DEFAULT_REGISTRY_PATH = '/srv/bolt-gives-runtime-workspaces/managed-instance-registry.json';
const HOSTED_FREE_RELAY_SECRET_NAME = 'BOLT_HOSTED_FREE_RELAY_SECRET';
const FREE_USAGE_QUOTA_SECRET_NAME = 'BOLT_FREE_USAGE_QUOTA_SECRET';
const STAGES = ['preview', 'production'];

function normalizeListValue(value) {
  return String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function normalizeHttpUrl(value) {
  const raw = String(value || '').trim();

  if (!raw) {
    return '';
  }

  try {
    const parsed = new URL(raw);

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return '';
    }

    parsed.hash = '';
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return '';
  }
}

export function parseCloudflareFreeProviderConfigArgs(argv = process.argv.slice(2)) {
  const options = {
    dryRun: false,
    includeManaged: false,
    projects: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--') {
      continue;
    }

    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }

    if (arg === '--include-managed') {
      options.includeManaged = true;
      continue;
    }

    if (arg === '--project') {
      const value = argv[index + 1];
      index += 1;
      options.projects.push(...normalizeListValue(value));
      continue;
    }

    if (arg?.startsWith('--project=')) {
      options.projects.push(...normalizeListValue(arg.slice('--project='.length)));
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

export function buildHostedFreeRelayPlainEnv(options = {}) {
  const hostedFreeRelayOrigin = normalizeHttpUrl(options.hostedFreeRelayOrigin) || DEFAULT_RELAY_ORIGIN;
  const runtimeControlPublicUrl =
    normalizeHttpUrl(options.runtimeControlPublicUrl) ||
    normalizeHttpUrl(`${hostedFreeRelayOrigin}/runtime`) ||
    DEFAULT_RUNTIME_CONTROL_URL;

  return {
    BOLT_HOSTED_FREE_RELAY_ORIGIN: hostedFreeRelayOrigin,
    BOLT_RUNTIME_CONTROL_PUBLIC_URL: runtimeControlPublicUrl,
  };
}

export function mergePagesDeploymentConfigs(existingDeploymentConfigs = {}, plainEnv = {}) {
  const nextDeploymentConfigs = {
    ...(existingDeploymentConfigs || {}),
  };

  for (const stage of STAGES) {
    const existingStage = existingDeploymentConfigs?.[stage] || {};
    const existingEnvVars = existingStage.env_vars || {};
    const nextEnvVars = {
      ...existingEnvVars,
    };

    for (const [key, value] of Object.entries(plainEnv)) {
      const normalizedValue = String(value || '').trim();

      if (!normalizedValue) {
        continue;
      }

      nextEnvVars[key] = {
        type: 'plain_text',
        value: normalizedValue,
      };
    }

    nextDeploymentConfigs[stage] = {
      ...existingStage,
      env_vars: Object.keys(nextEnvVars).length > 0 ? nextEnvVars : null,
    };
  }

  return nextDeploymentConfigs;
}

export function resolveTargetProjects(options = {}) {
  const explicitProjects = [
    ...normalizeListValue(options.projects?.join?.(',') || ''),
    ...normalizeListValue(options.env?.CLOUDFLARE_FREE_PROVIDER_PROJECTS),
  ];
  const configuredProjects = explicitProjects.length > 0 ? explicitProjects : DEFAULT_PROJECTS;
  const managedProjects = options.includeManaged
    ? (options.registry?.instances || [])
        .filter((instance) => instance?.status === 'active')
        .map((instance) => String(instance?.projectName || '').trim())
    : [];

  return unique([...configuredProjects, ...managedProjects]);
}

export async function readManagedInstanceRegistry(env = process.env) {
  const registryPath = String(env.RUNTIME_MANAGED_INSTANCE_REGISTRY_PATH || DEFAULT_REGISTRY_PATH).trim();

  try {
    const source = await fs.readFile(registryPath, 'utf8');
    return {
      path: registryPath,
      registry: JSON.parse(source),
    };
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return {
        path: registryPath,
        registry: { instances: [] },
      };
    }

    throw error;
  }
}

function sanitizeConfigSummary(config = {}) {
  const summary = {};

  for (const stage of STAGES) {
    const envVars = config?.[stage]?.env_vars || {};
    summary[stage] = Object.fromEntries(
      Object.keys(envVars)
        .sort()
        .map((key) => [key, /SECRET|TOKEN|KEY|PASSWORD/i.test(key) ? 'set' : envVars[key]?.value || 'set']),
    );
  }

  return summary;
}

async function fetchCloudflarePagesProject({ accountId, apiToken, projectName }) {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/pages/projects/${encodeURIComponent(projectName)}`,
    {
      headers: {
        Authorization: `Bearer ${apiToken}`,
      },
    },
  );
  const payload = await response.json().catch(() => null);

  if (!response.ok || payload?.success === false) {
    const apiError = Array.isArray(payload?.errors) && payload.errors[0]?.message ? payload.errors[0].message : null;
    throw new Error(apiError || `Cloudflare project lookup failed for ${projectName} with status ${response.status}.`);
  }

  return payload?.result || null;
}

async function patchCloudflarePagesProjectEnv({ accountId, apiToken, projectName, deploymentConfigs }) {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/pages/projects/${encodeURIComponent(projectName)}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        deployment_configs: deploymentConfigs,
      }),
    },
  );
  const payload = await response.json().catch(() => null);

  if (!response.ok || payload?.success === false) {
    const apiError = Array.isArray(payload?.errors) && payload.errors[0]?.message ? payload.errors[0].message : null;
    throw new Error(
      apiError || `Cloudflare project env patch failed for ${projectName} with status ${response.status}.`,
    );
  }

  return payload?.result || null;
}

function runWrangler(args, { env, input } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('pnpm', ['exec', 'wrangler', ...args], {
      cwd: path.resolve(new URL('..', import.meta.url).pathname),
      env: {
        ...process.env,
        CLOUDFLARE_API_TOKEN: env.CLOUDFLARE_API_TOKEN,
        CLOUDFLARE_ACCOUNT_ID: env.CLOUDFLARE_ACCOUNT_ID,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(new Error(stderr.trim() || stdout.trim() || `wrangler ${args.join(' ')} failed with exit code ${code}`));
    });

    child.stdin.end(input || '');
  });
}

async function upsertPagesSecret({ projectName, secretName, secretValue, env, dryRun }) {
  if (dryRun) {
    return {
      projectName,
      secretName,
      skipped: true,
    };
  }

  await runWrangler(['pages', 'secret', 'put', secretName, '--project-name', projectName], {
    env,
    input: secretValue,
  });

  return {
    projectName,
    secretName,
    skipped: false,
  };
}

export function buildFreeProviderSecretValues(env = {}) {
  const hostedFreeRelaySecret = String(env.BOLT_HOSTED_FREE_RELAY_SECRET || '').trim();
  const freeUsageQuotaSecret = String(
    env.BOLT_FREE_USAGE_QUOTA_SECRET || env.FREE_USAGE_QUOTA_SECRET || hostedFreeRelaySecret,
  ).trim();

  return {
    [HOSTED_FREE_RELAY_SECRET_NAME]: hostedFreeRelaySecret,
    [FREE_USAGE_QUOTA_SECRET_NAME]: freeUsageQuotaSecret,
  };
}

export async function syncFreeProviderConfigForProject({ projectName, env, plainEnv, dryRun = false }) {
  const project = await fetchCloudflarePagesProject({
    accountId: env.CLOUDFLARE_ACCOUNT_ID,
    apiToken: env.CLOUDFLARE_API_TOKEN,
    projectName,
  });
  const nextDeploymentConfigs = mergePagesDeploymentConfigs(project?.deployment_configs || {}, plainEnv);
  const secretValues = buildFreeProviderSecretValues(env);
  const secretNames = Object.keys(secretValues).sort();

  for (const [secretName, secretValue] of Object.entries(secretValues)) {
    await upsertPagesSecret({
      projectName,
      secretName,
      secretValue,
      env,
      dryRun,
    });
  }

  if (!dryRun) {
    await patchCloudflarePagesProjectEnv({
      accountId: env.CLOUDFLARE_ACCOUNT_ID,
      apiToken: env.CLOUDFLARE_API_TOKEN,
      projectName,
      deploymentConfigs: nextDeploymentConfigs,
    });
  }

  return {
    projectName,
    secretName: HOSTED_FREE_RELAY_SECRET_NAME,
    secretNames,
    dryRun,
    plainEnvKeys: Object.keys(plainEnv).sort(),
    deploymentConfigSummary: sanitizeConfigSummary(nextDeploymentConfigs),
  };
}

function assertRequiredEnv(env) {
  const missing = [];

  for (const key of ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID', 'BOLT_HOSTED_FREE_RELAY_SECRET']) {
    if (!String(env[key] || '').trim()) {
      missing.push(key);
    }
  }

  if (!String(env.BOLT_FREE_USAGE_QUOTA_SECRET || env.FREE_USAGE_QUOTA_SECRET || env.BOLT_HOSTED_FREE_RELAY_SECRET).trim()) {
    missing.push('BOLT_FREE_USAGE_QUOTA_SECRET');
  }

  if (!String(env.FREE_OPENROUTER_API_KEY || '').trim()) {
    missing.push('FREE_OPENROUTER_API_KEY');
  }

  if (missing.length > 0) {
    throw new Error(`Missing required server-side env for FREE provider sync: ${missing.join(', ')}`);
  }
}

function printHelp() {
  console.log(`Usage: node scripts/cloudflare-free-provider-config.mjs [--project bolt-gives] [--include-managed] [--dry-run]

Sync Cloudflare Pages projects for the hosted FREE provider without exposing the upstream OpenRouter key.

Required server env:
  CLOUDFLARE_API_TOKEN
  CLOUDFLARE_ACCOUNT_ID
  FREE_OPENROUTER_API_KEY
  BOLT_HOSTED_FREE_RELAY_SECRET
  BOLT_FREE_USAGE_QUOTA_SECRET (or FREE_USAGE_QUOTA_SECRET; falls back to relay secret)

Optional env:
  BOLT_HOSTED_FREE_RELAY_ORIGIN      default: ${DEFAULT_RELAY_ORIGIN}
  BOLT_RUNTIME_CONTROL_PUBLIC_URL    default: ${DEFAULT_RUNTIME_CONTROL_URL}
  CLOUDFLARE_FREE_PROVIDER_PROJECTS  comma-separated project names
`);
}

async function main() {
  const options = parseCloudflareFreeProviderConfigArgs();

  if (options.help) {
    printHelp();
    return;
  }

  const env = readMergedRuntimeEnv();
  assertRequiredEnv(env);

  const { registry } = await readManagedInstanceRegistry(env);
  const projects = resolveTargetProjects({
    projects: options.projects,
    includeManaged: options.includeManaged,
    registry,
    env,
  });
  const plainEnv = buildHostedFreeRelayPlainEnv({
    hostedFreeRelayOrigin: env.BOLT_HOSTED_FREE_RELAY_ORIGIN,
    runtimeControlPublicUrl: env.BOLT_RUNTIME_CONTROL_PUBLIC_URL,
  });

  if (projects.length === 0) {
    throw new Error('No Cloudflare Pages projects were selected for FREE provider sync.');
  }

  const results = [];

  for (const projectName of projects) {
    console.log(`[free-provider-sync] syncing ${projectName}`);
    results.push(
      await syncFreeProviderConfigForProject({
        projectName,
        env,
        plainEnv,
        dryRun: options.dryRun,
      }),
    );
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        dryRun: options.dryRun,
        projectCount: results.length,
        projects: results,
      },
      null,
      2,
    ),
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
