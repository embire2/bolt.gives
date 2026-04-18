# Roadmap

Last updated: 2026-04-17

Status legend:

- `[x]` complete
- `[~]` in progress / partially shipped
- `[ ]` not started

Current stable release:

- [x] `v3.0.8`

Next release target:

- [~] `v3.0.9`

## v3.0.8 - Shipped Baseline

Release theme: move the hosted product onto a real server-first runtime, stand up the private operator surface, and make managed Cloudflare trial instances real instead of aspirational.

### Shipped in v3.0.8

1. Hosted runtime and browser offload

- [x] Hosted instances now default to the managed server runtime for install/build/dev/test/preview flows.
- [x] Preview status and recovery now come from server-side status/SSE instead of tight browser polling.
- [x] Preview breakage now routes into server-side self-heal and last-known-good restore.
- [x] Live release smoke covers generated-app success plus intentional preview break/recovery.

2. Managed FREE provider

- [x] Hosted `FREE` is locked to `deepseek/deepseek-v3.2`.
- [x] Hosted OpenRouter credentials stay server-side only.
- [x] Managed trial instances inherit the hosted FREE path through a protected relay, not a browser-visible key.

3. Cloudflare managed trials

- [x] `/managed-instances` is a real registration-first provisioning surface.
- [x] One-client / one-instance enforcement is implemented in runtime.
- [x] Managed instances now persist the real Cloudflare-assigned hostname and private client profile linkage in the operator panel.
- [x] `admin.bolt.gives` now exposes the private operator surface for profiles, assignments, and admin email activity.

4. Self-host packaging

- [x] Installer supports custom app/admin/create domains.
- [x] Installer provisions local PostgreSQL and Caddy-managed HTTPS.
- [x] Self-hosted installs can expose the same public `create` and `admin` flows as the hosted service.

## v3.0.9 - Launch Plan

Release theme: make bolt.gives launch-safe for daily use by tightening prompt-to-preview reliability, operator controls, self-host resilience, and release observability.

### P0 Launch Blockers

1. Prompt-to-preview reliability

- [~] Keep `Chat` and `Workspace` status explicit during generation so users always know whether the system is scaffolding, installing, starting, ready, or repairing.
- [~] Remove remaining starter/workspace hydration ambiguity on generated-app flows, including rejecting prose-only runtime handoffs on follow-up prompts and resolving generated entry-file writes onto the active starter file.
- [~] Ignore stale fallback-starter detections once the active workspace files no longer contain the starter placeholder, so hosted preview recovery does not roll back valid generated apps.
- [~] Prevent hidden continuation/recovery prompts from overlapping an active stream, so transport retries do not cascade into browser-side reconnect loops.
- [~] Infer setup/start handoff commands from the merged workspace snapshot instead of the latest assistant delta, so preview recovery reuses the real project runtime after a disconnected or interrupted stream.
- [ ] Keep preview success/failure criteria strict so the app only reports success after a usable preview is verified.
- [~] Fail release verification when post-deploy browser health detects missing hashed assets or a non-interactive prompt shell after rollout.

2. Commentary quality and transparency

- [~] Derive commentary from real runtime steps, files, commands, and recovery events.
- [ ] Eliminate remaining generic keep-alive phrasing.
- [ ] Keep the same status model visible in both `Chat` and `Workspace` so progress is never hidden behind the active pane.

3. Browser-weight reduction and server offload

- [~] Continue cutting the remaining heavy browser chunks (`editor`, `pdf`, `git`, `terminal`).
- [ ] Push more preview/log reconciliation state entirely to the server.
- [ ] Keep browser runtime surfaces thin enough that longer sessions no longer degrade visibly on lower-end machines.

4. FREE / managed-instance reliability

- [~] Keep `FREE` + `DeepSeek V3.2` reliable across hosted, Pages, and managed instances.
- [~] Keep public registration and operator surfaces visually readable in both light and dark themes, especially `create.bolt.gives` and `admin.bolt.gives`.
- [~] Keep registration, private client profile capture, filtered operator outreach, and one-client / one-instance enforcement aligned across the managed-instance surfaces.
- [ ] Add health-verified refresh and rollback for managed Cloudflare trial updates.
- [~] Refuse managed-instance rollout when the live runtime checkout is behind `origin/main`, and surface that guard state in the operator/admin views.
- [ ] Surface deployment history, last good SHA, and rollback outcomes to the operator panel.

5. Tenant and operator hardening

- [ ] Replace the bootstrap-only admin/tenant baseline with production-safe account and RBAC rules.
- [ ] Add approval history, invite lifecycle, and auditable state transitions.
- [ ] Add safer admin credential rotation and clearer operator session management.
- [~] Keep operator email delivery self-serve: SMTP transport is now configurable in `admin.bolt.gives`, with the next step being test-delivery verification and stronger operator auth around transport changes.

6. Self-host installer resilience

- [~] Keep self-host install interactive for domains and local PostgreSQL credentials.
- [ ] Install both PostgreSQL server and client tooling (`psql`) as part of the supported VPS baseline.
- [ ] Recover automatically from common apt, dependency, build, and service-start failures instead of exiting on the first error.
- [ ] Add a repeatable no-db and full-db installer smoke path to release validation.

7. Template and request reliability

- [ ] Ship first-party templates for the most common requested stacks.
- [ ] Add CI smoke coverage for those templates.
- [ ] Reduce the number of “empty scaffold / starter only” outcomes on real user requests.

8. Release visibility and operator observability

- [ ] Add capacity visibility for managed trial usage and expiry.
- [ ] Add deployment history and last rollout result to the admin surface.
- [ ] Make release smoke a hard pre-deploy gate for hosted and managed-instance updates.
- [ ] Add broadcast communication controls and moderation for the Shout Out Box so operators can manage abuse/reporting without exposing secrets.

### P1 Improvements

1. Teams and collaboration

- [ ] Teams mode with RBAC and shared project ownership.
- [ ] Collaboration audit trail and operator export.

2. Additional runtime hardening

- [ ] Broader Architect recovery signatures beyond preview restore.
- [ ] More bounded retry/recovery flows for dependency and dev-server failures.

3. Product polish

- [ ] Cleaner operator email workflows.
- [ ] Better first-run education for hosted and self-hosted users.
- [ ] Additional bundle budgets in CI so browser weight cannot silently regress.

## v3.0.9 Release Metrics

- [ ] First prompt-to-preview success rate >= 90% on the first-party template set.
- [ ] Commentary first visible update <= 2s on hosted runs.
- [ ] No hidden agent actions: critical execution state always visible in `Chat` or `Workspace`.
- [ ] Managed Cloudflare refresh path is health-verified and reversible.
- [ ] Installer success rate >= 95% on the validated Ubuntu VPS baseline.
- [ ] No shared browser startup chunk exceeds the agreed budget.

## Required Validation Before Release

- `bash -n install.sh`
- `pnpm run typecheck`
- `pnpm run lint`
- `pnpm test`
- `pnpm run build`
- `pnpm run e2e:free-startup`
- `pnpm run smoke:live`
- live browser E2E on `https://alpha1.bolt.gives`
- smoke on `https://ahmad.bolt.gives`
- smoke on `https://bolt-gives.pages.dev`
- operator/admin E2E on `https://admin.bolt.gives`
- installer smoke on a fresh Ubuntu VPS path
