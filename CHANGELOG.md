# Changelog

## Unreleased (`v3.1.0` in progress)

- `v3.1.0` is now opened as the next roadmap target, focused on managed-instance rollout observability, tenant/RBAC hardening, template packs, and stronger release gates.

## v3.0.9 (2026-04-24)

- `create.bolt.gives/managed-instances` now uses explicit high-contrast light-mode cards, form fields, policy text, and call-to-action styling so the registration flow stays readable on the live public create-domain surface.

### Added

- `admin.bolt.gives` now includes filter and export controls for client profiles, so operators can segment users by search, company, country, use case, and assignment status before acting on the data.
- Operator email sends can now target the currently filtered client audience instead of storing single-recipient draft/log entries only.
- A deployment-wide `Shout Out Box` is now available from the header, with unread badge tracking and a per-user Settings toggle to mute/hide it.
- `admin.bolt.gives` now includes a proper SMTP configuration surface, so operators can save or clear the outgoing mail transport from the admin panel while keeping the stored password server-side only.
- `admin.bolt.gives` now uses a real operator shell with sticky sidebar navigation, anchored sections, and grouped tenant/profile/instance/outreach panels instead of one long stacked page.
- The operator dashboard now renders timestamps with a deterministic UTC formatter so the live admin panel no longer tears down during hydration after sign-in.
- The live console now includes a private `Report Bug` launcher that collects the reporter’s full name, reply email, and issue details, stores the report in the Postgres-backed admin database, and sends a formatted operator notification to `wow@openweb.email` when SMTP is configured.

### Changed

- Managed Cloudflare instances are now indefinite for now instead of auto-expiring after 15 days, and legacy timed expiry state is normalized away on the live registry/admin paths.
- The managed-instance registration flow is now explicitly treated as client profile capture, including email address, so operators can support and message registered users from the private admin surface.
- `ROADMAP.md` now marks `v3.0.9` as shipped and opens the `v3.1.0` plan around managed rollout observability, tenant/RBAC hardening, template packs, and release gates.
- `README.md` now reflects the `v3.0.9` shipped baseline, keeps the `create.bolt.gives` managed-instance flow prominent, and points current planning at `v3.1.0`.
- The hosted `FREE` default path is pinned to `deepseek/deepseek-v3.2`, with the server runtime carrying the protected OpenRouter token so hosted and managed instances can start coding immediately without exposing operator credentials.
- Continue pushing tenant lifecycle from the current private operator baseline into full production RBAC, approval history, operator email delivery, and rollout observability.
- README now sends users directly to [`https://create.bolt.gives`](https://create.bolt.gives) for the managed-instance registration flow, and the app/runtime now supports a dedicated create-domain redirect path alongside the admin domain path.
- The self-host installer now provisions a fuller VPS baseline: custom app/admin/create domains, local PostgreSQL for the private admin control plane, and Caddy-managed reverse proxy/TLS wiring.
- The self-host installer now supports an interactive setup path when domain/PostgreSQL flags are omitted, and self-hosted trial links now fall back to the local app domain’s `/managed-instances` route instead of pointing back to the hosted `create.bolt.gives` domain.
- The installer now installs PostgreSQL client tooling (`psql`) as part of the supported self-host baseline and keeps asking interactively for the local PostgreSQL database name, username, and password when those flags are omitted.
- Fresh self-host installs now also prompt for the private operator/admin credentials and seed the local tenant registry with the chosen password hash, so self-hosted admin panels do not fall back to the insecure default `admin / admin` login.
- Runtime startup now evaluates a managed-instance rollout guard against the live `/srv/bolt-gives` checkout, and refuses Cloudflare fleet rollout if that checkout is behind `origin/main`.

### Fixed

- The workspace shell no longer gets stuck on the `Preparing the coding workspace...` fallback after an invalid hook call in `PerformanceMonitor`; token usage now subscribes through `useSyncExternalStore`, which keeps the chat/workspace surface interactive during boot.
- Local self-host loopback CSP allowances now target `localhost` and `127.0.0.1` without shipping invalid bracketed IPv6 `connect-src` entries, so browser previews keep the required local socket access without adding fresh CSP console errors.
- Browser calendar smoke coverage is now strict about generated-app success: the harness only passes once the requested unique token actually appears inside preview, and preview-status parsing now ignores detached `ELIFECYCLE` noise when the dev server is already clearly ready.
- The live chat client now sends the required same-origin CSRF header on `/api/chat`, which fixes the hosted `FREE` coding path on `alpha1`/`ahmad` where valid project requests were being rejected with `403 Forbidden` before generation ever started.
- The live release smoke now detects the current prompt surface generically instead of depending on an outdated placeholder string, so startup verification continues to work when the visible prompt copy changes.
- Runtime command capture now enforces bounded output buffers for shell/start/build flows, preventing long install/build logs from growing unbounded in memory and reducing browser freezes during heavy runs.
- Terminal stream piping now safely swallows expected shutdown errors during process recycling, reducing unhandled stream rejection noise that previously appeared during rapid runtime resets.
- Local follow-up repairs now keep the active preview dev server on a dedicated runtime shell instead of sharing the install/command shell, so iterative prompts can keep building on the current project without corrupting the live start session.
- Shell write guards now also evaluate normalized/rewritten commands (including JSON command envelopes), closing a bypass path where blocked redirections could slip through after command rewrites.
- Shell write blocking now distinguishes harmless sink redirections (`/dev/null`) from real file writes, preserving portable runtime file checks without weakening mutation safeguards.
- Artifact file writes now reject any path resolving outside the active workspace root, hardening runtime file actions against path traversal attempts.
- WebContainer heartbeat checks now prevent overlapping probes, reducing race conditions that could trigger duplicate recovery attempts under heavy filesystem load.
- Chat bootstrap model-fetch and secure API key hydration now cancel cleanly on unmount, eliminating stale async state updates during rapid navigation and provider switches.
- Hosted preview verification no longer hands half-rewritten starter apps to the runtime just because the active entry file was touched; runs now continue until the starter placeholder is actually replaced with real implementation code.
- Hosted runtime handoff now refuses to synthesize setup/start commands when the merged workspace still contains the fallback starter placeholder in the active entry file, which prevents broken preview loops that ended with “preview verification is still pending.”
- Hosted runtime handoff now also refuses to launch when the merged workspace still lacks a concrete primary app entry file (`src/App.*`, `app/page.*`, routed index entry, etc.), which prevents starter-plus-support-file partial outputs from being treated as runnable previews.
- The compact small-model build prompt now explicitly forbids introducing Tailwind/PostCSS or similar tooling without also adding the required dependencies/config in the same response, reducing half-configured starter mutations on the FREE path.
- Hidden continuation prompts now wait until the active chat stream has actually settled before dispatching, which prevents overlapping chat requests from racing each other and reduces disconnect/reconnect loops during long runs.
- Hosted FREE preview verification no longer auto-restores an older starter snapshot just because the browser briefly reported the fallback placeholder while the generated app files were already synced; starter-placeholder reporting is now ignored once the active workspace no longer contains the starter text.
- Generated app entry-file writes now resolve onto the active starter source file when the model picks a sibling JS/TS extension (`App.js` vs `App.tsx`, `main.jsx` vs `main.tsx`, etc.), which stops hosted Vite projects from leaving the real app in an inactive file while preview keeps showing the fallback starter.
- FREE/DeepSeek follow-up runs on existing projects no longer trust plain-English `start` actions as runnable shell commands; the backend now rejects prose handoffs and falls back to inferred project commands so preview can continue after the first prompt instead of stalling on a fake runtime command.
- Project memory is now scoped by a stable project-context id instead of one browser-global slot, so follow-up prompts stay attached to the current project/chat and do not bleed architecture/history across unrelated runs.
- Current-workspace context is now supplied deterministically even when context optimization is disabled, so follow-up prompts still know the active files and can build on the existing project state instead of re-guessing the workspace.
- Server-side “preview not yet verified” continuations now only trigger for real hosted-runtime sessions, so local/self-host runs stop looping into false recovery passes after generating a runnable project and can proceed into normal follow-up iteration.
- Hosted FREE preflight now emits explicit structured diagnostics for rate-limit, credits-exhausted, and unavailable failures, so server logs show the real upstream cause instead of collapsing everything into a generic availability error.
- Browser event logs no longer persist in cookies; they now live in local storage, which removes the oversized `eventLogs` cookie warnings and reduces client-side state churn.
- The chat status lane now lays out `Live Commentary` and `Technical Feed` side-by-side on wider screens and shrinks the active prompt surface, which stops the Firefox run view from collapsing into a dense stacked column during active generation.
- The self-host installer now retries and repairs common apt, dependency-install, build, Caddy, and service-start failures instead of exiting on the first recoverable error.
- Managed Cloudflare trial registry writes are now atomic and can recover from the private admin assignment records, so active-instance refresh waves no longer risk dropping live projects from the runtime registry during rollout.
- Runs that already emitted install/start commands but never reached a verified preview now replay those runtime commands through the workspace runner instead of falling back to another model continuation loop.
- Hosted FREE runs no longer force every project request through the client-side starter bootstrap path on hosted runtime, which restores direct coding/execution for generated app requests instead of trapping users on the fallback starter shell.
- The chat prompt surface no longer sits in a sticky overlay above the commentary/timeline stack after a run starts, so live agent updates remain readable instead of being hidden behind the prompt box.
- `https://admin.bolt.gives` now completes Let’s Encrypt issuance correctly after DNS becomes live, and the private operator panel is reachable over HTTPS on the server-hosted deployment.
- Tenant Admin sign-in on `https://admin.bolt.gives` now completes with a proper cookie-backed `303` document redirect, so the authenticated operator dashboard loads immediately after login instead of leaving the browser on the bootstrap sign-in view.
- The public `/managed-instances` page now uses the same scrollable app-shell layout as the rest of the server-hosted control plane, so long registration/operator content remains usable on live domains.
- Managed Cloudflare trial instances now persist and display the real Cloudflare-assigned `*.pages.dev` hostname instead of assuming the requested slug is always the live public URL.
- Self-hosted deployments no longer need to hard-code `admin.bolt.gives` in the shell; the app now respects the configured public admin/create URLs.
- `create.bolt.gives` now lands existing trial owners on a dedicated success page with the live URL, assigned hostname, expiry, and rollout details instead of effectively dropping them back into the registration form.
- Managed Cloudflare trial instances now bootstrap the hosted `FREE` provider through an authenticated relay path, so `DeepSeek V3.2` works immediately on trial instances without shipping the protected OpenRouter key into those Pages projects.
- Managed Cloudflare trial instances now provision the hosted FREE relay credential as a Pages secret on the trial project itself, and existing trial projects are refreshed onto the same path retroactively so live `*.pages.dev` instances stop reporting `FREE` as unconfigured.
- Hosted FREE relay requests are now verified against the local runtime service, so Pages-hosted surfaces and managed Cloudflare trials keep `DeepSeek V3.2` working even when the app worker itself does not carry the relay secret in-process.
- Existing live managed trial instances have been refreshed onto the same runtime-verified relay path retroactively, so clients do not need to enter their own API key to keep using the built-in FREE model.
- Hosted preview handoff no longer infers runtime commands from only the latest assistant delta; it now merges the active workspace snapshot before choosing setup/start commands, which prevents partial dependency installs like `npm install moment` from replacing the real project runtime and avoids stalled previews after stream interruptions.
- Hosted runtime no longer syncs partial streamed file fragments into the live Vite preview; source files now reach the hosted runtime only after the file action closes, preventing transient syntax errors from triggering rollback during follow-up prompts.
- Hosted preview verification now treats a recovered rollback as unhealthy when the latest generated files are no longer present in the runtime snapshot, so follow-up prompts continue with a repair pass instead of falsely reporting success from a stale restored preview.
- Browser calendar E2E now requires requested prompt and follow-up tokens to persist in the hosted runtime snapshot, not just appear briefly inside the preview iframe.
- Browser chat persistence is now initialized only in browser contexts with IndexedDB available, avoiding server-side `indexedDB is not available` errors during hosted Pages rendering.
- Hosted runtime preview autostart now consumes the managed command stream until a real `ready` event is emitted, so preview status cannot stay stuck at `starting` while the generated app is already serving.
- A static `robots.txt` is now shipped with the app so crawler probes do not route through the worker fallback during live smoke runs.
- Header preview/deploy controls now lazy-load after chat starts, preventing the initial browser chunk from importing `workbenchStore` before the workbench module has initialized.
- Hosted preview verification now waits through `restored` recovery states before deciding a run needs another model continuation, so a generated app that recovers to a healthy preview does not keep the first chat stream open and block follow-up prompts.
- Hosted preview handoff now requires a newly generated concrete implementation file before synthesizing setup/start commands, so scaffold-only `create-vite` responses and stale request snapshots stay in continuation instead of launching the fallback starter as if it were a finished project.
- Local workbench preview startup now syncs shell-created Vite source files before applying pre-start React entry repairs, and commented-out `export default` text no longer fools the repair pass into skipping a missing default export.
- Manual follow-up prompts now supersede queued Architect auto-heal attempts, and direct hosted-preview verification errors now trigger a repair continuation instead of letting an unhealthy follow-up run finish silently.
- Hosted FREE now defers client-side starter/Architect recovery to the server-side preview verifier, preventing hidden client continuations from racing manual follow-up prompts after a preview becomes healthy.
- Hosted FREE preview verification now applies generated file/start actions to the hosted runtime before waiting on preview health, so the server no longer verifies a half-synced workspace that only contains early package files.
- Hosted runtime command replay now finishes as soon as the managed runtime emits an `exit` event, even if the underlying transport stays open, preventing live `/api/chat` streams from idling after start command completion.
- Hosted runtime preview startup now probes the reserved managed preview port immediately instead of waiting for dev-server stdout, and package-only Vite workspaces are treated as incomplete so partial streams do not idle silently.
- Hosted runtime preview autostart now refuses package-only Vite workspaces before opening a command stream, so incomplete snapshots cannot hold the session lock and block the server from applying the finished generated files.
- Hosted runtime startup now repairs generated JSX buttons/spans that contain raw `<`/`>` text before Vite starts, avoiding a common DeepSeek parse failure that left otherwise valid projects unpreviewable.
- Hosted preview verification now keeps emitting explicit startup progress while the server waits for the managed preview to become healthy, which reduces silent websocket disconnects and makes long preview warm-ups visible in both the chat stream and the workspace.
- The Workspace preview now re-checks hosted preview state immediately when the iframe loads, instead of waiting for the old long reconcile interval, so generated apps replace the fallback starter much sooner on live domains.
- The live release smoke now prints stage-by-stage progress during long runs, making it obvious whether it is waiting for the prompt surface, commentary, preview readiness, or recovery.
- A new post-deploy browser health check now fails release validation if the live app serves hashed asset `404`s or never exposes the prompt surface after deploy.
- Managed-instance startup support and tenant-admin status views now surface the rollout-guard reason when the live runtime is stale, instead of silently advertising trial rollout as available.
- Public operator wording no longer exposes the old shared bootstrap password in the shipped UI or release notes; deployments now present operator credentials as server-managed state only.

## v3.0.8 (2026-04-04)

### Added

- Managed Cloudflare trials now require a registration profile before provisioning starts.
- Trial registration captures name, work email, company, role, phone, country, requested subdomain, and build intent from the public `/managed-instances` form.
- A private operator surface is now available at `https://admin.bolt.gives`, routing into the server-hosted admin panel.
- The admin panel now stores and shows:
  - registered client profiles
  - managed Cloudflare instance assignments mapped to client email
  - recent admin email or draft activity
- Admin can now compose outbound client email from the admin panel; if SMTP is not configured, the message is safely stored as a draft instead of being lost.

### Changed

- The managed Cloudflare trial flow is now registration-first instead of allowing anonymous provisioning attempts.
- The admin/operator control plane now treats `admin.bolt.gives` as the canonical operator URL.
- Managed trial metadata is mirrored into the private database-backed admin records whenever instances are provisioned, refreshed, suspended, or expired.
- The collaboration server now uses a local protocol implementation that matches the client stack and waits for persisted document restore before initial sync, fixing restart restore races.

### Fixed

- The admin Postgres integration no longer points at a non-existent database name on the live server.
- Collaboration persistence and restore now work reliably across server restarts instead of intermittently syncing an empty document state.
- The managed trial page now keeps showing the newly provisioned `Current instance` card even if the follow-up runtime session lookup lags behind the initial spawn response.

## v3.0.7 (2026-04-03)

### Added

- bolt.gives now ships a real managed Cloudflare trial-instance surface at `/managed-instances`.
- The runtime now exposes managed-instance control endpoints for:
  - support/config
  - session lookup
  - spawn
  - refresh
  - suspend
- Managed trial instances now track:
  - chosen subdomain
  - 15-day expiry
  - rollout metadata
  - deployment errors
  - runtime event history
- The release gate now includes a browser regression that verifies startup lands on the locked `FREE` provider with the `DeepSeek V3.2` model label already visible.

### Changed

- Managed trial-instance claims are now enforced in runtime instead of only in docs.
- One claimed client identity now maps to one managed instance, and the original browser session token now reuses that same instance instead of allowing a second hidden claim under a different email.
- The current release line is now `v3.0.7`, with `v3.0.8` opened as the next roadmap target.

### Fixed

- The locked hosted `FREE` model now renders directly as `DeepSeek V3.2` in the model selector even before async model metadata finishes loading, instead of briefly showing `Select model`.
- The committed live release smoke now targets the active generated app entry discovered from `index.html` and the module entry path, so preview break/recovery validation no longer mutates an unused fallback starter file.
- Live managed instances now always land back on the `Chat` surface on first load, even if a prior browser session last focused `Workspace`.
- Workspace activity no longer steals focus away from `Chat` as soon as files/preview events begin, so users can keep following commentary while a run starts.
- Sidebar navigation/history no longer depends on edge-hover behavior; the header icon and explicit opener button now open it directly and reliably.
- The terminal/workspace surface no longer crashes on stale `react-resizable-panels` state when terminal visibility changes.
- Provider/model bootstrap no longer throws when a browser only has partial saved provider settings; missing providers now stay enabled by default instead of breaking `/api/models`.

## v3.0.6 (2026-04-03)

### Added

- Tenant lifecycle now includes:
  - pending tenant creation
  - explicit tenant approval
  - invite-based onboarding
  - forced password reset via invite
  - disable/re-enable lifecycle metadata
- The release gate now boots the local runtime stack and runs the real live smoke path before release completion.
- The feature feed now surfaces the `v3.0.6` release to users after upgrade.

### Changed

- CodeMirror language packages now split into narrower per-language browser chunks instead of one broad `editor-language-core` payload.
- Terminal code now loads only when the terminal is actually opened inside the workspace instead of on every workspace boot.
- GitHub and GitLab deploy dialogs now load lazily, keeping export/deploy SDK weight off the startup path until users explicitly open those actions.
- Commentary heartbeats now derive from real runtime command, file, and latest-result events instead of generic keep-alive phrasing.
- Versioning/docs/runtime metadata now align on `v3.0.6`, with `v3.0.7` opened as the next roadmap target.

### Fixed

- Tenant user access now blocks pending and disabled tenants correctly on the runtime auth path.
- Tenant onboarding/reset flows now expose time-limited invite acceptance instead of relying only on direct password setting from the admin surface.
- Release validation now fails earlier if the local Pages/runtime stack cannot execute the committed doctor-app preview/recovery smoke path.

## v3.0.5 (2026-04-03)

### Added

- `Workspace` now includes a dedicated bottom `Workspace Activity` section with:
  - live commentary
  - execution transparency
  - technical timeline
  - explicit working/ready/standing-by status
- Tenant admin hardening now includes:
  - admin password rotation
  - tenant enable/disable controls
  - tenant/admin timestamps (`createdAt`, `updatedAt`, `lastLoginAt`)
  - password-reset / must-change-password state
- Tenant users now have a dedicated `/tenant` portal with:
  - sign-in
  - current account visibility
  - password rotation
- A committed live release smoke script now exists at `scripts/live-release-smoke.mjs` and is exposed via `pnpm run smoke:live`.

### Changed

- The app no longer force-switches users into `Workspace` the moment a run opens files or preview. `Chat` stays active by default so users can keep following commentary while work starts.
- Commentary heartbeat text is now phase-specific and less repetitive, with clearer `Key changes:` and `Next:` messaging instead of generic keep-alive filler.
- Remaining browser-weight hot spots were reduced further:
  - CodeMirror split more aggressively into core/theme/language buckets
  - chart/PDF settings surfaces now lazy-load through narrower action paths
  - workbench/editor/collaboration imports were untangled further from shared startup paths
- Client provider metadata is now sourced from a lightweight catalog instead of loading the full provider manager/provider SDK graph into the browser shell.
- Manual chunking now splits framework/runtime/LLM/editor domains into smaller buckets, reducing the shared startup burden on hosted users.
- Hosted preview reconciliation now waits longer between fallback polls and trusts recent server-pushed state first, reducing browser churn.

### Fixed

- Generated-app Workspace loads no longer crash on live hosted instances due to a browser-side CodeMirror chunk initialization failure; the editor payload now ships as one stable runtime chunk again.
- Artifact/action hydration is now resilient when workspace actions arrive slightly before the artifact store finishes registering, preventing early run races from collapsing the Workspace surface.
- Hosted doctor-scheduling generation on `https://alpha1.bolt.gives` now reaches a usable React appointment scheduling preview instead of dying on the starter-to-editor handoff.
- The `Workspace` surface now shows what the system is doing while preview/build work is still in progress, instead of leaving users on a silent file/preview area with no clear status.
- Tenant registry data is now normalized on load so older server-local tenant state gets upgraded safely instead of drifting across runtime versions.
- Server LLM execution paths (`stream-text`, summary generation, context selection, and `/api/llmcall`) now use the real provider implementations on the server while the client stays on lightweight metadata only.
- User-managed provider/API-key flows remain intact even after the client/provider-catalog split.

## v3.0.4 (2026-04-03)

### Added

- FREE now ships with one protected hosted OpenRouter route locked to `deepseek/deepseek-v3.2`, so fresh installs can start coding immediately without asking users to configure a key first.

### Changed

- The visible default hosted provider/model remains `FREE` + `DeepSeek V3.2`, and `FREE` now exposes only that single model option.
- The managed OpenRouter token path for FREE stays server-side only and is no longer paired with any hidden client-facing fallback route.
- Versioning/docs/runtime metadata now align on `v3.0.4`, with `v3.0.5` opened as the next roadmap target.

### Fixed

- Hosted FREE preflight no longer probes or silently routes to `qwen/qwen3-coder`; the app now behaves exactly like the UI suggests and fails explicitly if the protected DeepSeek route is unavailable.

## v3.0.3 (2026-03-30)

### Added

- Server-hosted `Tenant Admin` dashboard is available at `/tenant-admin`, with operator credentials managed privately on each deployment.
- Hosted preview health now includes a server-side `preview-status` path that tracks:
  - latest preview log lines
  - detected runtime alerts
  - healthy/error state
- Hosted preview state now streams over a compact server-side SSE feed so the browser can follow preview/recovery state changes without tight polling loops.
- Technical timeline rendering now virtualizes large feed windows so long runs do not keep every historical card mounted in the browser at once.
- Hosted preview status polling now derives the active runtime session directly from the live preview URL, so self-heal can follow the exact managed preview session even after restarts or stale client state.
- A live Playwright recovery smoke now generates a hosted app, intentionally corrupts it, and verifies end-to-end auto-recovery against `https://alpha1.bolt.gives`.

### Fixed

- Provider/model visibility is restored directly above the prompt box, and supported providers still expose user-managed API key controls.
- Sidebar access no longer depends on a tiny hover strip; the header toggle and left-edge opener make the menu reliably discoverable again.
- Dependency installation no longer hard-fails when the Playwright Chromium download is blocked by network/domain policy during `postinstall`; installs now continue with a warning unless `PLAYWRIGHT_INSTALL_REQUIRED=1` is explicitly set.
- Playwright postinstall now skips cleanly when the CLI is missing and writes its install marker directly, removing an unnecessary child-process `node -e` invocation.
- Non-fatal Playwright browser install failures now still write a marker so future installs do not repeatedly retry known-blocked browser downloads.
- `PLAYWRIGHT_INSTALL_REQUIRED` now treats common truthy values (`1`, `true`, `yes`, etc.) as strict mode and common false-like values (`0`, `false`, `no`, `off`) as non-strict.
- Locked file persistence now avoids duplicate `localStorage` writes for unchanged lock state, reducing UI-thread storage churn during repeated lock/unlock actions.
- File-store writes now reject paths outside the WebContainer workdir, preventing accidental out-of-workspace writes that could trigger unstable sync behavior.

- Fixed a JSX regression in `ColorSchemeDialog` that broke Vite/esbuild transforms (`Expected ")" but found "className"`), restoring the design palette dialog render path.
- `webcontainer.connect.$id` now boots a local WebContainer instance (with in-page status + boot error handling) instead of relying only on `setupConnect`.

- `ChatBox` no longer attempts to SSR the client-only web-search control, which restores hosted home-page rendering on `alpha1`/`ahmad` after the workspace merge.

### Changed

- Release/versioning/docs now align on the `v3.0.3` line, with `v3.0.4` opened as the next roadmap target.
- The workspace shell now lazy-loads more of the heavy client surfaces:
  - `Workbench`
  - `Preview`
  - `DiffView`
  - provider/settings/deploy/status surfaces
  - commentary/timeline/status panels
- Production builds now force production React/Scheduler bundles instead of accidentally inflating client chunks with development builds.
- Vite now uses explicit manual chunking for the main client subsystems:
  - `react-core`
  - `markdown-shiki`
  - `editor-codemirror`
  - `terminal-xterm`
  - `collaboration-yjs`
  - `git-export`
  - `charts-pdf`
  - `ui-vendor`
  - `llm-vendor`
- Collaboration configuration helpers now live outside the heavy Yjs client path, reducing the amount of collaboration code pulled into non-collab runtime surfaces.
- Editor loading is deferred harder: the editor shell is lazy-loaded and the heavier vscode theme payload now loads only when the editor is actually in use.
- Settings data/event-log surfaces now lazy-load their chart/PDF dependencies instead of front-loading them into the main settings/control-panel path.
- Markdown rendering now loads behind a lighter shell, and the heavier markdown/code/thought/artifact surfaces are deferred until they are actually needed.
- Runtime code, artifact shell blocks, tool invocation payloads, and diff lines now default to lightweight plain rendering instead of shipping client-side Shiki highlighting across the default chat/workspace path.
- Workbench export, repository push, and test/security scan integrations now lazy-load their heavy dependencies (`jszip`, `file-saver`, `@octokit/rest`, collaboration helpers, and test-security helpers) instead of inflating the default store bootstrap.
- Hosted preview error detection now prefers server runtime diagnostics instead of scraping iframe DOM state in the browser.
- Hosted preview polling now reads compact server status summaries and SSE updates instead of keeping more preview/error parsing logic in the client tab.
- Managed runtime sessions now preserve literal safe session ids instead of hashing them server-side, which keeps workspace sync, preview URLs, preview-status lookups, and Architect recovery on one identifier.
- Architect/self-heal now verifies hosted preview health on the server after each workspace mutation, so broken apps can auto-restore even when the browser never catches the transient failure overlay.
- UI theme polish now removes remaining purple accents in primary settings surfaces in favor of a consistent red/blue palette, with stronger top-rail glow styling and more transparent Chat/Workspace surface tabs.
- Red/blue glow colors are now centralized via theme variables and the heavier tab-rail effects are reduced/gated for accessibility/perf (`prefers-reduced-motion`, contrast-safe active tab fallback).
- Chat/Workspace tabs now keep explicit readable active-label colors, and the app now includes a global cursor-follow glow layer with tuned light-theme surface tokens so white mode has cleaner contrast and less harsh blocks.
- WebContainer connect responses now send `Cross-Origin-Embedder-Policy: require-corp` and `Cross-Origin-Opener-Policy: same-origin` so browser WebContainer boot can run under the required isolation model.

### Minor Features & Polish (Not as important)

- **UI Theme Polish**: Replaced the primary blue accent with a modern red-to-blue gradient theme, including transparent header tabs.
- **Editor Refinement**: Enhanced the CodeMirror editor panel with an inset card design for a premium glassmorphic feel.
- **Web IDE Integration**: Added an "Open in Web IDE" button to the header for quick access to `webcontainer.codes`.
- **Functional Runtime Scanner**: Added an active error monitor to the Workbench that intercepts runtime failures and automatically dispatches an auto-fix prompt to the AI agent.
- **E2B Sandbox Support**: Added cloud-hosted Linux sandbox as a WebContainer alternative, configurable via Settings → Cloud Environments.
- **Firecrawl Integration**: Added Firecrawl as a cloud alternative to the local Playwright web-browse server. Set `FIRECRAWL_API_KEY` env var or configure in Settings; automatic fallback to Playwright if Firecrawl is unavailable.
- **WebContainer Stability**: Added an auto-recovery manager and serialized file write queue to prevent WASM lockups during heavy scaffolding.
- **BoltContainer Runtime**: Added a custom-built WebContainer alternative with in-memory VFS, file watchers, E2B cloud command execution, and full drop-in API compatibility. Selectable via Settings → Cloud Environments → Runtime Engine.
- **Architect Error Recovery**: Added 5 new self-heal rules for common WebContainer errors (jsh command not found, missing node_modules, pnpm not found, dependency install failures, Python/Django unsupported).
- **Django/Python Support**: System prompts now guide the AI to use BoltContainer + E2B when users request Python/Django projects.
- **Auto-Install Rules**: System prompts now enforce mandatory dependency installation before running any commands.

### Planned

- Build the actual managed Cloudflare instance control plane described in `docs/cloudflare-managed-instances.md`.
- Move more preview/build/test execution off the browser and onto the server/runtime side.
- Add health-verified rollout and rollback handling for managed client instances.

## v3.0.2 (2026-03-28)

### Added

- Experimental Cloudflare managed-instance blueprint docs:
  - `docs/cloudflare-managed-instances.md`
  - `docs/cloudflare-managed-instances.sql`
- Top-of-README product section describing the planned one-client / one-instance Cloudflare service using a `6 GiB` Node runtime.
- A top-level tab shell that separates `Chat` from `Workspace`, so prompt/commentary stays isolated from files/preview/terminal and future product areas can live in their own tabs.

### Fixed

- Hosted `alpha1`, `ahmad`, and other managed instances now prefer the managed server-side runtime for installs, builds, dev servers, tests, preview hosting, and file sync instead of defaulting to the browser WebContainer path.
- Hosted preview iframes now refresh after server-side file syncs land, so generated apps replace the fallback starter without forcing the user to manually reload the preview.
- Managed instances now keep browser terminals in lightweight status-only mode instead of encouraging heavy interactive shells inside the client tab.
- Cloudflare Pages and preview deployments now resolve hosted FREE-provider credentials more reliably across Pages-style and Worker-style runtime contexts.
- If a public Pages runtime does not have the managed FREE secret locally configured, hosted FREE requests can now relay through the managed runtime instead of failing with a token error.
- Cloudflare Pages coding sessions now route collaboration/event websocket traffic to the managed collaboration backend instead of self-targeting `bolt-gives.pages.dev/collab`, which returned `404` and left long runs stalled behind heartbeat commentary without a stable preview.

### Changed

- Updated the release line to `v3.0.2`.
- README, roadmap, AGENTS instructions, and install docs now align on `v3.0.2` as the stable baseline and `v3.0.3` as the next target.
- `FEATURE_FEED` now surfaces the `v3.0.2` release to users after upgrade.
- Prompt/runtime guidance now assumes the managed hosted runtime first on live instances and treats WebContainer as the explicit fallback mode.
- The Cloudflare managed-instance design is now split honestly into:
  - a free experimental shared-runtime path
  - a future Pro path for dedicated `6 GiB` Cloudflare Containers
- The main app shell now behaves like real tabs, with the `Workspace` surface closable/reopenable and persisted between sessions.
- `main` now has a first-party Cloudflare Pages production deployment workflow so the Pages runtime can track the same release source-of-truth as GitHub, `alpha`, `alpha1`, and `ahmad`.
- Cloudflare Pages and preview deployments now default unsafe/stale collaboration socket settings back to the managed backend automatically, so an old stored URL can no longer poison new coding runs.

### Verified

- `pnpm run typecheck` passed.
- `pnpm run lint` passed.
- `pnpm test` passed.
- `pnpm run build` passed.
- Live browser E2E passed on `https://alpha1.bolt.gives` with OpenAI `gpt-5.4` by generating a React todo app whose hosted preview rendered the requested heading after server-side sync.

## v3.0.1 (2026-03-25)

### Added

- Hosted `FREE` moved to a managed OpenRouter route for `deepseek/deepseek-v3.2`.

### Changed

- The desktop chat rail is wider so the left-side prompt and progress column has more usable room during long runs.
- The visible default hosted provider/model remains `FREE` + `DeepSeek V3.2`.

### Verified

- `pnpm run typecheck` passed.
- `pnpm run lint` passed.
- `pnpm test` passed.
- `pnpm run build` passed.
- Targeted FREE-provider fallback regressions passed.

## v3.0.0 (2026-03-22)

### Added

- Preview runtime failures now route into Architect auto-repair detection so preview exceptions can be queued or repaired automatically instead of only surfacing a manual `Ask Bolt` path.
- Commentary now has a dedicated `Live Commentary` feed, separated from the technical timeline so progress updates stay visible while coding runs are active.

### Fixed

- Starter/bootstrap runs no longer stop at scaffold-only output; continuation logic now detects scaffold-only, bootstrap-only, and run-intent-without-start responses and forces the implementation to continue.
- Provider/model/API-key normalization now merges cookie, request-body, and runtime-environment keys before a run starts so invalid provider/key combinations fail less often.
- Absolute artifact file paths are normalized before writing into the workspace, preventing broken writes like `/home/project/home/project/...` on live instances.
- Local development startup now tolerates occupied helper ports by reusing healthy collaboration/web-browse sidecars instead of failing the entire dev boot.
- Stream recovery and commentary heartbeat behavior were tightened so healthy runs do not false-timeout after valid output is already streaming.
- Prompt library lookup now falls back safely instead of throwing on missing prompt identifiers.

### Changed

- Development, build, typecheck, and test scripts now run with an 18 GB Node heap baseline (`NODE_OPTIONS=--max-old-space-size=18432`) to stop local OOM failures during large builds.
- Release verification now includes a live OpenAI `gpt-5.4` browser E2E for actual app creation rather than only unit/integration gates.

### Verified

- `pnpm run typecheck` passed.
- `pnpm run lint` passed.
- `pnpm test` passed.
- `pnpm run build` passed.
- New UI regressions passed:
  - `app/components/chat/CommentaryFeed.spec.tsx`
  - `app/components/chat/ChatAlert.spec.tsx`
- Local dev smoke passed (`http://localhost:5174` loaded prompt box + model selector after helper-port reuse).
- Live E2E passed on `https://alpha1.bolt.gives` with OpenAI `gpt-5.4` by building a React appointment scheduler whose preview rendered the required heading `OpenWeb Clinic Scheduler`.
- Live smoke passed on `https://ahmad.bolt.gives` with OpenAI `gpt-5.4`.

## v1.0.3.1 (2026-02-25)

### Fixed

- Reduced browser freeze risk during long coding runs by batching interactive step events before UI state updates, including merge/dedupe logic for repeated stdout/stderr/telemetry bursts.
- Reduced preview thrash by disabling costly cross-tab preview/storage sync loops by default and preventing forced iframe reload cycles.
- Lowered noisy terminal stream pressure by normalizing ANSI/progress spam and throttling package-manager progress chatter in action timelines.
- Prevented unnecessary preview resets by only resetting iframe URL/path when the preview base URL actually changes.
- Trimmed non-architect timeline window size to lower render pressure on constrained client machines.

### Changed

- Updated prompt workstyle guidance to avoid unnecessary heavy commands in WebContainer sessions (for example repeated install/build loops) unless explicitly requested.
- Updated app and package version to `1.0.3.1`.

## v1.0.3 (2026-02-20)

### Added

- Provider history persistence and quick-switch UI in model selection so users can jump back to previously working providers.
- Structured Architect recovery timeline events (`diagnosis`, `attempt`, `outcome`, `blocked`) in execution feed.
- Architect knowledgebase signatures for additional high-frequency failures:
  - `npm-spawn-enoent`
  - `vite-missing-package-specifier`
  - `update-runtime-unenv-fs`
  - `cloudflare-api-auth-10000`

### Changed

- Execution timeline de-bloat:
  - increased retained event window for long runs with virtualization for large feeds
  - dedicated Architect cards separated from regular step events
- Updated app and package version to `1.0.3`.

### Verified

- `pnpm run typecheck` passed.
- `pnpm run lint` passed.
- `pnpm test` passed.
- Targeted E2E smoke passed on `https://alpha1.bolt.gives`:
  - strict model: OpenAI `gpt-5-codex`
  - standard model: OpenAI `gpt-4o`

## v1.0.2 (2026-02-17)

### Added

- Reliability guardrails for tool schemas with compatibility checks and strict-profile validation.
- `tool-schema-matrix` endpoint and regression tests for strict vs standard provider schema compatibility.
- Run-level acceptance instrumentation for:
  - commentary first-event latency
  - stall auto-recovery success rate
  - manual intervention rate
- Persistent project memory (scoped summary/context reuse) with stream event handoff.
- Minimal planner/worker sub-agent framework behind `BOLT_SUB_AGENTS_ENABLED`.

### Changed

- Execution transparency panel now surfaces acceptance metrics from live run events.
- Chat pipeline records/aggregates run metrics and uses project memory to prime build prompts.
- Updated app and package version to `1.0.2`.

### Fixed (2026-02-18 reliability patch)

- Shell command portability in Bolt Terminal:
  - `test -f <file>` checks are now rewritten to `ls <file> >/dev/null 2>&1` for `jsh` compatibility.
- Build-run continuity guardrail:
  - If a user asks to run/preview an app and the model only scaffolds without a `<boltAction type="start">`, the backend now auto-continues once to complete install/start actions.
- Prompt workstyle guidance now explicitly reinforces:
  - scaffold + install + start for run requests
  - portable file-check commands in shell steps
  - explicit reporting of created file paths in final responses (for doc-generation and web-browse workflows)
- Web browsing tool reliability:
  - blocked/invalid/private URLs in `web_browse` now return a structured tool result instead of hard-failing the whole chat run
  - upstream browse failures now return actionable failure summaries without crashing the request

### Fixed (2026-02-20 graceful integration noise patch)

- Supabase integration now runs only on explicit user actions:
  - removed mount-time Supabase stats/API-key fetch calls from chat connection initialization
  - kept manual connect/select/refresh flows intact
- Supabase UI icon rendering no longer depends on external `cdn.simpleicons.org` requests in chat components (no CORS icon noise).
- Update checks are now user-triggered only (manual `Check` in Update Manager); no background polling on chat load.
- `/api/update` loader now degrades gracefully with a non-error response when checks cannot run in the current runtime.
- Starter template release-fetch failures now degrade quietly to fallback behavior instead of noisy client console errors.

### Fixed (2026-02-20 plain-English commentary + starter fallback patch)

- Update manager now maps runtime-specific unenv/fs errors to a user-safe message instead of exposing low-level internals.
- Chat commentary now:
  - emits plain-English wording by default
  - sends automatic heartbeat updates at least every 60 seconds during long runs
  - keeps technical diagnostics out of default commentary cards
- Execution timeline now collapses checkpoint command diagnostics under `Technical details` so default output remains readable.
- Starter template loading now has built-in local fallback templates for every listed framework when remote template fetches fail.

### Verified (2026-02-20 patch)

- `pnpm run typecheck` passed.
- `pnpm run lint` passed.
- `pnpm test` passed.

### Verified

- `pnpm run typecheck` passed.
- `pnpm run lint` passed.
- `pnpm test` passed.
- `pnpm run build:highmem` passed.
- E2E smoke passed on `https://alpha1.bolt.gives`:
  - strict model: OpenAI `gpt-5-codex`
  - standard model: OpenAI `gpt-4o`

## v1.0.1 (2026-02-15)

### Fixed

- Image prompts now reach vision-capable models: images are sent via `experimental_attachments` and converted into core `image` parts server-side.

### Added

- Small-model prompt variant and automatic selection for constrained models in build mode.
- Smoke tests:
  - `scripts/smoke-vision.mjs` (vision model image prompt)
  - `scripts/smoke-small-model.mjs` (small model artifact/actions emission)
  - `scripts/smoke-multistep.mjs` (multi-step tool usage)

### Changed

- Chat now initializes MCP settings early so persisted `maxLLMSteps` (default 5) is applied reliably.
- Build command helper: `pnpm run build:highmem` sets Node heap to 6142 MB for CI/Cloud builds.

## v1.0.0 (2026-02-14)

bolt.gives is a collaborative AI coding workspace based on the upstream Bolt project.

### Added

- Real-time collaborative editing (Yjs + `y-websocket` compatible server), persisted to disk with inactive doc cleanup.
- Interactive step runner with structured events (`step-start`, `stdout`, `stderr`, `step-end`, `error`, `complete`) and UI feed.
- Session save/list/load/share via Supabase (`public.bolt_sessions`) with backward-compatible payload normalization.
- Agent workflow: Plan/Act modes with checkpoint confirm/stop/revert and per-step diffs.
- Model orchestrator for automatic model selection with transparency/logging.
- Performance monitor (CPU/RAM sampling + token usage tracking) with threshold recommendations.
- Deployment wizard: generate CI workflow files; rollback endpoint for Netlify/Vercel.
- Plugin manager + marketplace registry support.

### Changed

- Updated the header branding to use `public/boltlogo2.png` and removed the old `logo.png`.
- Introduced a build-time app version constant (`__APP_VERSION`) sourced from `package.json` and display it prominently in the header.
- Added a `/changelog` page and header link so the changelog is visible on the live site.

### Docs

- Updated `README.md` with screenshots and local dev instructions.
- Added `docs/fresh-install-checklist.md`.
