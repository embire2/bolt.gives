# Changelog

## v3.0.1 (2026-03-25)

### Added
- Hosted `FREE` now includes an internal OpenRouter fallback chain. If `deepseek/deepseek-v3.2` is unavailable upstream, bolt.gives silently retries with `qwen/qwen3-coder` without changing the visible client model selection.

### Changed
- The desktop chat rail is wider so the left-side prompt and progress column has more usable room during long runs.
- The visible default hosted provider/model remains `FREE` + `DeepSeek V3.2`.
- The hidden fallback model is not exposed in the provider/model picker and is only used by the managed server path.

### Verified
- `pnpm run typecheck` passed.
- `pnpm run lint` passed.
- `pnpm test` passed.
- `pnpm run build` passed.
- Targeted FREE-provider fallback regressions passed.

## v3.1.0 (in progress)

### Added
- Hosted instances can now expose a server-managed `FREE` provider that routes through a locked OpenRouter model without revealing the hosted API token to users.

### Changed
- The hosted `FREE` provider is now the default provider selection and is pinned to `DeepSeek V3.2`.
- The standard `OpenRouter` provider remains user-managed and continues to require the user's own OpenRouter API key for unrestricted model access.
- Hosted free-provider requests now fail fast with a clear retry/switch-provider message when OpenRouter rate-limits or temporarily blocks the upstream `deepseek/deepseek-v3.2` route.

### Security
- Server-managed provider credentials are no longer eligible for `/api/export-api-keys`, preventing hosted fallback/provider secrets from being serialized back to the browser.

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
