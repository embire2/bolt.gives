# Changelog

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
