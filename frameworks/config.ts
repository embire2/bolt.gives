/**
 * Framework configuration for bolt.gives
 * Supports Electron, Tauri, and Neutralino.js
 */

export type FrameworkType = 'electron' | 'tauri' | 'neutralino';

export interface FrameworkConfig {
  name: FrameworkType;
  enabled: boolean;
  buildCommand: string;
  devCommand: string;
  outputDir: string;
  packageManager?: string;
  description: string;
}

export const frameworkConfigs: Record<FrameworkType, FrameworkConfig> = {
  electron: {
    name: 'electron',
    enabled: process.env.ENABLE_ELECTRON !== 'false',
    buildCommand: 'pnpm electron:build:dist',
    devCommand: 'pnpm electron:dev',
    outputDir: 'dist',
    description: 'Classic Electron desktop app',
  },
  tauri: {
    name: 'tauri',
    enabled: process.env.ENABLE_TAURI === 'true',
    buildCommand: 'pnpm tauri:build',
    devCommand: 'pnpm tauri:dev',
    outputDir: 'src-tauri/target/release',
    packageManager: 'cargo',
    description: 'Rust-based Tauri app',
  },
  neutralino: {
    name: 'neutralino',
    enabled: process.env.ENABLE_NEUTRALINO === 'true',
    buildCommand: 'pnpm neutralino:build',
    devCommand: 'pnpm neutralino:dev',
    outputDir: 'dist-neutralino',
    description: 'Lightweight Neutralino.js app',
  },
};

export const getEnabledFrameworks = (): FrameworkType[] => {
  return Object.values(frameworkConfigs)
    .filter(config => config.enabled)
    .map(config => config.name);
};

export const isFrameworkEnabled = (framework: FrameworkType): boolean => {
  return frameworkConfigs[framework]?.enabled || false;
};

export const getFrameworkConfig = (framework: FrameworkType): FrameworkConfig | null => {
  return frameworkConfigs[framework] || null;
};