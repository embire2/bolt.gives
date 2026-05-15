import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import {
  checkHealthUrl,
  createWranglerRuntimeEnv,
  getWranglerCliEntrypoint,
  getPagesDevHealthcheckConfig,
  getPagesDevHealthcheckUrl,
  getWranglerPagesDevArgs,
  startPagesDevHealthMonitor,
  stripLeadingArgSeparators,
  waitForExit,
} from './start-pages-dev.mjs';

describe('start pages dev script helpers', () => {
  it('removes only leading package-manager separators', () => {
    expect(stripLeadingArgSeparators(['--', '--ip', '127.0.0.1'])).toEqual(['--ip', '127.0.0.1']);
    expect(stripLeadingArgSeparators(['--', '--', '--port', '8815'])).toEqual(['--port', '8815']);
    expect(stripLeadingArgSeparators(['--inspect', '--port', '8815'])).toEqual(['--inspect', '--port', '8815']);
  });

  it('builds wrangler pages dev args without injecting a proxy command', () => {
    expect(getWranglerPagesDevArgs(['--', '--ip', '127.0.0.1', '--port', '8815'])).toEqual([
      'pages',
      'dev',
      './build/client',
      '--ip',
      '127.0.0.1',
      '--port',
      '8815',
    ]);
  });

  it('points at the local wrangler cli entrypoint', () => {
    expect(getWranglerCliEntrypoint('/repo')).toBe(
      path.join('/repo', 'node_modules', 'wrangler', 'bin', 'wrangler.js'),
    );
  });

  it('builds a localhost healthcheck URL from pages dev args', () => {
    expect(getPagesDevHealthcheckUrl(['--', '--ip', '0.0.0.0', '--port', '8815'], { NODE_ENV: 'test' })).toBe(
      'http://127.0.0.1:8815/api/health',
    );
    expect(
      getPagesDevHealthcheckUrl(['--ip', '127.0.0.1'], {
        NODE_ENV: 'test',
        PORT: '8788',
        BOLT_PAGES_DEV_HEALTHCHECK_PATH: 'healthz',
      }),
    ).toBe('http://127.0.0.1:8788/healthz');
  });

  it('allows the pages dev healthcheck to be disabled', () => {
    expect(getPagesDevHealthcheckConfig([], { NODE_ENV: 'test', BOLT_PAGES_DEV_HEALTHCHECK: '0' }).enabled).toBe(false);
  });

  it('treats non-2xx healthcheck responses as unhealthy', async () => {
    const ok = await checkHealthUrl('http://example.test/health', {
      fetchImpl: async () => new Response(null, { status: 503 }),
    });

    expect(ok).toBe(false);
  });

  it('marks a health-triggered pages dev shutdown before killing the child process', async () => {
    const child = new EventEmitter() as EventEmitter & {
      exitCode: number | null;
      killed: boolean;
      kill: (signal: NodeJS.Signals) => boolean;
    };
    const events: string[] = [];
    const timers: Array<() => void> = [];

    child.exitCode = null;
    child.killed = false;
    child.kill = (signal) => {
      events.push(`kill:${signal}`);
      child.killed = true;
      child.exitCode = 0;
      child.emit('exit', 0, null);

      return true;
    };

    startPagesDevHealthMonitor(
      child,
      {
        enabled: true,
        url: 'http://127.0.0.1:8788/api/health',
        startupGraceMs: 1,
        intervalMs: 15_000,
        timeoutMs: 1,
        failureThreshold: 1,
      },
      {
        checkHealthUrlFn: async () => false,
        setTimeoutFn: ((callback: () => void) => {
          timers.push(callback);

          return { unref() {} } as NodeJS.Timeout;
        }) as any,
        clearTimeoutFn: () => {},
        setIntervalFn: (() => ({ unref() {} }) as NodeJS.Timeout) as any,
        clearIntervalFn: () => {},
        onUnhealthy: () => events.push('unhealthy'),
      },
    );

    timers.shift()?.();
    await Promise.resolve();

    expect(events).toEqual(['unhealthy', 'kill:SIGTERM']);
  });

  it('treats a clean wrangler exit after a health-triggered shutdown as a failure', async () => {
    const child = new EventEmitter() as EventEmitter & {
      once: EventEmitter['once'];
    };
    const exitPromise = waitForExit(child, 'wrangler pages dev', {
      isHealthRestartRequested: (() => true) as any,
    });

    child.emit('exit', 0, null);

    await expect(exitPromise).rejects.toThrow('healthcheck-triggered restart');
  });

  it('redirects wrangler runtime state into a writable home under /tmp', () => {
    const runtimeHome = path.join('/tmp', 'bolt-gives-wrangler-home-spec');
    fs.rmSync(runtimeHome, { recursive: true, force: true });

    const env = createWranglerRuntimeEnv({ ...process.env, BOLT_WRANGLER_HOME: runtimeHome });

    expect(env.HOME).toBe(runtimeHome);
    expect(env.XDG_CONFIG_HOME).toBe(path.join(runtimeHome, '.config'));
    expect(env.XDG_CACHE_HOME).toBe(path.join(runtimeHome, '.cache'));
    expect(fs.existsSync(path.join(runtimeHome, '.config'))).toBe(true);
    expect(fs.existsSync(path.join(runtimeHome, '.cache'))).toBe(true);

    fs.rmSync(runtimeHome, { recursive: true, force: true });
  });
});
