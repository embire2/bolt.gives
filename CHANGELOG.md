# Changelog

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
