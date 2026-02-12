import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PluginManager } from './pluginManager';

interface StorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  clear: () => void;
}

function createLocalStorageMock(): StorageLike {
  const store = new Map<string, string>();

  return {
    getItem(key) {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key, value) {
      store.set(key, value);
    },
    removeItem(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };
}

describe('PluginManager', () => {
  const originalFetch = globalThis.fetch;
  let tempDir: string | undefined;

  beforeEach(() => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      writable: true,
      value: {
        localStorage: createLocalStorageMock(),
      },
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    delete (globalThis as any).window;
    globalThis.fetch = originalFetch;

    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it('installs, lists, and uninstalls plugins', () => {
    const installed = PluginManager.install({
      name: 'sample-plugin',
      version: '1.0.0',
      description: 'sample',
      entry: 'https://example.com/plugin.mjs',
    });

    expect(installed).toHaveLength(1);
    expect(PluginManager.listInstalled()).toHaveLength(1);

    const afterUninstall = PluginManager.uninstall('sample-plugin');
    expect(afterUninstall).toHaveLength(0);
  });

  it('validates manifests and rejects invalid plugin payloads', () => {
    expect(() =>
      PluginManager.install({
        name: 'invalid',
        version: '',
        description: 'bad',
        entry: 'https://example.com/plugin.mjs',
      }),
    ).toThrow();
  });

  it('loads installed plugins at runtime', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'bolt-plugin-'));

    const entryPath = path.join(tempDir, 'plugin.mjs');
    await writeFile(
      entryPath,
      'globalThis.__boltPluginLoaded = (globalThis.__boltPluginLoaded || 0) + 1; export default {};',
      'utf8',
    );

    PluginManager.install({
      name: 'runtime-plugin',
      version: '1.0.0',
      description: 'runtime',
      entry: pathToFileURL(entryPath).href,
    });

    await PluginManager.loadInstalledPlugins();

    expect((globalThis as any).__boltPluginLoaded).toBe(1);
  });

  it('rejects malformed marketplace registries', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ plugins: [{ name: 'missing-fields' }] }),
    }) as any;

    await expect(PluginManager.fetchMarketplace('https://example.com/registry.json')).rejects.toThrow(
      'Plugin marketplace manifest is invalid.',
    );
  });
});
