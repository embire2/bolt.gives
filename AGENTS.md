# AGENTS.md

## Mission

Build and maintain `bolt.gives` as a production-ready agentic coding platform. The product must be reliable, visibly transparent while it works, safe when it acts autonomously, and easy to self-host.

Current release line:

- Stable: `v3.0.9.30`
- In progress: `v3.1.0`

Core rule: do not ship hidden behavior. If the agent takes action, the user must be able to see what happened, why it happened, and what the next step is.

## Repo, Branches, and Live Targets

- Primary repo: `https://github.com/embire2/bolt.gives`
- Release branch: `main`
- Optional soak/staging branch: `alpha`

Live surfaces to validate when a core path changes:

- `https://alpha1.bolt.gives`
- `https://ahmad.bolt.gives`
- `https://bolt-gives.pages.dev`
- `https://admin.bolt.gives`
- `https://create.bolt.gives`

Branch policy:

- High-risk work may land on `alpha` first.
- Verify on `alpha1`.
- Fast-forward or merge cleanly into `main`.
- Keep `main` as release source-of-truth.
- If no active soak test is running, keep `alpha` aligned with `main`.
- Never force-push shared branches unless explicitly approved.

## Product Baseline You Must Preserve

The current hosted product baseline is:

- Chat-first landing surface
- Separate `Chat` and `Workspace` tabs
- Live commentary feed
- Technical feed / execution transparency
- Hosted server-first runtime for install/build/dev/test/preview on managed instances
- Preview auto-recovery via server-side health checks
- Managed `FREE` provider locked to one hosted model:
  - provider: `FREE`
  - model: `deepseek/deepseek-v4-pro`
- Managed Cloudflare trial-instance flow at `/managed-instances`
- Private operator/admin control plane at `admin.bolt.gives`
- Operator profile filtering/export plus audience-based outbound email from `admin.bolt.gives`
- Header-level `Shout Out Box` broadcast messaging with user-side settings toggle
- Interactive self-host installer with local PostgreSQL and Caddy HTTPS support
- Dedicated runtime-node Live Workspaces at `/workspace-setup` for per-project Ubuntu CLI users, private workspace directories, and per-project PostgreSQL databases
- Hosted chat-created projects auto-provision dedicated runtime-node CLI/database workspaces.
- Preview can publish projects to `https://{subdomain}.bolt.gives` and start server-side Stripe Checkout for `$10/month` custom-domain hosting.

Do not regress any of the above without an explicit user request.

## Non-Negotiable Security Rules

- Never commit API keys, tokens, cookies, session dumps, or private logs.
- Keep secrets in `.env.local`, runtime env files, or service environment variables.
- Do not leak operator-funded keys to the browser.
- The hosted `FREE` path must remain server-side only.
- Managed-instance or admin payloads must not expose Cloudflare credentials, internal hashes, or private admin DB credentials.
- Runtime-node admin SSH credentials must stay in ignored env/runtime service files and must never be sent to browsers, managed Pages instances, workspace source files, screenshots, release notes, or commits.
- Runtime-node client credentials are one-time handoff values. Store only hashes/metadata in registries and never log plaintext passwords.

## Current Hosting / Runtime Facts

- `/srv/bolt-gives` is the live deployed tree on this server.
- `/srv/bolt-gives-runtime-workspaces` holds hosted runtime workspaces.
- Dedicated runtime-node client projects default to `/srv/bolt-live-workspaces` on the configured Ubuntu node; each project must have its own Unix user and PostgreSQL role/database.
- Runtime-node steady state must use a non-root `bolt-runtime-agent` SSH key with server-side `sudo`; root/password is bootstrap-only and must be rotated after setup.
- Deployments are often done by syncing repo contents into `/srv/bolt-gives` without `.git`; do not assume the live `.git` SHA reflects the running code unless you verified the deploy method.
- Main services:
  - `bolt-gives-app.service`
  - `bolt-gives-runtime.service`
  - `bolt-gives-collab.service`

When changing hosted runtime behavior, validate both the app service and the runtime service.

## Work Scope Rules

- Prioritize reproducible failures and approved roadmap work.
- One logical change per commit unless a larger atomic change is required for correctness.
- Avoid unrelated refactors during hotfixes.
- Keep behavior changes explicit in commit messages and docs.
- If you encounter unexpected unrelated file modifications while editing, stop and assess before overwriting them.

## v3.1.0 Priorities

These are the current release priorities:

- Prompt-to-preview reliability
- Clear execution state in both `Chat` and `Workspace`
- Commentary derived from actual runtime events, not filler
- Remaining browser-weight reduction on editor/PDF/git/terminal surfaces
- Managed Cloudflare rollout/refresh/rollback observability
- Admin/operator segmentation and broadcast tooling without secret leakage
- Tenant/account/RBAC hardening
- Self-host installer resilience
- First-party template packs and smoke coverage
- Runtime-node isolation hardening: move from root bootstrap/password auth toward SSH keys, a non-root agent account, stronger quotas, and auditable per-project operations
- Project publishing hardening: Stripe webhook activation, domain verification, and operator-visible deployment/domain state

Recent critical issue context:

- A real failure mode existed where stale “starter placeholder” detection could roll a valid generated app back to the fallback starter.
- Current fixes ignore stale starter detections when active workspace files no longer contain the starter placeholder.
- Preserve that behavior unless replacing it with something stricter and provably better.

## Mandatory Implementation Workflow

1. Confirm current behavior

- Reproduce the issue or validate the gap.
- Record the exact runtime path, affected files, and live surface.

2. Implement the smallest safe fix

- Preserve contracts where possible.
- Add strict-provider safeguards when touching tools or stream schemas.

3. Add regression coverage

- Put tests close to the changed code.
- Include at least one test that would have failed before the fix.

4. Validate locally

- `pnpm run typecheck`
- `pnpm run lint`
- `pnpm test`
- `pnpm run build`

5. Run targeted E2E smoke when the change touches any of:

- chat streaming
- providers / API-key selection
- preview / runtime handoff
- file actions
- deployments
- auth / tenant flows
- managed Cloudflare trials

6. Update docs in the same change set

- `CHANGELOG.md`
- `README.md`
- `ROADMAP.md`

7. Commit and push

- Use Conventional Commits.

## Deployment Rules

Before declaring success:

- Confirm the build passes.
- Confirm services restart cleanly.
- Confirm the chat flow actually works on a live URL.
- Confirm version/changelog assets are fresh.
- Confirm no new provider, transport, or preview errors in browser console and server logs.
- Confirm live domains return healthy responses.

If deployment fails:

- capture exact error text
- fix root cause, not symptoms
- rerun smoke before declaring success

## Managed Cloudflare Trial Rules

- `/managed-instances` is registration-first.
- One client gets one instance.
- Users must see the actual assigned hostname, not a guessed one.
- `admin.bolt.gives` is the operator surface for client profiles, instance assignments, refresh/suspend actions, and admin email activity.
- If Cloudflare credentials are configured, trial provisioning must be verified through the runtime control plane, not assumed from docs alone.

## Dedicated Runtime Node Rules

- `/workspace-setup` is client-facing and must never reveal admin/root SSH credentials.
- Provisioning is server-side only through runtime-control endpoints.
- One project gets one Unix user, one private workspace directory, one PostgreSQL database, and one PostgreSQL role.
- Normal hosted chat-created projects must auto-provision the same per-project runtime-node CLI/database workspace in the background.
- Client-selected CLI usernames must be validated as safe Linux usernames and must not collide with system users.
- Client passwords and generated database passwords are shown once, then stored only as hashes/metadata.
- Prefer SSH keys and the non-root `bolt-runtime-agent` after bootstrap. Root/password access is acceptable only for initial setup or explicitly approved emergency repair, and must be removed from service runtime env once the key path is verified.
- If provisioning fails, record a redacted error and keep the registry honest; do not mark failed workspaces active.

## Project Publishing Rules

- Free project publishing uses `https://{subdomain}.bolt.gives`.
- Reserved operational subdomains such as `admin`, `create`, `alpha1`, and `ahmad` must never be assigned to user projects.
- Custom-domain hosting is `$10/month` through server-side Stripe Checkout.
- Stripe secret keys must stay only in ignored server env/service files; browsers may receive Checkout URLs and publishable-key metadata only.
- Custom-domain users must be shown clear DNS guidance: create an `A` record pointing at the configured bolt.gives server IP.

## Self-Host Rules

The installer must remain interactive and recover from common failures. The supported self-host baseline includes:

- custom app/admin/create domains
- local PostgreSQL
- `psql` client
- Caddy-managed HTTPS

If installer behavior changes, verify both syntax and a realistic install path.

## Quality Bar Before Marking Work Done

A change is done only if all are true:

- code compiles
- typecheck passes
- lint passes
- tests pass
- build passes
- core flow still works end-to-end
- docs reflect the new behavior
- no regression is introduced in adjacent critical paths

If any item fails, do not call the task complete.
