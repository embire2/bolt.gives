# Roadmap

Last updated: 2026-03-28

Status legend:

- `[x]` complete
- `[~]` in progress / partially shipped
- `[ ]` not started

Latest shipped baseline:

- [x] `v3.0.2` Cloudflare managed-instance blueprint, Pages FREE-provider relay fixes, and release-line cleanup.

Release planning now tracks the live `v3.0.x` line directly. The old `v1.0.4` label is retired.

## v3.0.2 - Shipped Baseline

Release theme: ship the installer-first baseline, stabilize hosted FREE routing, and document the Cloudflare managed-instance architecture honestly.

Non-negotiable guardrails:

- [x] bolt.gives remains open source and free to self-host/use.
- [x] bolt.gives core requires no mandatory database setup.
- [x] Databases stay optional for user projects and optional integrations only.

### Shipped items

1. Installer and self-host documentation

- [x] One-command Ubuntu installer that installs dependencies, clones/updates the repo, prepares `.env.local`, builds the app, and installs systemd services.
- [x] Installer-generated build/runtime path validated with a 4 GB Node heap baseline.
- [x] README and fresh-install checklist updated to prefer the installer path.
- [ ] Add unattended installer smoke coverage in CI.

2. Hosted FREE provider reliability

- [x] Server-side hosted FREE token path with no browser exposure.
- [x] Visible default FREE route pinned to `DeepSeek V3.2`.
- [x] Silent hosted fallback chain to `qwen/qwen3-coder`.
- [x] Cloudflare Pages / preview relay support for hosted FREE when the preview runtime does not have the managed secret locally configured.

3. Experimental Cloudflare managed-instance blueprint

- [x] Repo-level blueprint for one-client / one-instance managed Cloudflare instances.
- [x] Free experimental path documented as a no-cost shared Cloudflare runtime.
- [x] Explicit `6 GiB` Node sizing path documented via Cloudflare Containers `standard-2` for the future Pro / dedicated tier.
- [x] D1 schema for tenancy, rollout state, and audit events.
- [x] Automatic update model documented with `main` as the git source of truth.

4. Commentary / release communication

- [x] Release line and docs aligned on `v3.0.2`.
- [x] Feature feed updated so users see the `v3.0.2` release summary after upgrade.
- [x] Main shell split into top-level `Chat` / `Workspace` tabs with closable workspace persistence.
- [x] GitHub-to-Cloudflare Pages production deployment workflow added so `main` can drive the Pages release path directly.

## v3.0.3 - Managed Control Plane + Server-First Execution

Release theme: move heavy lifting off the browser, implement the actual managed Cloudflare spawn control plane, and harden collaboration/isolation.

### P0 Deliverables

1. Server-first heavy execution

- [ ] Move preview/build/test workloads that still depend on the browser onto server-side workers where feasible.
- [ ] Reduce client-side memory pressure during long sessions.
- [ ] Add stall/memory telemetry tied to concrete UI recovery actions.

2. Managed Cloudflare instance control plane

- [ ] Implement the public spawn API Worker.
- [ ] Enforce one client / one instance in runtime, not just in docs/schema.
- [ ] Use Durable Object provisioning locks to collapse duplicate spawn attempts.
- [ ] Implement the free experimental shared-runtime path first.
- [ ] Queue or reject new spawns cleanly when free capacity is exhausted.
- [ ] Register routes and return the existing instance on duplicate requests.
- [ ] Roll updates from `main` to active instances automatically.
- [ ] Add rollout health checks and rollback support.
- [ ] Add the dedicated `standard-2` (`6 GiB`) container path as the future Pro tier.

3. First-party template packs

- [ ] Maintained templates for common stacks with proven run/build scripts.
- [ ] CI and live E2E smoke coverage for each first-party template.

4. Client-hosted isolated instance kit

- [ ] Repeatable isolated deployment/upgrade runbook.
- [ ] Per-instance workspace and config isolation.
- [ ] Health checks and rollback flow.

5. Optional Teams add-on

- [ ] Feature-flagged team mode (`BOLT_TEAMS_ENABLED`).
- [ ] Roles and permissions (`Owner/Admin/Editor/Viewer`) with server-side enforcement.
- [ ] Invites and project-level access control.

6. Collaboration audit trail

- [ ] Append-only audit events for critical actions.
- [ ] Timeline visibility and export support.

7. Architect v2

- [~] Expand failure signatures and preflight detection coverage.
- [ ] Add confidence-scored recovery paths and mode-aware safe auto-fixes.
- [ ] Keep recovery reporting plain-English by default with expandable technical detail.

8. Cost and update integrity

- [ ] Ensure non-zero cost when usage exists across providers.
- [ ] Show `unknown` instead of false `$0` when provider usage is unavailable.
- [ ] Add stable/alpha update channels with retry/rollback logs and health verification.

### v3.0.3 Release Metrics

1. Scaffold-to-preview success rate >= 90% on first-party templates.
2. Architect known-failure auto-recovery success >= 70%.
3. Long-run browser stall rate reduced materially versus `v3.0.1` baseline.
4. Cost estimation pass rate >= 98% for provider regression suite.
5. Multi-instance update success rate >= 95% with verified rollback on failure.
6. Managed Cloudflare spawn returns the same active instance on duplicate client requests 100% of the time.

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

## Completed baseline (v3.0.2 and earlier)

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
