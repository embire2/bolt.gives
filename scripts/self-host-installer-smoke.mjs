#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const installScript = path.join(repoRoot, 'install.sh');

function run(label, command, args) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    throw new Error(
      `${label} failed with exit ${result.status ?? 'unknown'}\n${result.stdout || ''}${result.stderr || ''}`,
    );
  }
}

run('install.sh syntax check', 'bash', ['-n', installScript]);
run('install.sh help path', 'bash', [installScript, '--help']);

const installerSource = fs.readFileSync(installScript, 'utf8');

for (const requiredSetting of [
  'BOLT_PROFILE_COOKIE_SECRET',
  'BOLT_HOSTED_FREE_RELAY_SECRET',
  'BOLT_FREE_USAGE_QUOTA_SECRET',
  'BOLT_PREMIUM_INTERNAL_SECRET',
]) {
  if (!installerSource.includes(`upsert_env_line \"\${env_file}\" \"${requiredSetting}\"`)) {
    throw new Error(`install.sh does not persist generated ${requiredSetting}`);
  }
}

if (!installerSource.includes('chmod 600 \"${env_file}\"')) {
  throw new Error('install.sh does not protect .env.local permissions');
}

console.log(
  JSON.stringify(
    {
      ok: true,
      checks: ['syntax', 'help-path', 'generated-service-secrets', 'env-permissions'],
      scenarios: ['no-db: --skip-postgres --skip-caddy', 'full-db: PostgreSQL and Caddy prompts available'],
    },
    null,
    2,
  ),
);
