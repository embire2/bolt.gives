# Roadmap

Last updated: 2026-03-26

Status legend:
- `[x]` complete
- `[~]` in progress / partially shipped
- `[ ]` not started

Latest shipped baseline:
- [x] `v3.0.1` hosted FREE fallback chain (`DeepSeek V3.2` -> hidden `qwen/qwen3-coder`) plus wider desktop prompt rail.

Release planning now tracks the live `v3.0.x` line directly. The old `v1.0.4` label is retired.

## v3.0.2 - Self-Host Install + Runtime Reliability

Release theme: make the open-source build easy to install, easy to run, and predictable on modest hardware.

Non-negotiable guardrails:
- [ ] bolt.gives remains open source and free to self-host/use.
- [ ] bolt.gives core requires no mandatory database setup.
- [ ] Databases stay optional for user projects and optional integrations only.

### P0 Deliverables

1. Installer and self-host documentation
- [x] One-command Ubuntu installer that installs dependencies, clones/updates the repo, prepares `.env.local`, builds the app, and installs systemd services.
- [x] Installer-generated build/runtime path validated with a 4 GB Node heap baseline.
- [x] README and fresh-install checklist updated to prefer the installer path.
- [ ] Add unattended installer smoke coverage in CI.

2. Zero-infra core runtime guarantee
- [ ] Core runtime boots and runs with filesystem persistence only.
- [ ] Optional integrations (Supabase/cloud sessions) remain opt-in and non-blocking.
- [ ] Add no-db startup regression tests.

3. Hosted FREE provider reliability
- [x] Server-side hosted FREE token path with no browser exposure.
- [x] Visible default FREE route pinned to `DeepSeek V3.2`.
- [x] Silent hosted fallback chain to `qwen/qwen3-coder`.
- [ ] Add upstream cooldown/error-budget metrics so rate-limit bursts are visible to operators.

4. Core-path truthfulness
- [ ] Do not report success until the requested app is actually running in preview.
- [ ] Auto-promote preview/runtime errors into Architect repair without losing context.
- [ ] Add regression tests for starter fallback continuation and preview verification.

5. Commentary and layout polish
- [~] Commentary is visible and separated from technical events.
- [ ] Finish feed scrolling, truncation, and mobile/tablet layout fixes across all panes.
- [ ] Add cadence tests so user-visible progress never goes silent for more than 60 seconds.

6. Release-gate automation
- [ ] Automate dual-domain smoke checks for `alpha1` and `ahmad`.
- [ ] Add screenshot/version assertions so stale assets are caught before release.
- [ ] Add no-cache and default-model live verification to the release gate.

### v3.0.2 Release Metrics

1. Fresh Ubuntu installer success rate >= 95%.
2. Zero-db startup success rate >= 95%.
3. Commentary first event <= 2s and max user-visible progress gap <= 60s.
4. Preview verification false-success rate = 0.
5. Live smoke must pass on both:
   - `https://alpha1.bolt.gives`
   - `https://ahmad.bolt.gives`

## v3.0.3 - Server-First Execution + Collaboration

Release theme: move heavy lifting off the user's browser and prepare the platform for isolated multi-user collaboration.

### P0 Deliverables

1. Server-first heavy execution
- [ ] Move preview/build/test workloads that still depend on the browser onto server-side workers where feasible.
- [ ] Reduce client-side memory pressure during long sessions.
- [ ] Add stall/memory telemetry tied to concrete UI recovery actions.

2. First-party template packs
- [ ] Maintained templates for common stacks with proven run/build scripts.
- [ ] CI and live E2E smoke coverage for each first-party template.

3. Client-hosted isolated instance kit
- [ ] Repeatable isolated deployment/upgrade runbook.
- [ ] Per-instance workspace and config isolation.
- [ ] Health checks and rollback flow.

4. Optional Teams add-on
- [ ] Feature-flagged team mode (`BOLT_TEAMS_ENABLED`).
- [ ] Roles and permissions (`Owner/Admin/Editor/Viewer`) with server-side enforcement.
- [ ] Invites and project-level access control.

5. Collaboration audit trail
- [ ] Append-only audit events for critical actions.
- [ ] Timeline visibility and export support.

6. Architect v2
- [~] Expand failure signatures and preflight detection coverage.
- [ ] Add confidence-scored recovery paths and mode-aware safe auto-fixes.
- [ ] Keep recovery reporting plain-English by default with expandable technical detail.

7. Cost and update integrity
- [ ] Ensure non-zero cost when usage exists across providers.
- [ ] Show `unknown` instead of false `$0` when provider usage is unavailable.
- [ ] Add stable/alpha update channels with retry/rollback logs and health verification.

### v3.0.3 Release Metrics

1. Scaffold-to-preview success rate >= 90% on first-party templates.
2. Architect known-failure auto-recovery success >= 70%.
3. Long-run browser stall rate reduced materially versus `v3.0.1` baseline.
4. Cost estimation pass rate >= 98% for provider regression suite.
5. Multi-instance update success rate >= 95% with verified rollback on failure.

## Validation Plan

- `pnpm run typecheck`
- `pnpm run lint`
- `pnpm test`
- installer smoke suite
- template smoke suite
- strict + standard model E2E on `https://alpha1.bolt.gives`
- strict + standard model E2E on `https://ahmad.bolt.gives`
- clean Ubuntu no-db startup/install E2E
- multi-instance update/rollback E2E

## Completed baseline (v3.0.1 and earlier)

- [x] Commentary Cards + Phase model
- [x] Commentary format contract + tests
- [x] Sticky execution footer
- [x] Checkpoint timeline events
- [x] Honesty guardrails
- [x] Long-run de-bloat + telemetry
- [x] Node memory baseline enforcement
- [x] Git-backed one-click updates
- [x] Architect self-heal foundations
- [x] Cost estimator normalization
- [x] provider/model/key persistence
