/**
 * Framework configuration for bolt.gives
 * Supports Electron and Tauri desktop builds.
 *
 * Neutralino was removed in the production-hardening pass — Electron
 * covers the broad-compatibility desktop case, and Tauri covers the
 * lightweight/native-performance case. Maintaining three wrappers for
 * the same renderer was causing drift and update/security gaps.
 */

export type FrameworkType = 'electron' | 'tauri';

export interface FrameworkConfig {
  name: FrameworkType;
  enabled: boolean;
  buildCommand: string;
  devCommand: string;
  outputDir: string;
  packageManager?: string;
  description: string;
}

function parseBooleanFlag(raw: string | undefined, defaultValue: boolean): boolean {
  if (typeof raw !== 'string') {
    return defaultValue;
  }

  const normalized = raw.trim().toLowerCase();

  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }

  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  return defaultValue;
}

export const frameworkConfigs: Record<FrameworkType, FrameworkConfig> = {
  electron: {
    name: 'electron',
    // Electron is the default desktop target; opt-out with ENABLE_ELECTRON=false.
    enabled: parseBooleanFlag(process.env.ENABLE_ELECTRON, true),
    buildCommand: 'pnpm electron:build:dist',
    devCommand: 'pnpm electron:dev',
    outputDir: 'dist',
    description: 'Broad-compatibility Electron desktop app with auto-update + crash recovery.',
  },
  tauri: {
    name: 'tauri',
    // Tauri is opt-in; requires a Rust toolchain. Enable with ENABLE_TAURI=true.
    enabled: parseBooleanFlag(process.env.ENABLE_TAURI, false),
    buildCommand: 'pnpm tauri:build',
    devCommand: 'pnpm tauri:dev',
    outputDir: 'src-tauri/target/release',
    packageManager: 'cargo',
    description: 'Rust-based Tauri desktop app with tight CSP, signed updater, and small footprint.',
  },
};

export const getEnabledFrameworks = (): FrameworkType[] => {
  return Object.values(frameworkConfigs)
    .filter((config) => config.enabled)
    .map((config) => config.name);
};

export const isFrameworkEnabled = (framework: FrameworkType): boolean => {
  return frameworkConfigs[framework]?.enabled ?? false;
};

export const getFrameworkConfig = (framework: FrameworkType): FrameworkConfig | null => {
  return frameworkConfigs[framework] ?? null;
};
