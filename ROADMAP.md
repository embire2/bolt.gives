# Roadmap

Last updated: 2026-03-30

Status legend:
- `[x]` complete
- `[~]` in progress / partially shipped
- `[ ]` not started

Current stable release:
- [x] `v3.0.3`

Next release target:
- [~] `v3.0.4`

## v3.0.3 - Shipped Baseline

Release theme: move the hosted product to a server-first runtime, reduce browser load, and restore critical operator/user controls.

### Shipped in v3.0.3

1. Hosted runtime and browser offload
- [x] Hosted instances now prefer the managed server runtime for install/build/dev/test/preview flows.
- [x] Hosted preview state now comes from server-side status/SSE instead of tight browser polling.
- [x] Preview breakage now routes into server-side self-heal and last-known-good restore.

2. Browser load reduction
- [x] Explicit manual chunking now separates framework/editor/terminal/collaboration/markdown/chart/git domains.
- [x] Collaboration config was split away from the heavy Yjs client so non-collab paths no longer pay that cost.
- [x] Editor loading is deferred harder: the editor shell and vscode theme payload now load on demand.
- [x] Settings surfaces with chart/PDF dependencies now lazy-load only when opened.
- [x] Long technical feeds remain virtualized.

3. Prompt and navigation usability
- [x] Provider/model summary is visible again directly above the prompt box.
- [x] User-supplied provider API key flows remain available for supported providers.
- [x] Sidebar now has an explicit click target plus a wider hover-open threshold.

4. Tenant management baseline
- [x] Tenant management entry points are now visible in the main shell and header.
- [x] Bootstrap `Tenant Admin` dashboard added for server-hosted instances.
- [x] Default bootstrap credentials are `admin / admin`.
- [~] Current tenant registry is a simple server-local baseline and still needs full RBAC, audit, and production-hardening work.

5. Release communication
- [x] Versioning aligned to `v3.0.3` across app/runtime/docs.
- [x] Changelog and feature feed updated for the release.

### Validation expectations for v3.0.3
- `pnpm run typecheck`
- `pnpm run lint`
- `pnpm test`
- `pnpm run build`
- live browser E2E on `https://alpha1.bolt.gives`
- live smoke on `https://ahmad.bolt.gives`
- live smoke on `https://bolt-gives.pages.dev`

## v3.0.4 - Next Priority Stack

Release theme: finish the server-first architecture, remove remaining browser-weight hot spots, and harden multi-tenant/server operations.

### P0

1. Vendor and editor payload reduction
- [ ] Split the remaining oversized `vendor` domain into finer runtime buckets.
- [ ] Move more CodeMirror language/theme payloads behind language-use boundaries.
- [ ] Remove any remaining editor/collab/chart heavy imports from shared startup paths.

2. Full server-first execution closure
- [ ] Eliminate remaining hosted dependence on browser WebContainer for normal coding paths.
- [ ] Keep browser terminal/status surfaces thin and server-backed only.
- [ ] Push more preview/log reconciliation state entirely to the server.

3. Self-heal hardening
- [ ] Expand Architect preview/runtime diagnostics beyond restore-only recovery.
- [ ] Add confidence-based fix loops with bounded retries.
- [ ] Add regression E2E that breaks generated apps in multiple ways and proves recovery.

4. Tenant and account hardening
- [ ] Replace bootstrap tenant registry with a proper production-safe tenant/account model.
- [ ] Add password change flow for bootstrap admin.
- [ ] Add tenant roles, audit trail, and basic session management.
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

### v3.0.4 Release Metrics
- [ ] Initial hosted chat shell materially lighter than `v3.0.3`.
- [ ] No shared startup chunk above agreed budget.
- [ ] Hosted scaffold-to-preview success rate >= 90%.
- [ ] Architect known-failure recovery success >= 75%.
- [ ] Tenant admin flows work end-to-end on server-hosted instances.
- [ ] Managed instance rollout/update path is health-checked and reversible.
