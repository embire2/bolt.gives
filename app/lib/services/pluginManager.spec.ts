import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PluginManager, normalizeTrustedPluginEntry } from './pluginManager';

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

  beforeEach(() => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      writable: true,
      value: {
        localStorage: createLocalStorageMock(),
        location: {
          origin: 'https://alpha1.bolt.gives',
        },
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (globalThis as any).window;
    globalThis.fetch = originalFetch;
  });

  it('installs, lists, and uninstalls plugins from trusted HTTPS origins', () => {
    const installed = PluginManager.install({
      name: 'sample-plugin',
      version: '1.0.0',
      description: 'sample',
      entry: 'https://raw.githubusercontent.com/embire2/bolt.gives-plugins/main/plugin.mjs',
    });

    expect(installed).toHaveLength(1);
    expect(PluginManager.listInstalled()).toHaveLength(1);

    const afterUninstall = PluginManager.uninstall('sample-plugin');
    expect(afterUninstall).toHaveLength(0);
  });

  it('rejects non-HTTPS plugin entries', () => {
    expect(() =>
      PluginManager.install({
        name: 'insecure-plugin',
        version: '1.0.0',
        description: 'bad',
        entry: 'http://raw.githubusercontent.com/embire2/bolt.gives-plugins/main/plugin.mjs',
      }),
    ).toThrow('Plugin entry must use HTTPS.');
  });

  it('rejects HTTPS plugin entries from non-allowlisted origins', () => {
    expect(() =>
      PluginManager.install({
        name: 'unknown-origin-plugin',
        version: '1.0.0',
        description: 'bad',
        entry: 'https://example.com/plugin.mjs',
      }),
    ).toThrow('Plugin entry origin is not allowlisted');
  });

  it('normalizes trusted plugin entry URLs', () => {
    expect(normalizeTrustedPluginEntry('https://RAW.GITHUBUSERCONTENT.COM/embire2/bolt.gives-plugins/main/plugin.mjs')).toBe(
      'https://raw.githubusercontent.com/embire2/bolt.gives-plugins/main/plugin.mjs',
    );
  });

  it('rejects malformed marketplace registries', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ plugins: [{ name: 'missing-fields' }] }),
    }) as any;

    await expect(PluginManager.fetchMarketplace('https://raw.githubusercontent.com/embire2/bolt.gives-plugins/main/registry.json')).rejects.toThrow(
      'Plugin marketplace manifest is invalid.',
    );
  });

  it('rejects marketplace indexes from non-allowlisted origins', async () => {
    await expect(PluginManager.fetchMarketplace('https://example.com/registry.json')).rejects.toThrow(
      'Plugin entry origin is not allowlisted',
    );
  });
});
