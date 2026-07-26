# Module Architecture

`v3.3.0` divides the production codebase into six pnpm workspace packages. The packages compile into one application, but ownership and validation stay focused so a change does not require loading or checking unrelated domains.

## Ownership

| Module | Package | Owns |
| --- | --- | --- |
| Core | `@bolt/core` | Shared contracts, workspace paths, security, logging, URLs, version metadata, and low-level utilities |
| Agent | `@bolt/agent` | Providers, prompts, context selection, streaming, tools, commentary, continuation, recovery, and web browsing |
| Runtime | `@bolt/runtime` | Hosted runtime clients, workspace synchronization, Preview health/recovery, runtime-node provisioning, and command support |
| Project | `@bolt/project` | Files, history, persistence, Workbench, editor, terminal, actions, collaboration, and project integrations |
| Control plane | `@bolt/control-plane` | Tenant/admin policy, managed instances, updates, publishing, domains, billing, mail, and audit state |
| Surfaces | `@bolt/surfaces` | Remix routes, application chrome, Cloudflare adapters, Electron, mobile, Tauri, and cross-domain composition |

Each module has its own `package.json`, `tsconfig.json`, and `AGENTS.md`. Public imports use `@bolt/<module>/*`; the map in `modules/module-map.json` is the source of truth for permitted dependencies.

## Dependency Graph

```text
core
|- agent
|- runtime
|- project -> agent, runtime
|- control-plane -> runtime
`- surfaces -> agent, runtime, project, control-plane
```

`core` cannot import another product module. `agent` and `runtime` depend only on `core`. Cross-domain orchestration stays in `surfaces`, while scripts that existing services invoke remain as small compatibility facades under `scripts/`.

## Focused Commands

```bash
# See package ownership.
pnpm module:list

# Check one module only.
pnpm module:check agent
pnpm module:check project

# Check changed modules and every transitive dependent.
pnpm module:affected

# Enforce declared dependencies and file-size budgets.
pnpm check:boundaries
pnpm check:boundaries:strict
```

Turborepo coordinates package tasks and caches successful module checks locally. Root configuration changes fan out to all packages; a feature-module change checks only that module and packages that consume it.

## Size Ratchet

New production files are limited to 1,000 lines. Existing large files have explicit ceilings in `modules/module-map.json`; they may shrink, but CI rejects growth. This avoids a risky one-release rewrite while making the remaining decomposition debt measurable.

## Adding Code

1. Choose the module that owns the behavior.
2. Put reusable browser/server-neutral contracts in `core`, not in a feature package.
3. Import other product code through `@bolt/*` aliases.
4. Add tests beside the changed implementation.
5. Run `pnpm module:check <name>` during development.
6. Run the root release gate before merging.

Do not bypass a dependency rule with a long relative path. If two low-level modules need each other, extract the shared contract or pure helper to `core`, or inject a port from the composition layer.
