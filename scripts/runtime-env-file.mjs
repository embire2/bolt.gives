#!/usr/bin/env node

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';

const DEFAULT_RUNTIME_ENV_FILE = '/etc/bolt-gives/runtime.env';
const ENV_KEY_PATTERN = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/;

export function getRuntimeEnvFilePath(env = /** @type {Record<string, string | undefined>} */ (process.env)) {
  return String(env?.BOLT_RUNTIME_ENV_FILE || DEFAULT_RUNTIME_ENV_FILE).trim() || DEFAULT_RUNTIME_ENV_FILE;
}

export function parseRuntimeEnvSource(source = '') {
  return dotenv.parse(source || '');
}

export function readRuntimeEnvFileSync(env = /** @type {Record<string, string | undefined>} */ (process.env)) {
  const filePath = getRuntimeEnvFilePath(env);

  try {
    const source = fs.readFileSync(filePath, 'utf8');
    return {
      path: filePath,
      source,
      values: parseRuntimeEnvSource(source),
      exists: true,
    };
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return {
        path: filePath,
        source: '',
        values: {},
        exists: false,
      };
    }

    throw error;
  }
}

export function readMergedRuntimeEnv(env = /** @type {Record<string, string | undefined>} */ (process.env)) {
  const fileEnv = readRuntimeEnvFileSync(env).values;
  return {
    ...env,
    ...fileEnv,
  };
}

function formatEnvValue(value) {
  return JSON.stringify(String(value));
}

export async function updateRuntimeEnvFile(
  updates = {},
  env = /** @type {Record<string, string | undefined>} */ (process.env),
) {
  const snapshot = readRuntimeEnvFileSync(env);
  const filePath = snapshot.path;
  const directory = path.dirname(filePath);
  const lines = snapshot.source.length > 0 ? snapshot.source.split(/\r?\n/) : [];
  const nextLines = [];
  const appliedKeys = new Set();

  for (const line of lines) {
    const match = line.match(ENV_KEY_PATTERN);

    if (!match) {
      nextLines.push(line);
      continue;
    }

    const key = match[1];

    if (!(key in updates)) {
      nextLines.push(line);
      continue;
    }

    if (appliedKeys.has(key)) {
      continue;
    }

    appliedKeys.add(key);
    const nextValue = updates[key];

    if (nextValue === null || nextValue === undefined || String(nextValue).trim() === '') {
      continue;
    }

    nextLines.push(`${key}=${formatEnvValue(nextValue)}`);
  }

  for (const [key, value] of Object.entries(updates)) {
    if (appliedKeys.has(key)) {
      continue;
    }

    if (value === null || value === undefined || String(value).trim() === '') {
      continue;
    }

    nextLines.push(`${key}=${formatEnvValue(value)}`);
  }

  const nextSource = `${nextLines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd()}\n`;
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;

  await fsp.mkdir(directory, { recursive: true });
  await fsp.writeFile(tempPath, nextSource, { mode: 0o600 });
  await fsp.rename(tempPath, filePath);
  await fsp.chmod(filePath, 0o600).catch(() => {});

  return readRuntimeEnvFileSync({
    ...env,
    BOLT_RUNTIME_ENV_FILE: filePath,
  });
}
