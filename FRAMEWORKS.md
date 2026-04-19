# Desktop Framework Support for bolt.gives

bolt.gives ships as a web app and as two desktop wrappers:

1. **Electron** (default) — broad-compatibility desktop app with auto-update and crash recovery.
2. **Tauri** (opt-in) — Rust-native lightweight desktop app with tight CSP and a signed updater.

> **Neutralino was removed.** The third wrapper caused build drift, duplicated window/menu/cookie code, and an unpatched update path. Electron remains the default; Tauri is the high-security / small-footprint option.

## Environment flags

| Flag               | Default | Effect                                                |
| ------------------ | ------- | ----------------------------------------------------- |
| `ENABLE_ELECTRON`  | `true`  | Set `false` to skip Electron in multi-target scripts. |
| `ENABLE_TAURI`     | `false` | Set `true` to include Tauri in multi-target scripts.  |

Accepted values: `1 / true / yes / on` and `0 / false / no / off` (case-insensitive).

## Build commands

### Electron

```bash
# Dev
pnpm electron:dev

# Platform-specific release bundles
pnpm electron:build:mac
pnpm electron:build:win
pnpm electron:build:linux

# All three (CI-only; produces .dmg / .exe / .AppImage / .deb / .rpm)
pnpm electron:build:dist
```

Outputs land in `./dist/`.

### Tauri

Prerequisites: [Rust toolchain](https://tauri.app/start/prerequisites/) (`cargo`, `rustc`) and the Tauri CLI (`pnpm dlx @tauri-apps/cli@latest`).

```bash
# Dev
pnpm tauri:dev

# Release bundle
pnpm tauri:build
```

Outputs land in `./src-tauri/target/release/bundle/`.

## Security posture

| Surface        | Electron                                              | Tauri                                                  |
| -------------- | ----------------------------------------------------- | ------------------------------------------------------ |
| Context iso.   | `contextIsolation: true`, `nodeIntegration: false`    | `withGlobalTauri: false`                               |
| Sandbox        | `sandbox: true` on BrowserWindow                      | Tauri default sandbox + capability scopes              |
| CSP            | Injected via `onHeadersReceived` (prod)               | `tauri.conf.json` `security.csp`                       |
| Updater        | `electron-updater` — signed via `electron-builder` config; fail-closed if no pubkey | `tauri-plugin-updater` — Ed25519 signature, fail-closed if `pubkey` empty |
| Crash recovery | `render-process-gone` + `child-process-gone` handlers respawn with backoff | Tauri native + `tauri-plugin-process` respawn          |

See the updater setup checklist in `docs/DESKTOP_UPDATER.md` (generated in Phase 5) for how to rotate keys.

## Release artifacts

GitHub Actions build both frameworks on tag push (`v*`):

- `.github/workflows/electron.yml` → `dist/*.{dmg,exe,AppImage,deb,zip}`
- `.github/workflows/tauri.yml`    → `src-tauri/target/release/bundle/**/*`

Both workflows publish to the same GitHub Release.

## Troubleshooting

- **Tauri build fails with "failed to find tauri-cli"** — run `pnpm dlx @tauri-apps/cli@latest` or install globally: `cargo install tauri-cli --version '^2.0'`.
- **Electron updater silently does nothing** — that's intentional: builds without a valid `electron-update.yml` pubkey refuse to apply updates (fail-closed). See Phase 5 updater docs.
- **macOS "app is damaged" after download** — unsigned dev build; ship through GitHub Releases for `electron-builder` / Tauri to add notarization metadata.
