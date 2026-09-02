# Agents.md

## Mission

Build and maintain `bolt.gives` as a production-ready agentic coding platform where agent work is visible, understandable, and verifiable while it happens. Users must be able to start a project, see files and Preview, send follow-up prompts, and understand what changed.

Secondary objective: continue the `v4.1.0` platform-hardening track for Custom Domain lifecycle, managed instances, tenant/RBAC controls, prompt-to-preview measurement, rollout observability, and self-host resilience.

## Active Release Line

- Stable: `v4.0.0`
- Release commit: current `main`
- GitHub release: `https://github.com/embire2/bolt.gives/releases/tag/v4.0.0`
- Linux installer: `https://raw.githubusercontent.com/embire2/bolt.gives/v4.0.0/install.sh`
- In progress: `v4.1.0`

`v4.0.0` is the current stable hosted and Linux self-host release. It replaces the competing Chat/Workspace navigation model with a unified Agent Mode that keeps conversation, a compact follow-up prompt, and a dominant Code/Preview workspace together. User-selected Code remains selected during Preview health events, technical detail is available on demand, and the separately built private-source Desktop binaries continue to use the hosted profile and quota without embedding operator keys.

The local runtime provisions a restricted PostgreSQL role/database for every project before its first command. `/workspace-setup` additionally provisions per-project Ubuntu CLI users and private workspace directories on an optional runtime node. Treat both paths as server-side infrastructure, not browser shortcuts. Steady-state remote provisioning must use the non-root `bolt-runtime-agent` SSH key path; root/password access is bootstrap-only and should be rotated after verification.

## Operating Principles

- No hidden behavior: if the agent acts, users must be able to see what happened.
- No false success: completion messaging must match real execution and preview state.
- Follow-up prompts must build on the current project context, not restart from stale memory.
- Keep fixes minimal, explicit, test-backed, and documented.
- Prefer clear runtime contracts over clever UI or protocol shortcuts.

## Module Ownership

- `@bolt/core`: shared contracts, workspace paths, security, logging, URLs, versioning, and low-level utilities. It must not import another product module.
- `@bolt/agent`: providers, prompts, project memory, context selection, streaming, tools, commentary, continuation, recovery, and web browsing.
- `@bolt/runtime`: hosted workspace synchronization, commands, Preview lifecycle, runtime-node provisioning, and execution support.
- `@bolt/project`: generated-project files, persistence, history, Workbench, editor, terminal, actions, collaboration, and integrations.
- `@bolt/control-plane`: tenant/admin policy, managed instances, updates, publishing, domains, billing, mail, and audit state.
- `@bolt/surfaces`: Remix routes, application chrome, Cloudflare integration, mobile/Tauri composition, and cross-domain adapters. The proprietary Desktop build is maintained outside this public repository.

Use `@bolt/<module>/*` imports and keep the graph in `modules/module-map.json` acyclic. Put reusable browser/server-neutral contracts in `core`. Do not bypass a boundary with long relative paths.

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

- Chat-first landing that transitions into one persistent Agent Mode after the first prompt.
- Desktop Agent Mode keeps conversation and the compact follow-up prompt beside a dominant Code/Preview workspace.
- Mobile Agent Mode has an explicit Agent/App view switch and keeps the prompt mounted.
- Agent state changes never force navigation between conversation, Code, or Preview.
- Live commentary feed plus technical execution transparency.
- Server-first hosted runtime for install, build, test, preview, and file sync.
- Preview auto-recovery via server-side health checks.
- Generated dev-server commands are normalized into managed Preview starts; fixed `/home/project` prefixes and model-authored background polling never replace runtime health verification or open hidden approvals.
- Managed `FREE` provider restricted to server-side MagnetAPI.org models `gpt-5.6-sol`, `claude-opus-4-8`, `claude-sonnet-5`, and `claude-fable-5`.
- First-party Appointment, Calendar, SaaS Dashboard, Marketing, Commerce, and Portfolio packs verified through real Vite/Chromium Preview in CI.
- One-client / one-instance managed Cloudflare trial flow.
- Dedicated runtime-node Live Workspaces setup flow at `/workspace-setup`.
- Automatic local PostgreSQL isolation for every hosted project plus optional runtime-node CLI workspaces.
- Cloudflare Pages/Worker publishing to `https://{subdomain}.instances.bolt.gives` and Custom Domain hosting at the `$5/month` launch price.
- Private operator panel with client profiles, fleet state, email activity, and bug reports.
- Interactive Linux self-host installer with local PostgreSQL and Caddy HTTPS support.
- Profile-owned browser history, with guest and other-account projects isolated on shared devices.
- FREE Agent-token metering calibrated to at least 30 active coding minutes per 100-token GMT+2 day.
- Account-level Stripe Checkout and signed-webhook Custom Domain activation, with 10,000 provider-reported tokens per paid month.
- Private-source Windows, Debian, and AppImage Desktop binaries that connect to the hosted service and inherit the same profile/quota rules without embedded server credentials.

## v4.1.0 Priorities

- Continue prompt-to-preview reliability measurement for first generation and follow-up prompts.
- History-aware project continuation using runtime snapshots and current workspace state.
- Commentary derived from actual runtime, file, and command events, not filler.
- Managed Cloudflare deployment history, last-good SHA, rollback outcomes, and fleet summaries.
- Tenant/account/RBAC hardening.
- Broaden first-party template acceptance and publish first-pass success measurements.
- Continued browser-weight reduction on editor, PDF, git, and terminal surfaces.
- Self-host installer resilience for apt, build, Caddy, PostgreSQL, and service failures.
- Runtime-node hardening: non-root agent bootstrap, SSH-key auth, stronger quotas, audit visibility, and clean recovery paths.
- Project publishing hardening: Stripe webhook activation, domain verification, and operator-visible deployment/domain state.

## Delivery Workflow

1. Reproduce or validate the current behavior.
2. Identify the runtime path, affected files, and live surface.
3. Implement the smallest safe fix.
4. Add regression coverage close to the changed code.
5. Run local validation:
   - `pnpm module:check <module>` while iterating
   - `pnpm check:boundaries:strict`
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
- Do not expose runtime-node root/admin SSH credentials to browsers, managed instances, release notes, screenshots, logs, or commits.
- Do not run normal runtime-node provisioning through root/password once the `bolt-runtime-agent` SSH key is verified.
- Client runtime-node CLI/database passwords are one-time handoff values; store only hashes/metadata.
- Stripe secret keys must stay server-side only; browsers may receive Checkout URLs and publishable-key metadata only.
- Redact sensitive values from screenshots, logs, commits, release notes, and issue comments.
- Keep local project-database passwords in mode-`0600` server records only; never copy them into browser state, generated source, or Cloudflare artifacts.

## Runtime Node Rules

- Every normal hosted project must receive one restricted local PostgreSQL database/role before its first command.
- `/workspace-setup` must create one Unix user and private workspace directory per remote project; normal hosted projects may provision the same optional runtime-node CLI workspace in the background.
- Client-selected usernames must be safe Linux usernames and must not collide with reserved system accounts.
- The provisioning path must run on the server side through runtime-control; never call SSH from the browser.
- Prefer SSH keys and a non-root `bolt-runtime` agent after initial bootstrap. Root/password access is only for setup or approved emergency repair.
- If provisioning fails, keep the workspace record failed with a redacted error. Never show false success.

## Project Publishing Rules

- Free publishing uses a persistent Cloudflare Pages advanced-mode Worker at `https://{subdomain}.instances.bolt.gives`.
- Reserved operational subdomains such as `admin`, `create`, `alpha1`, and `ahmad` must not be assigned to users.
- Custom Domain hosting uses a `$5/month` launch promotion, presented as a `$20/month` value, through server-side Stripe Checkout and signed webhook fulfillment.
- Users must receive clear DNS guidance: create an `A` record pointing to the configured bolt.gives server IP.

## Definition of Done

A task is complete only when the behavior is correct, validation appropriate to the change has passed, docs reflect the outcome, live services are healthy when touched, and no adjacent critical path regression is introduced.
