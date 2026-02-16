#!/usr/bin/env node
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const markerFile = path.join(ROOT, '.playwright-installed');

const skip = process.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD === '1';

if (skip) {
  console.log('[playwright-install] skipped (PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1)');
  process.exit(0);
}

if (existsSync(markerFile)) {
  console.log('[playwright-install] browsers already installed (marker found)');
  process.exit(0);
}

const cliPath = path.join(ROOT, 'node_modules', 'playwright', 'cli.js');

console.log('[playwright-install] installing Chromium browser...');

const result = spawnSync(process.execPath, [cliPath, 'install', 'chromium'], {
  cwd: ROOT,
  stdio: 'inherit',
  env: process.env,
});

if (result.status !== 0) {
  console.error('[playwright-install] failed to install Chromium browser');
  process.exit(result.status || 1);
}

spawnSync(process.execPath, ['-e', `require('fs').writeFileSync('${markerFile}', '${new Date().toISOString()}\\n')`], {
  cwd: ROOT,
  stdio: 'ignore',
  env: process.env,
});

console.log('[playwright-install] Chromium installation complete');
