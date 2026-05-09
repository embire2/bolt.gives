import { z } from 'zod';

export interface PluginManifest {
  name: string;
  version: string;
  description: string;
  entry: string;
}

const STORAGE_KEY = 'bolt_installed_plugins';
const DEFAULT_MARKETPLACE_INDEX = 'https://raw.githubusercontent.com/embire2/bolt.gives-plugins/main/registry.json';
const DEFAULT_ALLOWED_PLUGIN_ORIGINS = [
  'https://raw.githubusercontent.com',
  'https://cdn.jsdelivr.net',
  'https://esm.sh',
  'https://unpkg.com',
];
const ALLOWED_PLUGIN_ORIGINS_ENV_KEY = 'VITE_PLUGIN_ALLOWED_ORIGINS';

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

function normalizeOrigin(rawOrigin: string): string | null {
  try {
    const normalized = new URL(rawOrigin).origin;
    return normalized.toLowerCase();
  } catch {
    return null;
  }
}

function getAllowedPluginOrigins() {
  const configuredOrigins = String((import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.[
    ALLOWED_PLUGIN_ORIGINS_ENV_KEY
  ] || '')
    .split(',')
    .map((value) => normalizeOrigin(value.trim()))
    .filter((value): value is string => Boolean(value));

  const origins = new Set<string>([...DEFAULT_ALLOWED_PLUGIN_ORIGINS.map((origin) => origin.toLowerCase()), ...configuredOrigins]);

  if (typeof window !== 'undefined') {
    const windowOrigin = normalizeOrigin(window.location.origin);

    if (windowOrigin) {
      origins.add(windowOrigin);
    }
  }

  return origins;
}

export function normalizeTrustedPluginEntry(entry: string): string {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(entry);
  } catch {
    throw new Error(`Invalid plugin entry URL: ${entry}`);
  }

  if (parsedUrl.protocol !== 'https:') {
    throw new Error('Plugin entry must use HTTPS.');
  }

  const allowedOrigins = getAllowedPluginOrigins();
  const origin = parsedUrl.origin.toLowerCase();

  if (!allowedOrigins.has(origin)) {
    throw new Error(`Plugin entry origin is not allowlisted: ${origin}`);
  }

  return parsedUrl.toString();
}

function parsePluginManifest(input: unknown): PluginManifest {
  const parsed = pluginManifestSchema.parse(input);

  return {
    ...parsed,
    entry: normalizeTrustedPluginEntry(parsed.entry),
  };
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

    if (!result.success) {
      return [];
    }

    return result.data.map((plugin) => parsePluginManifest(plugin));
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
        const trustedEntry = normalizeTrustedPluginEntry(plugin.entry);

        try {
          await import(/* @vite-ignore */ trustedEntry);
        } catch {
          // Plugin loading is best-effort and isolated from app startup.
        }
      }),
    );
  }

  static async fetchMarketplace(indexUrl = DEFAULT_MARKETPLACE_INDEX) {
    const trustedIndex = normalizeTrustedPluginEntry(indexUrl);
    const response = await fetch(trustedIndex);

    if (!response.ok) {
      throw new Error(`Failed to fetch plugin marketplace: ${response.status}`);
    }

    const data = (await response.json()) as unknown;
    const parsed = pluginRegistrySchema.safeParse(data);

    if (!parsed.success) {
      throw new Error('Plugin marketplace manifest is invalid.');
    }

    const plugins = Array.isArray(parsed.data) ? parsed.data : parsed.data.plugins;
    return plugins.map((plugin) => parsePluginManifest(plugin));
  }
}
