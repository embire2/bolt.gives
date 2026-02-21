# Roadmap

Last updated: 2026-02-21

Status legend:
- `[x]` complete
- `[~]` in progress / partially shipped
- `[ ]` not started

Canonical release plan docs:
- `v1.0.3.md` (completed)
- `v1.0.4.md` (current target)

## Steps towards v1.0.4

Release theme: private collaboration and client-hosted isolation without compromising open-source freedom.

Non-negotiable guardrails:
- [ ] bolt.gives remains open source and free to self-host/use.
- [ ] bolt.gives core requires no mandatory database setup.
- [ ] Databases stay optional for user projects and optional integrations only.

### P0 Release Deliverables (Must ship)

1. Zero-Infra Core Runtime Guarantee
- [ ] Core runtime boots and runs with filesystem persistence only.
- [ ] Optional integrations (Supabase/cloud sessions) remain opt-in and non-blocking.
- [ ] Add no-db startup regression tests.

2. Client-Hosted Instance Kit
- [ ] Repeatable isolated deployment/upgrade runbook.
- [ ] Per-instance workspace and config isolation.
- [ ] Health checks and rollback flow.

3. Teams Add-on (Optional)
- [ ] Feature-flagged team mode (`BOLT_TEAMS_ENABLED`).
- [ ] Roles and permissions (`Owner/Admin/Editor/Viewer`) with server-side enforcement.
- [ ] Invites and project-level access control.

4. Collaboration Audit Trail
- [ ] Append-only audit events for critical actions.
- [ ] Timeline visibility and export support.

5. Architect v2 Self-Heal + Safety Guard
- [ ] Expand failure signatures and preflight detection coverage.
- [ ] Mode-aware safe auto-fix boundaries and recovery confidence.
- [ ] Clear recovery reporting in plain English.

6. Commentary v2
- [ ] Keep meaningful progress updates visible during long runs.
- [ ] Plain-English default with optional technical detail expansion.
- [ ] Contract tests for commentary format and cadence.

7. First-Party Template Packs
- [ ] Maintained templates for common stacks with proven run/build scripts.
- [ ] Template smoke tests in CI and live E2E.

8. Long-Run Performance and Stability
- [ ] Continue server-first offloading for heavy operations.
- [ ] Keep timeline/feed responsive in long sessions.
- [ ] Add operational telemetry for stalls and memory growth.

9. Cost/Usage Integrity
- [ ] Ensure non-zero cost when usage exists across providers.
- [ ] Explicit unknown usage state instead of false `$0`.
- [ ] Provider mapping regression tests.

10. Safe Updates Across Multiple Instances
- [ ] Stable/alpha update channels per instance.
- [ ] One-click update with retry/rollback logs and health verification.

### P1 Stretch Deliverables (Ship if stable)

1. Lightweight policy engine for instance safety profiles.
2. Workspace snapshot/restore automation.
3. Operator dashboard for instance health/recovery/update visibility.
4. Connector/plugin stability and fallback hardening.

## Release Metrics (v1.0.4 Gate)

1. Zero-infra install success rate >= 95%.
2. Scaffold-to-preview success rate >= 90% on first-party templates.
3. Commentary first event <= 2s and max progress gap <= 60s.
4. Architect known-failure auto-recovery success >= 70%.
5. False-success rate on failed critical actions = 0.
6. Cost estimation pass rate >= 98% for provider regression suite.
7. Update success rate >= 95% with validated rollback on failure.

## Validation Plan

- `pnpm run typecheck`
- `pnpm run lint`
- `pnpm test`
- template smoke suite
- strict + standard model E2E on `https://alpha1.bolt.gives`
- strict + standard model E2E on `https://ahmad.bolt.gives`
- clean Ubuntu no-db startup/install E2E
- multi-instance update/rollback E2E

## Steps towards v1.0.3 - completed

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
