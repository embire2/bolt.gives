#!/usr/bin/env node

import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const outputDir = path.join(repoRoot, 'build', 'pages-worker');
const outputConfigPath = path.join(outputDir, 'config.json');
const workerPath = path.join(outputDir, 'index.js');
const wranglerEntrypoint = path.join(repoRoot, 'node_modules', 'wrangler', 'bin', 'wrangler.js');

export async function buildPagesWorker({ execFileFn = execFileAsync } = {}) {
  await fs.rm(outputDir, { recursive: true, force: true });
  await fs.mkdir(outputDir, { recursive: true });

  try {
    await execFileFn(
      process.execPath,
      [
        wranglerEntrypoint,
        'pages',
        'functions',
        'build',
        'functions',
        '--outdir',
        outputDir,
        '--output-config-path',
        outputConfigPath,
        '--compatibility-date',
        '2025-03-28',
        '--compatibility-flag',
        'nodejs_compat',
        '--minify',
      ],
      {
        cwd: repoRoot,
        env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
        maxBuffer: 64 * 1024 * 1024,
      },
    );
  } catch (error) {
    const details = [error?.stdout, error?.stderr].filter(Boolean).join('\n').trim();
    throw new Error(`Pages worker precompile failed.${details ? `\n${details}` : ''}`);
  }

  const workerStat = await fs.stat(workerPath);
  await fs.access(outputConfigPath);
  console.log(`[build-pages-worker] wrote ${path.relative(repoRoot, workerPath)} (${workerStat.size} bytes)`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  buildPagesWorker().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
