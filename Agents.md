# Agents.md

## Mission

Build and maintain `bolt.gives` as a production-ready agentic coding platform where agent work is visible, understandable, and verifiable while it happens. Users must be able to start a project, see files and Preview, send follow-up prompts, and understand what changed.

Secondary objective: continue the `v3.1.0` platform-hardening track for managed instances, tenant/RBAC controls, prompt-to-preview reliability, rollout observability, and self-host resilience.

## Active Release Line

- Stable: `v3.0.9.20`
- Release commit: `41836f7f38af93f594b33660e1dcf06b8e231b6a`
- GitHub release: `https://github.com/embire2/bolt.gives/releases/tag/v3.0.9.20`
- Linux installer: `https://raw.githubusercontent.com/embire2/bolt.gives/v3.0.9.20/install.sh`
- In progress: `v3.1.0`

`v3.0.9.20` is the current stable hosted and Linux self-host release. It keeps the full prompt experience in `Chat`, replaces the oversized Workspace composer with a compact follow-up prompt bar, and preserves room for generated files, Preview, runtime status, and execution transparency.

The active Cloudflare managed fleet has been refreshed to the release commit: `44/44` deployable instances active and healthy, with `3` suspended instances left untouched.

## Operating Principles

- No hidden behavior: if the agent acts, users must be able to see what happened.
- No false success: completion messaging must match real execution and preview state.
- Follow-up prompts must build on the current project context, not restart from stale memory.
- Keep fixes minimal, explicit, test-backed, and documented.
- Prefer clear runtime contracts over clever UI or protocol shortcuts.

## Branching and Deployment

- Primary branch: `main`
- Optional soak branch: `alpha`
- Live validation target: `https://alpha1.bolt.gives`
- Public app: `https://bolt.gives`
- Managed instance creation: `https://create.bolt.gives`
- Operator/admin surface: `https://admin.bolt.gives`

If changes are risky:

1. Land on `alpha`.
2. Validate E2E on `alpha1`.
3. Fast-forward or merge cleanly into `main`.
4. Deploy and verify the live services.
5. Refresh active managed Cloudflare instances only after the live runtime checkout is aligned with `origin/main`.

Never force-push shared branches unless explicitly approved.

## Current Stable Baseline

Preserve these behaviors unless the user explicitly asks to change them:

- Separate `Chat` and `Workspace` tabs.
- Full chat composer in `Chat`.
- Compact follow-up prompt in `Workspace`.
- Live commentary feed plus technical execution transparency.
- Server-first hosted runtime for install, build, test, preview, and file sync.
- Preview auto-recovery via server-side health checks.
- Managed `FREE` provider locked to `deepseek/deepseek-v4-pro`.
- One-client / one-instance managed Cloudflare trial flow.
- Private operator panel with client profiles, fleet state, email activity, and bug reports.
- Interactive Linux self-host installer with local PostgreSQL and Caddy HTTPS support.

## v3.1.0 Priorities

- Prompt-to-preview reliability for first generation and follow-up prompts.
- History-aware project continuation using runtime snapshots and current workspace state.
- Commentary derived from actual runtime, file, and command events, not filler.
- Managed Cloudflare deployment history, last-good SHA, rollback outcomes, and fleet summaries.
- Tenant/account/RBAC hardening.
- First-party template packs with smoke coverage.
- Continued browser-weight reduction on editor, PDF, git, and terminal surfaces.
- Self-host installer resilience for apt, build, Caddy, PostgreSQL, and service failures.

## Delivery Workflow

1. Reproduce or validate the current behavior.
2. Identify the runtime path, affected files, and live surface.
3. Implement the smallest safe fix.
4. Add regression coverage close to the changed code.
5. Run local validation:
   - `pnpm run typecheck`
   - `pnpm run lint`
   - `pnpm test`
   - `pnpm run build`
6. Run targeted E2E smoke for chat streaming, providers, preview/runtime handoff, file actions, auth, tenant flows, or deployments.
7. Update docs in the same change set when behavior or setup changes.
8. Commit with Conventional Commits and push.

For docs-only release work, validate the changed Markdown, confirm the tag/release target, and avoid unnecessary app rebuilds unless code changed.

## Release Rules

- Keep `README.md`, `CHANGELOG.md`, `ROADMAP.md`, and this file aligned with the stable version.
- GitHub Releases must include Linux installation instructions for Ubuntu `18.04+`.
- Release notes must include the tag, commit SHA, headline fixes, validation summary, and install command.
- Do not move an existing release tag after a fleet rollout unless the user explicitly approves retagging.
- If a release tag already points at deployed code, publish documentation updates on `main` without pretending the deployed SHA changed.

## Security and Data Handling

- Never commit secrets, API keys, tokens, cookies, session dumps, or sensitive logs.
- Keep secrets in `.env.local`, runtime env files, service environment variables, or provider secrets.
- Do not expose hosted `FREE` provider upstream keys to the browser or managed customer projects.
- Redact sensitive values from screenshots, logs, commits, release notes, and issue comments.

## Definition of Done

A task is complete only when the behavior is correct, validation appropriate to the change has passed, docs reflect the outcome, live services are healthy when touched, and no adjacent critical path regression is introduced.
