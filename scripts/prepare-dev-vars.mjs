#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

const cwd = process.cwd();
const sourcePath = path.resolve(cwd, process.env.ENV_SOURCE_FILE || '.env.local');
const targetPath = path.resolve(cwd, process.env.DEV_VARS_FILE || '.dev.vars');

function parseEnv(content) {
  const lines = content.split(/\r?\n/);
  const pairs = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separator = trimmed.indexOf('=');

    if (separator === -1) {
      continue;
    }

    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1);

    if (!key) {
      continue;
    }

    pairs.push(`${key}=${value}`);
  }

  return `${pairs.join('\n')}\n`;
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

const sourceExists = await fileExists(sourcePath);

if (!sourceExists) {
  console.log(`prepare-dev-vars: skipped (${path.basename(sourcePath)} not found)`);
  process.exit(0);
}

const source = await fs.readFile(sourcePath, 'utf8');
const rendered = parseEnv(source);
await fs.writeFile(targetPath, rendered, { mode: 0o600 });
await fs.chmod(targetPath, 0o600);

console.log(`prepare-dev-vars: wrote ${path.relative(cwd, targetPath)}`);
