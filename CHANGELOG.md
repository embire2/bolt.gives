# Changelog

## Unreleased (`v3.0.7` in progress)

### Fixed

- The committed live release smoke now targets the active generated app entry discovered from `index.html` and the module entry path, so preview break/recovery validation no longer mutates an unused fallback starter file.
- Live managed instances now always land back on the `Chat` surface on first load, even if a prior browser session last focused `Workspace`.
- Workspace activity no longer steals focus away from `Chat` as soon as files/preview events begin, so users can keep following commentary while a run starts.
- Sidebar navigation/history no longer depends on edge-hover behavior; the header icon and explicit opener button now open it directly and reliably.
- The terminal/workspace surface no longer crashes on stale `react-resizable-panels` state when terminal visibility changes.
- Provider/model bootstrap no longer throws when a browser only has partial saved provider settings; missing providers now stay enabled by default instead of breaking `/api/models`.

### Planned

- Keep trimming the remaining editor/PDF/git/terminal payloads until the startup path fits explicit CI budgets.
- Make prompt-to-preview lifecycle states more explicit in both `Chat` and `Workspace`.
- Expand tenant lifecycle from the server-local registry into production-safe accounts, roles, audit, and managed-instance enforcement.
- Build the managed Cloudflare spawn/update control plane and rollback verification.

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

- Bootstrap `Tenant Admin` dashboard for server-hosted instances at `/tenant-admin`, with default bootstrap credentials `admin / admin`.
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
