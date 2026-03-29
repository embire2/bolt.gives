#!/usr/bin/env node
import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { shouldTreatInstallFailureAsFatal } from './install-playwright-utils.mjs';

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

if (!existsSync(cliPath)) {
  console.warn('[playwright-install] Playwright CLI not found; skipping Chromium install');
  process.exit(0);
}

console.log('[playwright-install] installing Chromium browser...');

const result = spawnSync(process.execPath, [cliPath, 'install', 'chromium'], {
  cwd: ROOT,
  stdio: 'inherit',
  env: process.env,
});

if (result.status !== 0) {
  const message = '[playwright-install] failed to install Chromium browser';

  if (shouldTreatInstallFailureAsFatal(process.env)) {
    console.error(`${message} (fatal because PLAYWRIGHT_INSTALL_REQUIRED=1)`);
    process.exit(result.status || 1);
  }

  console.warn(`${message}; continuing without bundled browser`);
  process.exit(0);
}

try {
  writeFileSync(markerFile, `${new Date().toISOString()}\n`, 'utf8');
} catch (error) {
  console.warn('[playwright-install] Chromium installed but marker file could not be written', error);
}

console.log('[playwright-install] Chromium installation complete');
