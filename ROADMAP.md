# Roadmap

Last updated: 2026-04-05

Status legend:
- `[x]` complete
- `[~]` in progress / partially shipped
- `[ ]` not started

Current stable release:
- [x] `v3.0.8`

Next release target:
- [~] `v3.0.9`

## v3.0.8 - Shipped Baseline

Release theme: turn the managed Cloudflare trial flow into a registration-first operator system, keep the public/free path honest, and stand up a private admin control plane on the live server.

### Shipped in v3.0.8

1. Hosted runtime and browser offload
- [x] Hosted instances now prefer the managed server runtime for install/build/dev/test/preview flows.
- [x] Hosted preview state now comes from server-side status/SSE instead of tight browser polling.
- [x] Preview breakage now routes into server-side self-heal and last-known-good restore.
- [x] A committed live release smoke path now verifies generated app success, intentional preview breakage, self-heal, and preview restoration.

2. Browser load reduction
- [x] Explicit manual chunking now separates framework/editor/terminal/collaboration/markdown/chart/git domains.
- [x] CodeMirror language packages now split into narrower per-language chunks.
- [x] Terminal code now loads only after the terminal is opened.
- [x] GitHub/GitLab deploy dialogs now lazy-load so export/deploy SDKs stay off the startup path.
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
- [x] Tenant creation now starts in `pending`.
- [x] Tenant approval, invite issuance, forced password reset via invite, and disable/re-enable lifecycle metadata are now available.
- [~] Current tenant registry is still a server-local baseline and still needs full RBAC, durable storage, and production-hardening work.

5. Protected default FREE provider
- [x] FREE now ships as a single locked hosted model: `deepseek/deepseek-v3.2`.
- [x] FREE exposes no user API-key entry path and no client-visible fallback model.
- [x] Managed OpenRouter token remains server-side only so fresh installs can start coding immediately without leaking the token.

6. Managed Cloudflare trial control plane
- [x] A real managed-instance route now exists at `/managed-instances`.
- [x] Runtime control endpoints now handle support/config, session lookup, spawn, refresh, and suspend flows.
- [x] Trial instances now carry a 15-day expiry window plus event history in the runtime registry.
- [x] Runtime enforcement now prevents a second trial from being minted for the same claimed client identity.
- [x] Runtime enforcement also binds the active browser session to the already-issued instance so the same browser cannot quietly mint a second one under a different email.
- [x] Users can request a preferred subdomain during provisioning.
- [x] Managed trial instances are designed to roll forward from the current stable build via the runtime sync loop.
- [x] Live provisioning is enabled on the server-hosted runtime where operator-side Cloudflare credentials are configured.
- [x] Trial provisioning is now registration-first: the public form captures a client profile before a trial instance is created.
- [x] Trial registrations are mirrored into the private admin panel database and linked back to assigned managed instances.
- [x] The private operator URL `https://admin.bolt.gives` is now wired to the admin control surface on this server.
- [x] Admin can review registered client profiles, live Cloudflare assignments, and stored outbound client email activity from one dashboard.
- [x] Existing trial owners now land on a dedicated success page with the live URL, assigned hostname, expiry, and rollout details instead of returning to the registration form.
- [x] Managed trial instances now receive the hosted `FREE` provider through a protected relay configuration, so `DeepSeek V3.2` works on trial instances without embedding the OpenRouter key in the Pages project.
- [x] Managed trial instances now provision the hosted FREE relay credential as a Pages secret, keeping the relay path server-only while restoring the FREE provider retroactively across existing live trials.

7. Self-host packaging and domain parity
- [x] README now links directly to `https://create.bolt.gives` for the managed registration flow.
- [x] The app can now redirect a dedicated create domain to `/managed-instances`, matching the admin-domain redirect behavior.
- [x] The installer now supports custom app/admin/create domains for VPS self-hosting.
- [x] The installer now prompts interactively for domain/PostgreSQL values when CLI flags are omitted.
- [x] Self-hosted installs now fall back to the local app domain’s `/managed-instances` route when no dedicated create domain is configured.
- [x] The installer now provisions a local PostgreSQL service for the private admin/operator control plane.
- [x] The installer now configures Caddy for public HTTPS reverse-proxy on the chosen self-hosted domains.

7. Release communication
- [x] Versioning aligned to `v3.0.8` across app/runtime/docs.
- [x] Changelog and feature feed updated for the release.
- [x] Release gate now boots the local runtime stack, verifies the locked `FREE` + `DeepSeek V3.2` startup label, and runs `pnpm run smoke:live`.

### Validation expectations for v3.0.8
- `pnpm run typecheck`
- `pnpm run lint`
- `pnpm test`
- `pnpm run build`
- `pnpm run e2e:free-startup`
- live browser E2E on `https://alpha1.bolt.gives`
- live smoke on `https://ahmad.bolt.gives`
- live smoke on `https://bolt-gives.pages.dev`
- live admin/operator E2E on `https://admin.bolt.gives`
- `pnpm run smoke:live`

## v3.0.9 - Next Priority Stack

Release theme: harden the operator surface into a production-safe tenant service, tighten rollout/rollback visibility, and keep shrinking the remaining browser/runtime heavy paths.

### P0

0. Execution UX clarity
- [x] Keep `Chat` active by default while the workspace spins up so users can still follow commentary.
- [x] Add a bottom `Workspace Activity` panel with live commentary, execution transparency, and technical timeline.
- [x] Default live loads back into `Chat` instead of restoring a stale `Workspace` focus from prior browser state.
- [x] Prevent stale terminal panel state from crashing the workspace surface on live hosted instances.
- [x] Keep the locked hosted FREE model visible as `DeepSeek V3.2` in the selector instead of a misleading placeholder during async provider/model bootstrap.
- [x] Keep the public `/managed-instances` registration/control surface scrollable inside the locked app shell instead of relying on document-level scrolling.
- [x] Keep `admin.bolt.gives` operator sign-in on a browser-native cookie redirect path so the dashboard loads cleanly after authentication instead of relying on fragile SPA handoffs.
- [x] Persist and show the real Cloudflare-assigned Pages hostname for managed trials so clients do not get sent to the wrong `*.pages.dev` site when Cloudflare appends a suffix.
- [ ] Make prompt-to-preview progress feel continuous on generated-app flows instead of bouncing between starter/workspace states.
- [ ] Add stronger explicit preview lifecycle states (`scaffolding`, `installing`, `starting`, `preview ready`, `repairing`) to the main shell.

1. Vendor and editor payload reduction
- [ ] Split the remaining heavy startup/runtime chunks (`editor-language-core`, `pdf-export`, `git-export`, `terminal-xterm`) into stricter action-driven boundaries.
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
- [~] Add tenant roles, audit trail, approval history, and basic session management.
- [x] Enforce one-client / one-instance rules for managed deployments in runtime, not only docs.
 - [x] Support self-hosted admin/create domain configuration instead of assuming only the hosted `bolt.gives` domains exist.

5. Cloudflare managed control plane
- [x] Build the actual spawn/provision/update control plane described in docs.
- [x] Let a signed-in client request one experimental managed trial instance for 15 days through the managed control-plane surface.
- [x] Enforce one-client / one-instance allocation with a clear reclaim/expiry path.
- [x] Let each client choose a subdomain during provisioning.
- [x] Add an operator surface inside `Tenant Admin` that lists managed trial instances, status, expiry, and server-backed refresh/suspend actions.
- [x] Keep Cloudflare operator credentials on the runtime service only; browser/operator pages receive sanitized instance metadata only.
- [~] Implement automatic rollout from the current stable build to managed instances.
- [x] Keep managed-instance runtime configuration in sync across retroactive fleet updates, not only new spawns.
- [ ] Add health-verified rollback on failed updates.
- [~] Wire live operator credentials on hosted runtimes so provisioning is enabled in production, not just implemented in code.

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

### v3.0.8 Release Metrics
- [~] Initial hosted chat shell materially lighter than `v3.0.7`.
- [ ] No shared startup chunk above agreed budget.
- [ ] Hosted scaffold-to-preview success rate >= 90%.
- [ ] Architect known-failure recovery success >= 75%.
- [~] Tenant admin flows work end-to-end on server-hosted instances.
- [ ] Managed instance rollout/update path is health-checked and reversible.
