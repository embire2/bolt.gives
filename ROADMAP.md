# Roadmap

Last updated: 2026-02-19

This roadmap tracks the plan to ship `v1.0.3` in 7 days.

Status legend:
- `[x]` complete
- `[~]` in progress / partially shipped
- `[ ]` not started

Canonical release plan doc: `v1.0.3.md`

## Steps towards v1.0.3 - ETA: 7 days

### P0 Release Deliverables (Must ship)

1. Commentary Cards + Phase Model
- [ ] Normalize commentary event types and phase metadata.
- [ ] Render dedicated commentary cards separate from action/code rows.
- [ ] Show phase transitions: `Plan -> Doing -> Verifying -> Next`.

2. Enforced Commentary Format Contract
- [ ] Enforce concise live-update format server-side (`micro-updates`, numbered `Key changes:`, explicit `Next:`).
- [ ] Add regression tests for commentary format and phase correctness.

3. Sticky Working Footer
- [~] Keep active model/provider, current phase/step, elapsed time, action count, and recovery state always visible.
- [ ] Ensure footer remains accurate while scrolling and during long runs.

4. First-Class Checkpoint Events
- [ ] Surface checkpoint lifecycle events in the timeline (checkpoint created, install complete, preview ready, tests/deploy status).
- [ ] Link checkpoint events to related actions/files where possible.

5. Honesty Guardrails (No False Success)
- [ ] Block optimistic completion narration unless command/action exit status confirms success.
- [ ] Always show failure context: command, exit code, stderr snippet, and next recovery action.
- [ ] Add tests for false-positive success prevention.

6. Long-Run Performance De-bloat (Server-First)
- [ ] Reduce client-side bloat that causes slowdowns in longer projects.
- [ ] Move heavy operations to server execution paths where possible.
- [ ] Add telemetry for UI stall duration and client memory growth.

7. Enforced Node Memory Baseline (Install + Upgrade)
- [ ] Enforce Node memory floor `>=4096MB` for fresh installs and upgrades.
- [ ] Add preflight checks and auto-apply defaults for supported paths.

8. Git-Backed Auto-Update + One-Click Upgrade
- [ ] Detect new Git versions/tags on startup and interval.
- [ ] Show in-app update availability banner.
- [ ] Provide one-click update flow with logs, retry/rollback, and post-update version confirmation.

9. Architect Self-Heal + Safety Guard
- [~] Add `Architect` diagnosis + auto-heal framework for known build/runtime failures.
- [ ] Expand Architect knowledgebase coverage for top JS/Vite/React/package-manager failure signatures.
- [ ] Ensure Architect auto-heal always respects autonomy mode and safety policy.

10. Cost Estimation Accuracy Across Providers
- [~] Normalize usage fields from multiple provider response shapes.
- [ ] Verify non-zero, accurate estimates for strict and standard providers in UI.
- [ ] Add regression tests for usage-to-cost calculation paths.

11. Provider/Model/API Key Session Persistence
- [~] Persist latest working API key/provider/model selection per instance.
- [ ] Auto-restore latest working selection on revisit.
- [ ] Preserve provider history and allow reliable switching back to previous working providers.

### P1 Stretch Deliverables (Ship if stable)

1. Commentary verbosity controls by autonomy mode.
2. Expand/collapse controls for dense commentary runs.
3. Export commentary transcript with structured phases.
4. Additional polish for timeline readability under long sessions.

## Acceptance Criteria (Release Gate)

1. Commentary first event appears within 2 seconds of run start.
2. During active runs, meaningful commentary updates appear continuously.
3. Every major action includes purpose and observed outcome.
4. Failure states include command, exit code, stderr snippet, and next recovery step.
5. Sticky footer remains visible and accurate during execution.
6. No run emits final success when a critical action failed.
7. Long-run sessions remain responsive without severe client-side stalls.
8. Fresh install and upgrade enforce Node memory baseline `>=4096MB`.
9. Update monitor detects newer versions and one-click update completes safely.
10. Architect catches and auto-heals known high-frequency failures without user intervention.
11. API key/provider/model selections persist and restore reliably.
12. Cost estimate is non-zero when usage exists and remains consistent with provider usage.

## Validation Plan

- `pnpm run typecheck`
- `pnpm run lint`
- `pnpm test`
- E2E smoke on `https://alpha1.bolt.gives` (strict provider path, OpenAI Codex class model)
- E2E smoke on `https://ahmad.bolt.gives` (standard provider path)
- E2E task flow: scaffold Node/React app, run, verify preview, and verify commentary/recovery behavior
- E2E web tools flow: `web_search` + `web_browse` + URL guardrails + schema compatibility
- Cost/persistence checks: provider + model + API key persistence and non-zero cost after usage

## Release Exit Checklist

- [ ] All P0 deliverables completed or explicitly deferred with risk note
- [ ] Acceptance criteria met
- [ ] E2E smoke passes on both live domains
- [ ] `CHANGELOG.md` updated
- [ ] `README.md` and `v1.0.3.md` updated
