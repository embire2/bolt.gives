import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { build } from 'vite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { publicEnvironmentDefines } from '../build-utils/public-environment';
import viteConfiguration from '../vite.config';

const roots: string[] = [];

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe('browser environment allowlist', () => {
  it('allows exact public settings, never secret names or prefix lookalikes', () => {
    expect(
      publicEnvironmentDefines({
        VITE_LOG_LEVEL: 'info',
        OLLAMA_API_BASE_URL: 'http://localhost:11434',
        VITE_GITHUB_ACCESS_TOKEN: 'private-fixture',
        VITE_LOG_LEVEL_SECRET: 'private-fixture',
        OLLAMA_API_BASE_URL_TOKEN: 'private-fixture',
        MAGNET_API_KEY: 'private-fixture',
      }),
    ).toEqual({
      'import.meta.env.VITE_LOG_LEVEL': '"info"',
      'import.meta.env.OLLAMA_API_BASE_URL': '"http://localhost:11434"',
    });
  });

  it.each([
    'https://user:password@example.invalid',
    'https://example.invalid/?api_key=private-fixture',
    'https://example.invalid/#private-fixture',
    'file:///etc/shadow',
    'not-a-url',
  ])('does not expose credentials or invalid public provider URL %s', (url) => {
    expect(publicEnvironmentDefines({ OPENAI_LIKE_API_BASE_URL: url })).toEqual({});
  });

  it('does not embed a seeded VITE token through direct access or the whole import.meta.env object', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'bolt-public-env-'));
    roots.push(root);
    vi.stubEnv('VITE_GITHUB_ACCESS_TOKEN', 'never-embed-this-fixture-token');
    vi.stubEnv('VITE_LOG_LEVEL_SECRET', 'never-embed-this-prefix-secret');

    const configuration =
      typeof viteConfiguration === 'function'
        ? await viteConfiguration({ mode: 'test', command: 'build' })
        : await viteConfiguration;
    expect(configuration.envPrefix).toEqual([]);
    await fs.writeFile(
      path.join(root, 'fixture.js'),
      'globalThis.publicEnv = import.meta.env; globalThis.secret = import.meta.env.VITE_GITHUB_ACCESS_TOKEN;',
    );

    const result = await build({
      configFile: false,
      root,
      logLevel: 'silent',
      envPrefix: configuration.envPrefix,
      define: publicEnvironmentDefines({ VITE_LOG_LEVEL: 'info' }),
      build: { write: false, minify: false, rollupOptions: { input: path.join(root, 'fixture.js') } },
    });

    if (Array.isArray(result) || !('output' in result)) {
      throw new Error('Expected one browser build');
    }

    const chunks = result.output.map((entry) => ('code' in entry ? entry.code : '')).join('\n');
    expect(chunks).toContain('VITE_LOG_LEVEL');
    expect(chunks).not.toContain('never-embed-this-fixture-token');
    expect(chunks).not.toContain('never-embed-this-prefix-secret');
  });
});
