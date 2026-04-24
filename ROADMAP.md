# Roadmap

Last updated: 2026-04-24

Status legend:

- `[x]` complete
- `[~]` in progress / partially shipped
- `[ ]` not started

Current stable release:

- [x] `v3.0.9`

Next release target:

- [~] `v3.1.0`

## v3.0.9 - Shipped Baseline

Release theme: make bolt.gives reliable enough for daily hosted use by hardening prompt-to-preview, follow-up context, managed runtime handoff, and release validation.

### Shipped in v3.0.9

1. Prompt-to-preview reliability

- [x] Hosted `FREE` stays locked to `deepseek/deepseek-v3.2` through the protected server-side runtime path.
- [x] `/api/chat` uses the required same-origin CSRF header on hosted surfaces, so live project creation does not fail at request start.
- [x] Generated hosted files are applied to the managed runtime before preview verification, so health checks inspect the actual current project instead of partial package-only state.
- [x] Hosted runtime command replay finishes on the runtime `exit` event even when transport streams stay open.
- [x] Reserved preview ports are probed immediately, and package-only Vite snapshots are classified as incomplete before they can idle the stream.
- [x] Hosted preview autostart refuses package-only Vite workspaces before opening a command stream, preventing incomplete snapshots from holding the session operation lock.
- [x] Hosted runtime waits for completed file actions before syncing source into Vite, preventing partial streamed code from triggering preview rollback.
- [x] Starter-placeholder detections are ignored once the active workspace no longer contains starter placeholder content, preventing valid generated apps from being rolled back.
- [x] Scaffold-only or prose-only runtime handoffs are rejected until the merged workspace contains concrete implementation files and runnable app entries.
- [x] Generated entry-file writes resolve onto the active starter source file when models choose a sibling JS/TS extension.
- [x] Browser E2E validates working projects strictly by requiring the requested token to appear inside preview, not just an iframe mount.
- [x] Browser E2E now also verifies that generated and follow-up tokens persist in the hosted runtime snapshot after preview recovery settles.
- [x] Live `alpha1` FREE/DeepSeek E2E validated first prompt generation plus a follow-up prompt that preserved both tokens in preview.

2. History-aware iteration

- [x] Follow-up prompts use a stable project-context id and project-scoped memory instead of a browser-global slot.
- [x] Current workspace snapshots are supplied deterministically even when context optimization is disabled.
- [x] Follow-up prompts supersede queued auto-heal work, avoiding hidden repair races against user-requested improvements.
- [x] Follow-up installs/restarts use a dedicated runtime shell so iterative prompts can build on the current project without trampling the active preview.
- [x] Hosted runtime snapshots are used as canonical chat file state for live follow-up prompts.
- [x] Recovered previews are no longer accepted as follow-up success if the rollback dropped the latest generated file changes.

3. Transparency and release validation

- [x] Chat and Workspace remain separate top-level tabs with visible live commentary and technical execution state.
- [x] Hosted preview verification emits visible startup progress during long warm-ups.
- [x] The Workspace preview reconciles quickly when the managed runtime reports a verified preview.
- [x] Postdeploy browser health checks fail release validation on missing hashed assets or non-interactive prompt shells.
- [x] Runtime startup blocks managed-instance rollout when `/srv/bolt-gives` is behind `origin/main`.

4. Operator, managed-instance, and self-host baseline

- [x] Managed Cloudflare instances are registration-first, one-client / one-instance environments with private client profile capture.
- [x] Active managed Cloudflare instances are refreshed from the current release SHA by the runtime rollout controller.
- [x] New managed instances are provisioned from the current live build and protected hosted FREE relay secret.
- [x] `admin.bolt.gives` includes the private operator dashboard, client profile filtering/export, instance assignment state, SMTP configuration, and audience-based outbound email.
- [x] Header-level `Shout Out Box` messaging is available with unread tracking and a user-side settings toggle.
- [x] Self-hosting supports custom app/admin/create domains, local PostgreSQL, `psql`, operator credential seeding, and Caddy-managed HTTPS.

## v3.1.0 - Launch Plan

Release theme: turn the current hosted reliability baseline into a more observable, reversible, and scalable platform for managed instances, teams, self-hosters, and common project templates.

### P0 Priorities

1. Managed Cloudflare rollout observability

- [ ] Add operator-visible deployment history, last good SHA, and rollback outcome per managed instance.
- [ ] Make active-instance refresh health-verified and reversible, not just deploy-command successful.
- [ ] Add capacity and fleet state summaries to `admin.bolt.gives`.
- [ ] Record startup-sync and interval-sync results in durable operator-visible history.

2. Tenant and account hardening

- [ ] Replace the bootstrap-only tenant/admin baseline with production-safe account and RBAC rules.
- [ ] Add approval history, invite lifecycle, password reset lifecycle, and auditable state transitions.
- [ ] Add safer admin credential rotation and clearer operator session management.
- [ ] Add stronger authorization checks around SMTP transport changes, managed refresh, suspend, and export actions.

3. Prompt-to-preview quality

- [ ] Ship first-party template packs for the most common app requests.
- [ ] Add CI smoke coverage for each first-party template pack.
- [ ] Reduce empty scaffold / starter-only outcomes on real user requests.
- [ ] Broaden Architect recovery signatures beyond preview restore into dependency, build, and routing failures.

4. Browser weight and runtime offload

- [ ] Push more preview/log reconciliation state entirely to the server.
- [ ] Continue reducing heavy editor, PDF, git, terminal, and deploy chunks from startup paths.
- [ ] Add bundle budgets in CI so browser weight cannot silently regress.
- [ ] Keep longer hosted sessions responsive on lower-end machines.

5. Self-host installer resilience

- [ ] Add repeatable no-db and full-db installer smoke paths to release validation.
- [ ] Improve automatic repair for apt, dependency, build, Caddy, and service-start failures.
- [ ] Keep interactive install prompts recoverable and clear when a VPS is partially configured.

6. Transparency and moderation

- [ ] Eliminate remaining generic keep-alive commentary and keep progress derived from concrete runtime/file/command events.
- [ ] Keep the same status model visible in both `Chat` and `Workspace`.
- [ ] Add broadcast communication moderation and abuse/reporting controls for the Shout Out Box.

### P1 Improvements

- [ ] Teams mode with RBAC and shared project ownership.
- [ ] Collaboration audit trail and operator export.
- [ ] Cleaner operator email workflows with test delivery and bounce/error visibility.
- [ ] Better first-run education for hosted and self-hosted users.

## v3.1.0 Release Metrics

- [ ] First prompt-to-preview success rate >= 95% on the first-party template set.
- [ ] Commentary first visible update <= 2s on hosted runs.
- [ ] No hidden agent actions: critical execution state always visible in `Chat` or `Workspace`.
- [ ] Managed Cloudflare refresh path is health-verified and rollback-capable.
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
