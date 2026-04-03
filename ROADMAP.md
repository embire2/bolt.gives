# Roadmap

Last updated: 2026-04-03

Status legend:
- `[x]` complete
- `[~]` in progress / partially shipped
- `[ ]` not started

Current stable release:
- [x] `v3.0.5`

Next release target:
- [~] `v3.0.6`

## v3.0.5 - Shipped Baseline

Release theme: thin the browser client further, keep hosted execution server-first, make commentary/state more truthful, and move tenant lifecycle off the bootstrap-only baseline.

### Shipped in v3.0.5

1. Hosted runtime and browser offload
- [x] Hosted instances now prefer the managed server runtime for install/build/dev/test/preview flows.
- [x] Hosted preview state now comes from server-side status/SSE instead of tight browser polling.
- [x] Preview breakage now routes into server-side self-heal and last-known-good restore.
- [x] A committed live release smoke path now verifies generated app success, intentional preview breakage, self-heal, and preview restoration.

2. Browser load reduction
- [x] Explicit manual chunking now separates framework/editor/terminal/collaboration/markdown/chart/git domains.
- [x] Collaboration config was split away from the heavy Yjs client so non-collab paths no longer pay that cost.
- [x] Editor loading is deferred harder: the editor shell and vscode theme payload now load on demand.
- [x] Settings surfaces with chart/PDF dependencies now lazy-load only when opened.
- [x] Long technical feeds remain virtualized.
- [x] Provider metadata is now served from a lightweight client catalog instead of pulling full provider implementations/SDKs into the browser startup path.
- [x] Framework/runtime/LLM/editor chunking was split further into smaller dedicated buckets (`react-core`, `remix-runtime`, `router-runtime`, `llm-core`, `llm-react`, `llm-openrouter`, `editor-state`, `editor-view`, `editor-language-core`, `editor-autocomplete`, `editor-commands`, `editor-search`).

3. Prompt and navigation usability
- [x] Provider/model summary is visible again directly above the prompt box.
- [x] User-supplied provider API key flows remain available for supported providers.
- [x] Sidebar now has an explicit click target plus a wider hover-open threshold.
- [x] Commentary heartbeat text now derives from active file/command/step state instead of generic keep-alive filler.

4. Tenant management baseline
- [x] Tenant management entry points are now visible in the main shell and header.
- [x] Bootstrap `Tenant Admin` dashboard added for server-hosted instances.
- [x] Default bootstrap credentials are `admin / admin`.
- [x] Tenant users now have a dedicated `/tenant` sign-in surface.
- [x] Tenant password rotation is now available through server-backed auth endpoints instead of only bootstrap admin flows.
- [~] Current tenant registry is still a server-local baseline and still needs full RBAC, audit, and production-hardening work.

5. Protected default FREE provider
- [x] FREE now ships as a single locked hosted model: `deepseek/deepseek-v3.2`.
- [x] FREE exposes no user API-key entry path and no client-visible fallback model.
- [x] Managed OpenRouter token remains server-side only so fresh installs can start coding immediately without leaking the token.

6. Release communication
- [x] Versioning aligned to `v3.0.5` across app/runtime/docs.
- [x] Changelog and feature feed updated for the release.

### Validation expectations for v3.0.5
- `pnpm run typecheck`
- `pnpm run lint`
- `pnpm test`
- `pnpm run build`
- live browser E2E on `https://alpha1.bolt.gives`
- live smoke on `https://ahmad.bolt.gives`
- live smoke on `https://bolt-gives.pages.dev`
- `pnpm run smoke:live`

## v3.0.6 - Next Priority Stack

Release theme: finish the execution UX, harden tenant lifecycle, and continue reducing browser weight on the remaining heavy surfaces.

### P0

0. Execution UX clarity
- [~] Keep `Chat` active by default while the workspace spins up so users can still follow commentary.
- [x] Add a bottom `Workspace Activity` panel with live commentary, execution transparency, and technical timeline.
- [ ] Make prompt-to-preview progress feel continuous on generated-app flows instead of bouncing between starter/workspace states.
- [ ] Add stronger explicit preview lifecycle states (`scaffolding`, `installing`, `starting`, `preview ready`, `repairing`) to the main shell.

1. Vendor and editor payload reduction
- [ ] Split the remaining oversized `vendor` domain into finer runtime buckets.
- [~] Move more CodeMirror language/theme payloads behind language-use boundaries.
- [~] Remove any remaining editor/collab/chart heavy imports from shared startup paths.

2. Full server-first execution closure
- [ ] Eliminate remaining hosted dependence on browser WebContainer for normal coding paths.
- [ ] Keep browser terminal/status surfaces thin and server-backed only.
- [~] Push more preview/log reconciliation state entirely to the server.

3. Self-heal hardening
- [ ] Expand Architect preview/runtime diagnostics beyond restore-only recovery.
- [ ] Add confidence-based fix loops with bounded retries.
- [~] Add regression E2E that breaks generated apps in multiple ways and proves recovery.
- [~] Cover starter-to-editor/workspace hydration races so generated apps do not fail during the first live editing pass.

4. Tenant and account hardening
- [ ] Replace bootstrap tenant registry with a proper production-safe tenant/account model.
- [~] Add password change flow for bootstrap admin.
- [~] Add tenant roles, audit trail, and basic session management.
- [ ] Enforce one-client / one-instance rules for managed deployments in runtime, not only docs.

5. Cloudflare managed control plane
- [ ] Build the actual spawn/provision/update control plane described in docs.
- [ ] Implement automatic rollout from `main` to managed instances.
- [ ] Add health-verified rollback on failed updates.

### P1

1. Teams and collaboration
- [ ] Optional Teams mode with RBAC.
- [ ] Collaboration audit export and operator visibility.

2. Template reliability
- [ ] First-party template packs for common stacks.
- [ ] CI smoke coverage for each template.

3. Operator quality
- [ ] Build no-db installer smoke into CI.
- [ ] Add bundle budgets to CI so startup weight cannot silently regress.
- [ ] Add runtime telemetry dashboards for memory, stalls, and recovery rate.

### v3.0.6 Release Metrics
- [~] Initial hosted chat shell materially lighter than `v3.0.5`.
- [ ] No shared startup chunk above agreed budget.
- [ ] Hosted scaffold-to-preview success rate >= 90%.
- [ ] Architect known-failure recovery success >= 75%.
- [~] Tenant admin flows work end-to-end on server-hosted instances.
- [ ] Managed instance rollout/update path is health-checked and reversible.
