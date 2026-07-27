# Optional Desktop Framework Support

bolt.gives is currently released as a web application and Linux self-host package. The legacy Electron application, packaging configuration, updater, dependencies, and release workflow were retired in `v3.3.1`.

The repository retains an experimental Tauri surface for contributor research. It is not the planned Premium Windows application and is not part of the supported stable release.

## Tauri

Set `ENABLE_TAURI=true` only when running tooling that reads `frameworks/config.ts`. Accepted Boolean values are `1 / true / yes / on` and `0 / false / no / off`, case-insensitively.

Prerequisites: a Rust toolchain (`cargo` and `rustc`) plus the Tauri CLI.

```bash
pnpm tauri:dev
pnpm tauri:build
```

Build output lands under `modules/surfaces/tauri/target/release`.

## Native Windows App

A brand-new native Windows application is in development for a future bolt.gives Premium offering. It will have its own architecture, security review, installer, update channel, and release acceptance process. No Windows desktop binary is included in `v3.3.1`.
