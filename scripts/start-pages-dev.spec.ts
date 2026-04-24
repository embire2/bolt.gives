import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createWranglerRuntimeEnv,
  getWranglerCliEntrypoint,
  getWranglerPagesDevArgs,
  stripLeadingArgSeparators,
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
    expect(getWranglerCliEntrypoint('/repo')).toBe(path.join('/repo', 'node_modules', 'wrangler', 'bin', 'wrangler.js'));
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
