#!/usr/bin/env node
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const DEFAULT_HEALTHCHECK_PATH = '/api/health';

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

function getArgValue(args, flagName) {
  const index = args.indexOf(flagName);

  if (index === -1) {
    return undefined;
  }

  return args[index + 1];
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value ?? '', 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeHealthcheckPath(value = DEFAULT_HEALTHCHECK_PATH) {
  return value.startsWith('/') ? value : `/${value}`;
}

export function getPagesDevHealthcheckUrl(args = [], env = process.env) {
  if (env.BOLT_PAGES_DEV_HEALTHCHECK_URL) {
    return env.BOLT_PAGES_DEV_HEALTHCHECK_URL;
  }

  const normalizedArgs = stripLeadingArgSeparators(args);
  const port = getArgValue(normalizedArgs, '--port') || env.PORT || '8788';
  const ip = getArgValue(normalizedArgs, '--ip') || '127.0.0.1';
  const host = ip === '0.0.0.0' || ip === '::' ? '127.0.0.1' : ip;
  const healthcheckPath = normalizeHealthcheckPath(env.BOLT_PAGES_DEV_HEALTHCHECK_PATH || DEFAULT_HEALTHCHECK_PATH);

  return `http://${host}:${port}${healthcheckPath}`;
}

export function getPagesDevHealthcheckConfig(args = [], env = process.env) {
  return {
    enabled: env.BOLT_PAGES_DEV_HEALTHCHECK !== '0',
    url: getPagesDevHealthcheckUrl(args, env),
    startupGraceMs: parsePositiveInteger(env.BOLT_PAGES_DEV_HEALTHCHECK_STARTUP_GRACE_MS, 90_000),
    intervalMs: parsePositiveInteger(env.BOLT_PAGES_DEV_HEALTHCHECK_INTERVAL_MS, 15_000),
    timeoutMs: parsePositiveInteger(env.BOLT_PAGES_DEV_HEALTHCHECK_TIMEOUT_MS, 5_000),
    failureThreshold: parsePositiveInteger(env.BOLT_PAGES_DEV_HEALTHCHECK_FAILURE_THRESHOLD, 3),
  };
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

export async function checkHealthUrl(url, { timeoutMs = 5_000, fetchImpl = fetch } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, {
      method: 'HEAD',
      cache: 'no-store',
      signal: controller.signal,
    });

    return response.status >= 200 && response.status < 400;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

export function startPagesDevHealthMonitor(
  child,
  config,
  {
    setTimeoutFn = setTimeout,
    clearTimeoutFn = clearTimeout,
    setIntervalFn = setInterval,
    clearIntervalFn = clearInterval,
  } = {},
) {
  if (!config.enabled) {
    return () => {};
  }

  let stopped = false;
  let interval;
  let consecutiveFailures = 0;

  const stop = () => {
    stopped = true;

    if (interval) {
      clearIntervalFn(interval);
    }
  };

  const check = async () => {
    if (stopped || child.exitCode !== null || child.killed) {
      stop();
      return;
    }

    const healthy = await checkHealthUrl(config.url, { timeoutMs: config.timeoutMs });

    if (healthy) {
      consecutiveFailures = 0;
      return;
    }

    consecutiveFailures += 1;
    console.error(
      `[pages-dev-health] ${config.url} failed ${consecutiveFailures}/${config.failureThreshold} consecutive checks`,
    );

    if (consecutiveFailures >= config.failureThreshold) {
      console.error('[pages-dev-health] killing wrangler pages dev so systemd can restart the app service');
      child.kill('SIGTERM');

      const killTimer = setTimeoutFn(() => {
        if (child.exitCode === null && !child.killed) {
          child.kill('SIGKILL');
        }
      }, 5_000);

      killTimer.unref?.();
      stop();
    }
  };

  const startupTimer = setTimeoutFn(() => {
    void check();
    interval = setIntervalFn(() => void check(), config.intervalMs);
    interval.unref?.();
  }, config.startupGraceMs);

  startupTimer.unref?.();
  child.once('exit', stop);

  return () => {
    clearTimeoutFn(startupTimer);
    stop();
  };
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

  startPagesDevHealthMonitor(child, getPagesDevHealthcheckConfig(args));

  await waitForExit(child, 'wrangler pages dev');
}

const invokedAsScript = typeof process.argv[1] === 'string' && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedAsScript) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
