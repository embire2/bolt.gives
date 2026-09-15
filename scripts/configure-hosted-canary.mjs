#!/usr/bin/env node
// Staging-only configuration. Never modifies the main branch or refreshes existing instances.
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { parse } from 'dotenv';

if (process.getuid() !== 0 || !process.argv.includes('--apply')) {
  throw new Error('Usage (root): configure-hosted-canary.mjs --apply after pushing the validation branch.');
}

const branch = execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim();
const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();

if (!branch.startsWith('fix/') || !/^[a-f0-9]{40}$/.test(sha)) {
  throw new Error('An explicit validation branch is required.');
}

const remote = execFileSync('git', ['ls-remote', 'origin', `refs/heads/${branch}`], { encoding: 'utf8' });

if (remote.split(/\s/)[0] !== sha) {
  throw new Error('Push the exact validation commit before configuring its canary.');
}

const filename = '/etc/bolt-gives/alpha-isolated.env';
const env = parse(await fs.readFile(filename, 'utf8'));
Object.assign(env, {
  RUNTIME_MANAGED_INSTANCE_SOURCE_BRANCH: branch,
  RUNTIME_MANAGED_INSTANCE_SYNC_INTERVAL_MS: '0',
  RUNTIME_MANAGED_INSTANCE_ENABLED: 'true',
  BOLT_RELEASE_SHA: sha,
  BOLT_MANAGED_INSTANCE_HOSTED_FREE_RELAY_ORIGIN: 'https://alpha1.bolt.gives',
  BOLT_MANAGED_INSTANCE_RUNTIME_CONTROL_PUBLIC_URL: 'https://alpha1.bolt.gives/runtime',
});

const temporary = `${filename}.${crypto.randomUUID()}.tmp`;
await fs.writeFile(
  temporary,
  `${Object.entries(env)
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join('\n')}\n`,
  { mode: 0o600 },
);
await fs.rename(temporary, filename);
console.log(JSON.stringify({ target: 'alpha', branch, sha, automaticFleetRefresh: false }));
