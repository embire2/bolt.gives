# Upstream Backport Plan (One Feature Per PR)

This repo is based on `stackblitz-labs/bolt.diy`. If we decide to upstream changes, keep PRs small and focused.

## Proposed PR Breakdown

1. `feat: add realtime collaboration server (yjs)`
   - Add `scripts/collaboration-server.mjs` (Yjs + y-websocket server).
   - Client integration: bind editor doc to Y.Doc per file, default `ws://localhost:1234`.
   - Tests: multi-client sync, persistence restore after restart, inactivity cleanup.

2. `feat: add interactive step runner with streaming events`
   - Add `InteractiveStepRunner` class + event schema.
   - Stream events over WebSocket when available.
   - UI: render recent events feed with clear action.
   - Tests: event ordering, stop-on-error.

3. `feat: add session manager (supabase) with share links`
   - Add session persistence API (`/api/sessions`) + payload normalization.
   - Add UI save/resume/share controls + share-link restore.
   - Tests: save/list/load/share against real Supabase table (runIf env present) + backward-compat payload tests.

4. `feat: add plan/act workflows with checkpoints and diffs`
   - Parse plan steps, allow approval, execute steps via runner.
   - Checkpoint UI with confirm/stop/revert; show diffs.
   - Tests: plan parsing, checkpoint state machine, diff formatting.

5. `feat: add test & security automation (lint/audit/test + stubs)`
   - Generate test stubs for new files.
   - Add "Test & Scan" flow + error hints.
   - Tests: stub generation, runner execution, UI reporting.

6. `docs: add release checklist and fresh install verification`
   - Add `v1.0.0.md` checklist and `docs/fresh-install-checklist.md`.
   - Document secrets hygiene and verification commands.

## General Rules
- One PR, one feature: avoid bundling unrelated refactors.
- No secrets in commits/PR text/logs/screenshots.
- Gate before PR: `pnpm run typecheck`, `pnpm run lint`, `pnpm test`.

