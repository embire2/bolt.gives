#!/usr/bin/env node
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');

export function stripLeadingArgSeparators(args) {
  const normalizedArgs = [...args];

  while (normalizedArgs[0] === '--') {
    normalizedArgs.shift();
  }

  return normalizedArgs;
}

export function getWranglerPagesDevArgs(args = []) {
  return ['pages', 'dev', './build/client', ...stripLeadingArgSeparators(args)];
}

export function getWranglerCliEntrypoint(rootDir = repoRoot) {
  return path.join(rootDir, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
}

export function createWranglerRuntimeEnv(baseEnv = process.env) {
  const env = { ...baseEnv };
  const runtimeHome = env.BOLT_WRANGLER_HOME || path.join('/tmp', 'bolt-gives-wrangler-home');
  const configHome = env.XDG_CONFIG_HOME || path.join(runtimeHome, '.config');
  const cacheHome = env.XDG_CACHE_HOME || path.join(runtimeHome, '.cache');
  const dataHome = env.XDG_DATA_HOME || path.join(runtimeHome, '.local', 'share');

  for (const dirPath of [runtimeHome, configHome, cacheHome, dataHome]) {
    fs.mkdirSync(dirPath, { recursive: true });
  }

  env.HOME = runtimeHome;
  env.XDG_CONFIG_HOME = configHome;
  env.XDG_CACHE_HOME = cacheHome;
  env.XDG_DATA_HOME = dataHome;

  return env;
}

function waitForExit(child, label) {
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      const failure = signal ? `${label} exited via signal ${signal}` : `${label} exited with code ${code ?? 1}`;
      reject(new Error(failure));
    });
  });
}

async function runNodeCommand(entrypoint, args = []) {
  const child = spawn(process.execPath, [entrypoint, ...args], {
    cwd: repoRoot,
    env: createWranglerRuntimeEnv(process.env),
    stdio: 'inherit',
  });

  await waitForExit(child, path.relative(repoRoot, entrypoint));
}

export async function main(args = process.argv.slice(2)) {
  await runNodeCommand(path.join(scriptDir, 'prepare-dev-vars.mjs'));
  const wranglerEntrypoint = getWranglerCliEntrypoint();
  const child = spawn(process.execPath, [wranglerEntrypoint, ...getWranglerPagesDevArgs(args)], {
    cwd: repoRoot,
    env: createWranglerRuntimeEnv(process.env),
    stdio: 'inherit',
  });

  await waitForExit(child, 'wrangler pages dev');
}

const invokedAsScript = typeof process.argv[1] === 'string' && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedAsScript) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
