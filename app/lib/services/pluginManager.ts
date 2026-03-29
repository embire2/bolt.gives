import { z } from 'zod';

export interface PluginManifest {
  name: string;
  version: string;
  description: string;
  entry: string;
}

const STORAGE_KEY = 'bolt_installed_plugins';
const DEFAULT_MARKETPLACE_INDEX = 'https://raw.githubusercontent.com/embire2/bolt.gives-plugins/main/registry.json';
const pluginManifestSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  description: z.string().min(1),
  entry: z.string().min(1),
});
const pluginManifestListSchema = z.array(pluginManifestSchema);
const pluginRegistrySchema = z.union([
  pluginManifestListSchema,
  z.object({
    plugins: pluginManifestListSchema,
  }),
]);

function parsePluginManifest(input: unknown): PluginManifest {
  return pluginManifestSchema.parse(input);
}

function readInstalled(): PluginManifest[] {
  if (typeof window === 'undefined') {
    return [];
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);

  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    const result = pluginManifestListSchema.safeParse(parsed);

    return result.success ? result.data : [];
  } catch {
    return [];
  }
}

function writeInstalled(plugins: PluginManifest[]) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(plugins));
}

export class PluginManager {
  static listInstalled() {
    return readInstalled();
  }

  static install(plugin: PluginManifest) {
    const validatedPlugin = parsePluginManifest(plugin);
    const installed = readInstalled();
    const existing = installed.find((item) => item.name === validatedPlugin.name);

    if (existing) {
      const updated = installed.map((item) => (item.name === validatedPlugin.name ? validatedPlugin : item));
      writeInstalled(updated);

      return updated;
    }

    const next = [...installed, validatedPlugin];
    writeInstalled(next);

    return next;
  }

  static uninstall(pluginName: string) {
    const installed = readInstalled();
    const next = installed.filter((plugin) => plugin.name !== pluginName);
    writeInstalled(next);

    return next;
  }

  static async loadInstalledPlugins() {
    const installed = readInstalled();

    await Promise.allSettled(
      installed.map(async (plugin) => {
        try {
          await import(/* @vite-ignore */ plugin.entry);
        } catch {
          // Plugin loading is best-effort and isolated from app startup.
        }
      }),
    );
  }

  static async fetchMarketplace(indexUrl = DEFAULT_MARKETPLACE_INDEX) {
    const response = await fetch(indexUrl);

    if (!response.ok) {
      throw new Error(`Failed to fetch plugin marketplace: ${response.status}`);
    }

    const data = (await response.json()) as unknown;
    const parsed = pluginRegistrySchema.safeParse(data);

    if (!parsed.success) {
      throw new Error('Plugin marketplace manifest is invalid.');
    }

    return Array.isArray(parsed.data) ? parsed.data : parsed.data.plugins;
  }
}
