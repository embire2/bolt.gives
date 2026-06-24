# Roadmap

Last updated: 2026-06-24

Status legend:

- `[x]` complete
- `[~]` in progress / partially shipped
- `[ ]` not started

Current stable release:

- [x] `v3.0.9.5`

Next release target:

- [~] `v3.1.0`

## v3.0.9.5 - Current Patch

Release theme: keep hosted FREE usable on every live Pages surface without exposing the upstream model key.

### Shipped in v3.0.9.5

- [x] Sync the canonical Cloudflare Pages project with the hosted FREE relay secret and control origin so `bolt-gives.pages.dev` no longer falls through to `401 Invalid or missing API key`.
- [x] Add a reusable Cloudflare FREE-provider sync command for the canonical project and active managed Pages projects.
- [x] Add a live `FREE` smoke command that verifies `DeepSeek V4 Pro` returns successfully on hosted targets instead of asking users for an API key.
- [x] Preserve the security boundary: managed/customer Pages projects receive relay credentials, not `FREE_OPENROUTER_API_KEY`.

## v3.0.9.4 - Shipped Patch

Release theme: reduce workspace startup weight and refresh user-configured coding models.

### Shipped in v3.0.9.4

- [x] Add MiniMax as a first-class BYOK provider with `MiniMax-M3`, `MiniMax-M2.7`, `MiniMax-M2.7-highspeed`, and dynamic OpenAI-compatible model listing.
- [x] Refresh static coding model defaults across OpenAI, Anthropic, Google, DeepSeek, Groq, Mistral, and xAI.
- [x] Keep the workspace terminal closed by default and load it only after the user explicitly opens terminal tooling.
- [x] Make the workspace performance monitor opt-in instead of loading and polling during every project session.
- [x] Lazy-load chat export persistence from the code toolbar instead of pulling it into the Workbench shell.
- [x] Remove the full diff package from Workbench file-change badges, keeping detailed diff rendering isolated to the explicit Diff view.
- [x] Update preferred-model scoring so current coding models rank ahead of old GPT/Claude fallback names.
- [x] Preserve the managed hosted `FREE` path on server-side `deepseek/deepseek-v4-pro`.

## v3.0.9.3 - Shipped Patch

Release theme: restore web browsing reliability and make direct website scrape-to-build prompts work without manual preloading.

### Shipped in v3.0.9.3

- [x] `bolt-gives-webbrowse` relaunches stale Chromium handles and retries once when Playwright reports a closed browser/context.
- [x] Manual chat URL fetching uses the same CSRF-secured client fetch path as `/api/chat`.
- [x] Built-in web tools return structured failure summaries instead of aborting the chat stream on upstream browse/search errors.
- [x] Direct public URLs in build prompts are scraped before generation and injected as source context for new website builds.
- [x] Release validation includes a live `alpha1.bolt.gives` scrape-to-preview E2E before broader deployment.
- [x] Automatic managed Cloudflare fleet refreshes are serialized so startup-sync and interval-sync cannot overlap during long rollouts.
- [x] `bolt.gives/contribute` gives open-source contributors a clear application path with GitHub profile capture and SMTP-backed operator/applicant emails.
- [x] The hosted contributor form remains vertically scrollable inside the app shell so the full application is reachable on live domains.
- [x] Managed Pages instances keep runtime previews on their own assigned hostname via a same-origin `/runtime/*` proxy that preserves the public instance origin.
- [x] Managed Pages hosted `FREE` relay defaults now use `https://bolt.gives` as the canonical control origin instead of the old alpha host.
- [x] Cloudflare Pages edge functions retry runtime-control calls through the canonical hosted runtime when loopback fetches are rejected by the edge.
- [x] The public root route serves the project website with current release details, real screenshots, and contributor links while the chat workspace remains available at `/chat`.
- [x] Managed fleet refresh continues past individual failed Pages deployments so healthy active instances can receive the latest build even when one project is inaccessible.
- [x] The public homepage includes verbose crawl metadata, structured data, sitemap image discovery, conversion-oriented copy, and a generated search/social image.
- [x] The self-host app launcher detects a dead local Wrangler Pages listener and exits so systemd can restart `bolt-gives-app` before Caddy keeps returning `502`.
- [x] Health-triggered Wrangler Pages shutdowns now exit non-zero so `bolt-gives-app` cannot remain inactive after a clean Wrangler teardown.
- [x] Header and managed-instance CTAs use readable light-mode contrast across `bolt.gives` and `create.bolt.gives`.
- [x] Failed file and shell actions now propagate rejection to the caller without stalling later queued actions, reducing false-success project creation states.
- [x] The public `/tenant` portal uses an internal scroll container so tenant account details and password forms remain reachable on small screens.

## v3.0.9.2 - Shipped Patch

Release theme: restore managed Cloudflare prompt-to-preview coding while preserving strict server-side protection for the hosted `FREE` model path.

### Shipped in v3.0.9.2

- [x] Managed Cloudflare trial instances can POST credentialed hosted `FREE` relay requests through `/api/chat` and `/api/llmcall` without being blocked by same-origin browser CSRF checks.
- [x] The relay exception is scoped to chat/LLM relay routes; route actions still verify the shared hosted FREE secret against the runtime verifier before any model call.
- [x] Release validation includes a fresh instance created through `https://create.bolt.gives`, a visible preview check, and a follow-up prompt check against the same project.

## v3.0.9.1 - Shipped Patch

Release theme: keep the shipped hosted reliability baseline while reclaiming workspace vertical space for generated files and preview.

### Shipped in v3.0.9.1

- [x] Workspace Activity is capped to a compact drawer with internal feed scrolling.
- [x] The live version label, package metadata, release docs, and managed-instance documentation identify the current hosted release as `v3.0.9.1`.

## v3.0.9 - Shipped Baseline

Release theme: make bolt.gives reliable enough for daily hosted use by hardening prompt-to-preview, follow-up context, managed runtime handoff, and release validation.

### Shipped in v3.0.9

1. Prompt-to-preview reliability

- [x] Hosted `FREE` stays locked to `deepseek/deepseek-v4-pro` through the protected server-side runtime path.
- [x] `/api/chat` uses the required same-origin CSRF header on hosted surfaces, so live project creation does not fail at request start.
- [x] Generated hosted files are applied to the managed runtime before preview verification, so health checks inspect the actual current project instead of partial package-only state.
- [x] Hosted runtime command replay finishes on the runtime `exit` event even when transport streams stay open.
- [x] Reserved preview ports are probed immediately, and package-only Vite snapshots are classified as incomplete before they can idle the stream.
- [x] Hosted preview autostart refuses package-only Vite workspaces before opening a command stream, preventing incomplete snapshots from holding the session operation lock.
- [x] Hosted runtime waits for completed file actions before syncing source into Vite, preventing partial streamed code from triggering preview rollback.
- [x] Starter-placeholder detections are ignored once the active workspace no longer contains starter placeholder content, preventing valid generated apps from being rolled back.
- [x] Scaffold-only or prose-only runtime handoffs are rejected until the merged workspace contains concrete implementation files and runnable app entries.
- [x] Generated entry-file writes resolve onto the active starter source file when models choose a sibling JS/TS extension.
- [x] Browser E2E validates working projects strictly by requiring the requested token to appear inside preview, not just an iframe mount.
- [x] Browser E2E now also verifies that generated and follow-up tokens persist in the hosted runtime snapshot after preview recovery settles.
- [x] Browser E2E runtime snapshot checks enforce bounded fetch timeouts, so release validation reports stalled snapshot/status endpoints instead of hanging.
- [x] Live `alpha1` FREE/DeepSeek E2E validated first prompt generation plus a follow-up prompt that preserved both tokens in preview.
- [x] Hosted preview autostart consumes runtime command streams through the `ready` event, preventing healthy generated previews from staying stuck in `starting`.
- [x] Header preview/deploy controls lazy-load after chat starts, preventing initial browser chunks from creating workbench initialization cycles.
- [x] Hosted preview verification waits for recovered `restored` states to settle before launching another model continuation, keeping the first chat stream from blocking follow-up prompts after a valid preview is already recoverable.
- [x] Hosted runtime sync repairs raw JSX angle text before preview start, so common small-model calendar/navigation buttons do not leave projects unpreviewable.
- [x] Hosted chat streams close once a healthy preview is verified, even if a recovery continuation emits only inspection/prose actions, so users can submit follow-up improvements immediately.

2. History-aware iteration

- [x] Follow-up prompts use a stable project-context id and project-scoped memory instead of a browser-global slot.
- [x] Current workspace snapshots are supplied deterministically even when context optimization is disabled.
- [x] Follow-up prompts supersede queued auto-heal work, avoiding hidden repair races against user-requested improvements.
- [x] Follow-up installs/restarts use a dedicated runtime shell so iterative prompts can build on the current project without trampling the active preview.
- [x] Hosted runtime snapshots are used as canonical chat file state for live follow-up prompts.
- [x] Recovered previews are no longer accepted as follow-up success if the rollback dropped the latest generated file changes.

3. Transparency and release validation

- [x] Chat and Workspace remain separate top-level tabs with visible live commentary and technical execution state.
- [x] Hosted preview verification emits visible startup progress during long warm-ups.
- [x] The Workspace preview reconciles quickly when the managed runtime reports a verified preview.
- [x] Postdeploy browser health checks fail release validation on missing hashed assets or non-interactive prompt shells.
- [x] Runtime startup blocks managed-instance rollout when `/srv/bolt-gives` is behind `origin/main`.
- [x] Browser-only chat persistence is guarded from SSR so hosted Pages rendering does not emit IndexedDB errors.

4. Operator, managed-instance, and self-host baseline

- [x] Managed Cloudflare instances are registration-first, one-client / one-instance environments with private client profile capture.
- [x] Active managed Cloudflare instances are refreshed from the current release SHA by the runtime rollout controller.
- [x] New managed instances are provisioned from the current live build and protected hosted FREE relay secret.
- [x] Managed instance registry writes use collision-proof atomic temp files, so overlapping startup/interval rollout writes cannot reuse the same temp path.
- [x] `admin.bolt.gives` includes the private operator dashboard, client profile filtering/export, instance assignment state, SMTP configuration, and audience-based outbound email.
- [x] Header-level `Shout Out Box` messaging is available with unread tracking and a user-side settings toggle.
- [x] Self-hosting supports custom app/admin/create domains, local PostgreSQL, `psql`, operator credential seeding, and Caddy-managed HTTPS.

## v3.1.0 - Launch Plan

Release theme: turn the current hosted reliability baseline into a more observable, reversible, and scalable platform for managed instances, teams, self-hosters, and common project templates.

### P0 Priorities

1. Managed Cloudflare rollout observability

- [~] Add operator-visible deployment history, last good SHA, and rollback outcome per managed instance.
- [~] Make active-instance refresh health-verified and reversible, not just deploy-command successful.
- [x] Add capacity and fleet state summaries to `admin.bolt.gives`.
- [x] Keep recoverable failed instances eligible for the next rollout so transient deployment failures can be patched by a later healthy build.
- [~] Record startup-sync and interval-sync results in durable operator-visible history.

2. Tenant and account hardening

- [~] Replace the bootstrap-only tenant/admin baseline with production-safe account and RBAC rules.
- [ ] Add approval history, invite lifecycle, password reset lifecycle, and auditable state transitions.
- [~] Add safer admin credential rotation and clearer operator session management.
- [x] Add stronger authorization checks around SMTP transport changes, managed refresh, suspend, and export actions.

3. Prompt-to-preview quality

- [x] Upgrade the managed hosted `FREE` model to OpenRouter `deepseek/deepseek-v4-pro` / `DeepSeek V4 Pro` across default startup, managed-instance, and E2E paths.
- [~] Ship first-party template packs for the most common app requests.
- [~] Add CI smoke coverage for each first-party template pack.
- [~] Reduce empty scaffold / starter-only outcomes on real user requests.
- [ ] Broaden Architect recovery signatures beyond preview restore into dependency, build, and routing failures.

4. Browser weight and runtime offload

- [~] Push more preview/log reconciliation state entirely to the server.
- [ ] Continue reducing heavy editor, PDF, git, terminal, and deploy chunks from startup paths.
- [~] Add bundle budgets in CI so browser weight cannot silently regress.
- [~] Keep longer hosted sessions responsive on lower-end machines.

5. Self-host installer resilience

- [~] Add repeatable no-db and full-db installer smoke paths to release validation.
- [~] Improve automatic repair for apt, dependency, build, Caddy, and service-start failures.
- [ ] Keep interactive install prompts recoverable and clear when a VPS is partially configured.

6. Transparency and moderation

- [~] Eliminate remaining generic keep-alive commentary and keep progress derived from concrete runtime/file/command events.
- [x] Keep the same status model visible in both `Chat` and `Workspace`.
- [~] Add broadcast communication moderation and abuse/reporting controls for the Shout Out Box.

### P1 Improvements

- [ ] Teams mode with RBAC and shared project ownership.
- [ ] Collaboration audit trail and operator export.
- [ ] Cleaner operator email workflows with test delivery and bounce/error visibility.
- [ ] Better first-run education for hosted and self-hosted users.

## v3.1.0 Release Metrics

- [ ] First prompt-to-preview success rate >= 95% on the first-party template set.
- [ ] Commentary first visible update <= 2s on hosted runs.
- [ ] No hidden agent actions: critical execution state always visible in `Chat` or `Workspace`.
- [ ] Managed Cloudflare refresh path is health-verified and rollback-capable.
- [ ] Installer success rate >= 95% on the validated Ubuntu VPS baseline.
- [ ] No shared browser startup chunk exceeds the agreed budget.

## Required Validation Before Release

- `bash -n install.sh`
- `pnpm run typecheck`
- `pnpm run lint`
- `pnpm test`
- `pnpm run build`
- `pnpm run e2e:free-startup`
- `pnpm run smoke:live`
- live browser E2E on `https://alpha1.bolt.gives`
- smoke on `https://ahmad.bolt.gives`
- smoke on `https://bolt-gives.pages.dev`
- operator/admin E2E on `https://admin.bolt.gives`
- installer smoke on a fresh Ubuntu VPS path
