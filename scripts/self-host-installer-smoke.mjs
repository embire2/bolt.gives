#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
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

console.log(
  JSON.stringify(
    {
      ok: true,
      checks: ['syntax', 'help-path'],
      scenarios: ['no-db: --skip-postgres --skip-caddy', 'full-db: PostgreSQL and Caddy prompts available'],
    },
    null,
    2,
  ),
);
