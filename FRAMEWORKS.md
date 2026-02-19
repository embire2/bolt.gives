# Multi-Framework Support for bolt.gives

This document describes how to build bolt.gives as a desktop application using different frameworks.

## Supported Frameworks

1. **Electron** (default) - Classic desktop app framework
2. **Tauri** - Rust-based lightweight desktop app framework
3. **Neutralino.js** - Ultra-lightweight desktop app framework

## Environment Variables

You can control which framework(s) to build using environment variables:

```bash
# Enable specific frameworks (default: electron is enabled by default)
ENABLE_ELECTRON=true pnpm electron:build:dist
ENABLE_TAURI=true pnpm tauri:build
ENABLE_NEUTRALINO=true pnpm neutralino:build

# Disable a framework (e.g., disable Electron to only build Tauri)
ENABLE_ELECTRON=false ENABLE_TAURI=true pnpm tauri:build
```

## Build Commands

### Electron (Default)
```bash
# Development
pnpm electron:dev

# Build for distribution
pnpm electron:build:dist

# Platform-specific builds
pnpm electron:build:mac    # macOS DMG
pnpm electron:build:win    # Windows NSIS
pnpm electron:build:linux  # Linux AppImage/DEB
```

### Tauri
```bash
# Development (requires Rust and Tauri CLI)
pnpm tauri:dev

# Build for distribution
pnpm tauri:build
```

### Neutralino.js
```bash
# Development
pnpm neutralino:dev

# Build for distribution
pnpm neutralino:build
```

## Framework-Specific Notes

### Tauri Requirements
- Rust toolchain
- Node.js and pnpm
- System dependencies (see [Tauri Prerequisites](https://tauri.app/v1/guides/getting-started/prerequisites))

Install Rust:
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

### Neutralino.js Requirements
- Node.js and pnpm
- Neutralino CLI (optional, can use prebuilt binaries)

## Directory Structure

```
/home/engine/project/
├── src-tauri/              # Tauri configuration and Rust source
│   ├── src/
│   ├── icons/
│   └── capabilities/
├── neutralino/             # Neutralino configuration
└── electron/               # Electron configuration (existing)
```

## Troubleshooting

### Tauri Build Issues
- Ensure Rust is properly installed and up to date
- Check that all system dependencies are installed
- Run `rustup update` to update Rust toolchain

### Neutralino Build Issues
- Ensure you have permission to create the output directory
- Check that the build/client directory exists

### Electron Build Issues
- Clear node_modules and reinstall: `rm -rf node_modules && pnpm install`
- Check that all platform-specific dependencies are installed