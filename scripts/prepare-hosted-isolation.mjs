#!/usr/bin/env node
// Explicit operator migration: copies only; never edits the original deployment or customer records.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parse } from 'dotenv';
import {
  assertFreshMigrationTargets,
  assertMigrationServicesStopped,
} from '@bolt/runtime/server/isolation-migration.mjs';

const run = promisify(execFile);
const target = process.argv[2];

if (!['alpha', 'production'].includes(target) || !process.argv.includes('--apply') || process.getuid() !== 0) {
  throw new Error(
    'Usage (root): prepare-hosted-isolation.mjs alpha|production --apply. Stop the target runtime before the final copy.',
  );
}

const prefix = target === 'alpha' ? 'bolt-gives-alpha' : 'bolt-gives';
const oldRoot = `/srv/${prefix}-runtime-workspaces`;
const root = `/srv/${prefix}-isolated-workspaces`;
const checkout = `/srv/${prefix}-isolated`;
const controlRoot = `/srv/${prefix}-isolated-control-plane`;
const envFile = `/etc/bolt-gives/${target}-isolated.env`;
await assertFreshMigrationTargets({
  source: oldRoot,
  destinations: [checkout, root, controlRoot],
  environmentFile: envFile,
});

const serviceStates = [];

for (const service of [`${prefix}-app.service`, `${prefix}-runtime.service`]) {
  const result = await run('systemctl', ['show', service, '--property=LoadState,ActiveState']);
  const properties = Object.fromEntries(
    result.stdout
      .trim()
      .split('\n')
      .map((line) => line.split('=')),
  );
  serviceStates.push({ loadState: properties.LoadState, activeState: properties.ActiveState });
}

assertMigrationServicesStopped(serviceStates);

const shared = parse(await fs.readFile('/etc/bolt-gives/runtime.env', 'utf8'));
const env = { ...shared, ...(target === 'alpha' ? parse(await fs.readFile('/etc/bolt-gives/alpha.env', 'utf8')) : {}) };
const uid = Number((await run('id', ['-u', 'bolt-runtime-agent'])).stdout.trim());
const gid = Number((await run('id', ['-g', 'bolt-runtime-agent'])).stdout.trim());

if (!uid || !gid) {
  throw new Error('A non-root runtime agent is required.');
}

for (const destination of [checkout, root, controlRoot]) {
  await fs.mkdir(destination, { recursive: true, mode: 0o700 });
  await fs.chown(destination, uid, gid);
}

const rsync = async (source, destination, extra = []) =>
  run('rsync', ['-a', `--chown=${uid}:${gid}`, ...extra, `${source}/`, `${destination}/`], { maxBuffer: 1024 * 1024 });
await rsync(process.cwd(), checkout, [
  '--exclude=.git',
  '--exclude=.env*',
  '--exclude=.dev.vars*',
  '--exclude=output',
  '--exclude=test-results',
  '--exclude=.codex',
  '--exclude=CLAUDE.md',
  '--exclude=caddy',
  '--exclude=replit.png',
  '--exclude=.wrangler',
]);
await rsync(oldRoot, root);

// Verify copied bytes, not only timestamps, before any service is repointed.
const verification = await run('rsync', ['-nrcl', '--out-format=%n', `${oldRoot}/`, `${root}/`], {
  maxBuffer: 1024 * 1024,
});

if (verification.stdout.trim()) {
  throw new Error('Workspace checksum verification failed; originals remain unchanged.');
}

const databaseRoot = env.BOLT_PROJECT_DATABASE_SECRET_ROOT || `${oldRoot}/project-databases`;
const destinationDatabaseRoot = `${root}/project-databases`;
await fs.mkdir(destinationDatabaseRoot, { recursive: true, mode: 0o700 });
await fs.chown(destinationDatabaseRoot, uid, gid);

if (
  await fs
    .stat(databaseRoot)
    .then(() => true)
    .catch(() => false)
) {
  await rsync(databaseRoot, destinationDatabaseRoot);
}

for (const [key, value] of Object.entries(env)) {
  if (value.startsWith(`${oldRoot}/`)) {
    env[key] = `${root}${value.slice(oldRoot.length)}`;
  }
}

const keyPath = `${controlRoot}/runtime-node-agent`;

if (env.BOLT_RUNTIME_NODE_SSH_KEY_PATH) {
  await fs.copyFile(env.BOLT_RUNTIME_NODE_SSH_KEY_PATH, keyPath);
  await fs.chmod(keyPath, 0o600);
  await fs.chown(keyPath, uid, gid);
  env.BOLT_RUNTIME_NODE_SSH_KEY_PATH = keyPath;
}

const existing = await fs
  .readFile(envFile, 'utf8')
  .then(parse)
  .catch(() => ({}));
const settingsPath = `${controlRoot}/runtime-settings.env`;
const previousSettings = env.BOLT_RUNTIME_ENV_FILE ? await fs.readFile(env.BOLT_RUNTIME_ENV_FILE, 'utf8') : '';
await fs.writeFile(settingsPath, previousSettings, { mode: 0o600, flag: 'wx' });
await fs.chown(settingsPath, uid, gid);
Object.assign(env, {
  BOLT_RUNTIME_ENV_FILE: settingsPath,
  RUNTIME_WORKSPACE_DIR: root,
  BOLT_PROJECT_DATABASE_SECRET_ROOT: destinationDatabaseRoot,
  BOLT_PROJECT_DATABASE_ENABLED: 'false',
  BOLT_PROJECT_DATABASE_CONTAINER_HOST: '10.203.0.1',
  BOLT_PROJECT_CADDY_SNIPPET_DIR: '/etc/caddy/bolt-gives-isolated-projects',
  BOLT_PROJECT_CADDY_RELOAD_SERVICE: 'bolt-gives-caddy-reload.service',
  BOLT_PROJECT_EXECUTION_MODE: 'podman',
  BOLT_PROJECT_RUNNER_UID: String(uid),
  BOLT_PROJECT_RUNNER_GID: String(gid),
  BOLT_PROJECT_RUNNER_HOME: '/srv/bolt-runtime-agent',
  BOLT_PROJECT_CONTAINER_IMAGE: 'sha256:c3fc50f1eeb1d4739f1598353d123815562beb73e418fc712dd2436bd5bbe77d',
  BOLT_PREVIEW_ORIGIN_TEMPLATE: `https://{id}.${target === 'alpha' ? 'alpha-preview' : 'preview'}.instances.bolt.gives`,
  BOLT_PREVIEW_SIGNING_SECRET: existing.BOLT_PREVIEW_SIGNING_SECRET || crypto.randomBytes(48).toString('base64url'),
  BOLT_UPDATE_DISABLED: 'true',
});

const temporary = `${envFile}.${crypto.randomUUID()}.tmp`;
await fs.writeFile(
  temporary,
  `${Object.entries(env)
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join('\n')}\n`,
  { mode: 0o600 },
);
await fs.rename(temporary, envFile);
console.log(
  JSON.stringify({
    target,
    checkout,
    workspaces: root,
    checksums: 'verified',
    environment: envFile,
    servicesChanged: false,
    originalsChanged: false,
  }),
);
