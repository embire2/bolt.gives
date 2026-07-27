/**
 * Optional framework configuration for experimental Tauri builds.
 *
 * The legacy desktop wrapper is retired. The planned Premium Windows app
 * is a separate native product and does not reuse this configuration.
 */

export type FrameworkType = 'tauri';

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
  tauri: {
    name: 'tauri',
    // Tauri is opt-in; requires a Rust toolchain. Enable with ENABLE_TAURI=true.
    enabled: parseBooleanFlag(process.env.ENABLE_TAURI, false),
    buildCommand: 'pnpm tauri:build',
    devCommand: 'pnpm tauri:dev',
    outputDir: 'modules/surfaces/tauri/target/release',
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
