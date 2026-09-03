# bolt.gives Developer and Agent Guide

## Purpose

Build and maintain `bolt.gives` as a production-ready, open-source agentic coding platform. A user should be able to describe an application in plain English, watch the agent work, receive a health-verified Preview, continue the same project later, and publish it without understanding the infrastructure behind it.

The governing product rule is **no hidden behavior and no false success**. When the agent acts, users must be able to see what happened, why it happened, and what comes next. A project is not ready merely because files were generated; it is ready only after the runtime confirms that Preview is healthy.

This file applies to the repository root. Every module has a more specific `modules/<name>/AGENTS.md`; read the nearest guide before changing that module. If instructions conflict, the more specific guide controls for its directory, while the security and product invariants in this root guide always apply.

## Sources of Truth

Do not copy release facts into multiple files. Use these sources:

- `package.json`: current web application version, scripts, Node requirements, and package manager.
- `CHANGELOG.md`: shipped behavior by release.
- `ROADMAP.md`: planned work and release priorities.
- `README.md`: supported user-facing installation and product overview.
- `modules/module-map.json`: module dependency graph, ownership roots, and file-size ratchets.
- `.env.example`: supported environment-variable names. It contains examples only, never production secrets.
- Git history and tests: implementation intent and executable contracts.

The public repository is `https://github.com/embire2/bolt.gives`. `main` is the release source of truth. `alpha` may be used for high-risk soak work and must remain aligned with `main` when no soak is active. Never force-push a shared branch unless explicitly approved.

## First 15 Minutes

1. Read this file, the nearest module `AGENTS.md`, and the relevant section of `docs/architecture/modules.md`.
2. Run `git status --short --branch`. The worktree may contain user changes; never discard or overwrite work you did not create.
3. Confirm the toolchain with `.nvmrc`, `node --version`, and `pnpm --version`. Use the package manager declared in `package.json`.
4. Install dependencies with `pnpm install --frozen-lockfile` when `node_modules` is missing or the lockfile changed.
5. Run `pnpm module:list` and locate the owning module before searching broadly.
6. Start local development with `pnpm dev`. This starts the Remix app plus collaboration and web-browsing services.
7. Reproduce the reported behavior before editing. Record the route, project state, runtime request, exact error, and affected live surface.
8. During iteration, run `pnpm module:check <module>` and the smallest relevant test. Run the full release gates before shipping code.

Never begin by rewriting a large route or component. Trace the contract across module boundaries, fix the smallest owning layer, and add a regression test that fails without the fix.

## Product Contract

Preserve these behaviors unless a product decision explicitly replaces them:

- The chat-first landing flow transitions into one persistent Agent Mode after the first prompt.
- Desktop Agent Mode keeps conversation, a compact follow-up composer, and a dominant Code/Preview workspace visible together. Mobile provides an explicit Agent/App switch while keeping the composer available.
- Runtime state must not force the user from Code to Preview, reset the selected project, flash between contradictory states, or hide the prompt.
- Commentary is plain-English output derived from real runtime, file, command, recovery, and Preview events. Technical detail remains available separately. Never generate generic keep-alive filler.
- Follow-up prompts use the current conversation, active source snapshot, runtime identity, Preview state, and any project database connection. They must not silently restart from a stale template.
- Browser project history is scoped to the authenticated profile. Guest data and another account's projects must not appear after login on a shared browser.
- Hosted generation is server-first. Install, build, test, command execution, filesystem synchronization, recovery, and Preview health verification happen through the managed runtime contract.
- Generated development commands are normalized into managed Preview starts. Model-authored background polling, fixed `/home/project` paths, or hidden approvals must never bypass runtime health checks.
- A healthy generated application must not be replaced by a fallback starter because of a stale placeholder signal. Validate the current workspace before any recovery rollback.
- Snapshot and runtime sync filters must exclude generated or machine-local trees such as `.cache`, `.local`, `node_modules`, `.git`, `.next`, `dist`, `build`, and `coverage`, while preserving real hidden source such as `.github`.
- First-party Appointment, Calendar, SaaS Dashboard, Marketing, Commerce, and Portfolio packs must continue to pass real Vite/Chromium Preview smoke tests.

### Hosted Models and Quotas

The managed `FREE` provider is server-side only. Its supported coding models are `gpt-5.6-sol`, `claude-opus-4-8`, `claude-sonnet-5`, and `claude-fable-5`, with ChatGPT-5.6 SOL as the default. Users may switch model during a project without losing history or runtime context.

MagnetAPI.org is the upstream transport: Responses API for ChatGPT-5.6 SOL and Messages API for Claude models. ChatGPT generation must pass through the strict server-side file-action bridge rather than emitting unbounded prose artifacts. Provider credentials must never enter browser bundles, generated projects, logs, screenshots, managed instances, or commits.

Hosted FREE profiles receive 100 Agent tokens per GMT+2 day, calibrated to useful coding time rather than raw model-token accounting. Custom Domain accounts receive 10,000 provider-reported Agent tokens per successfully paid month. Entitlements and resets come from signed server-side billing events, not browser redirects.

### Desktop Boundary

The native Windows client has an independent `Desktop v*` release line. Its proprietary C#/.NET WPF source, private CI tree, and dependencies are outside this public repository. Public releases may contain only compiled artifacts, checksums, release notes, and update metadata.

The desktop client must use native controls for authentication, projects, Chat, Workspace, editing, terminal, deployments, settings, and updates. WebView2 is allowed only for generated project Preview. Sign-in uses an emailed six-digit one-time code entered in the app. Never add operator credentials or hosted provider keys to a desktop binary.

## Six-Module Architecture

The repository is intentionally divided so most work touches one or two modules:

- `@bolt/core` (`modules/core`): shared contracts, security primitives, workspace paths, logging, URLs, version helpers, and browser/server-neutral utilities. It is the leaf foundation and imports no other product module.
- `@bolt/agent` (`modules/agent`): providers, prompts, context and memory selection, stream schemas, tools, commentary, continuation, recovery, and web browsing. It depends only on core.
- `@bolt/runtime` (`modules/runtime`): hosted runtime clients, workspace synchronization, command execution, Preview lifecycle, health/recovery, and runtime-node provisioning. It depends only on core.
- `@bolt/project` (`modules/project`): generated files, source/history persistence, Workbench, editor, terminal, action execution, collaboration, and integrations. It depends on core, agent, and runtime.
- `@bolt/control-plane` (`modules/control-plane`): profiles, tenants, admin policy, managed instances, updates, publishing, domains, billing, mail, and audit state. It depends on core and runtime.
- `@bolt/surfaces` (`modules/surfaces`): Remix routes, application chrome, server composition, Cloudflare adapters, mobile/Tauri surfaces, and cross-module orchestration. It may compose all modules but should not absorb their business logic.

Use `@bolt/<module>/*` imports. Do not bypass ownership with deep relative imports or put new shared logic into legacy facades. `scripts/` and `functions/` are compatibility, build, deployment, and Cloudflare entry points, not general application modules.

The dependency graph must remain acyclic. Run `pnpm check:boundaries:strict` after moving code or changing imports. New production files are limited to 1,000 lines; the larger files listed in `modules/module-map.json` are legacy ratchets, not targets to grow.

### Trace a Prompt to Preview

Use this path when debugging generation:

1. `modules/surfaces/app/routes/api.chat.ts` authenticates the request and composes the chat stream.
2. `modules/agent` selects the provider/model, reconstructs project context, validates stream/tool events, and emits actions and commentary.
3. `modules/project/src/lib/runtime/action-runner.ts` applies file and command actions to the active project contract.
4. `modules/runtime/src/lib/runtime/hosted-runtime-client.ts` communicates with the hosted runtime. `scripts/runtime-server.mjs` is the compatibility process used by deployed services.
5. `modules/project/src/components/workbench/Preview.tsx` renders Preview state based on verified runtime health, not optimistic file generation.
6. `modules/project/src/lib/persistence` and related stores preserve source, messages, runtime identity, and project ownership for later continuation.

When a project loops between Working and Needs Repair, inspect this path in order. Determine whether the failure is provider output, action validation, filesystem sync, dependency/build execution, dev-server startup, proxy routing, or client state. Do not mask a server failure with a UI timer.

## Implementation Rules

- Reproduce first, then make the smallest safe change in the owning module.
- Preserve public contracts where possible. When a stream, tool, provider, or runtime schema changes, validate strict and permissive upstream behavior explicitly.
- Add tests close to the changed implementation. Include at least one assertion that would have failed before the fix.
- Prefer extracting a focused unit over expanding a legacy oversized file.
- Keep server-only imports out of browser entry points. Verify secret-bearing code cannot be included in a client chunk.
- Use abort signals, bounded retries, deadlines, and idempotency for network or runtime operations. Recovery must terminate with a useful error instead of oscillating forever.
- Make status transitions monotonic and event-driven. Debounce only presentation noise; do not debounce away real failures.
- Persist identifiers and state transitions before reporting success. If persistence fails, keep the UI honest and retry safely.
- Do not add a dependency when a small existing utility suffices. If a dependency is necessary, evaluate browser weight, maintenance, license, and server/client placement.
- Keep UI accessible: keyboard operation, visible focus, semantic labels, sufficient contrast, usable scrolling, and responsive layouts are release requirements.
- Do not perform unrelated refactors during incident fixes.

## Validation Matrix

Use targeted checks while iterating:

- Module ownership: `pnpm module:check <module>`
- Affected modules: `pnpm module:affected`
- Dependency boundaries: `pnpm check:boundaries:strict`
- Type contracts: `pnpm run typecheck`
- Static quality: `pnpm run lint`
- Unit/integration suite: `pnpm test`
- Production artifacts and bundle budget: `pnpm run build`

Run a targeted E2E whenever behavior crosses a browser/server/runtime boundary:

- Preview and recovery: `pnpm e2e:preview-recovery`
- Calendar generation: `pnpm e2e:calendar`
- FREE startup/model label: `pnpm e2e:free-startup`
- Hosted FREE transport: `pnpm smoke:free-provider`
- First-party templates: `pnpm smoke:template-packs`
- Self-host install: `pnpm smoke:self-host-installer`
- Live release surface: `pnpm smoke:live`
- Post-deploy endpoints: `pnpm health:postdeploy`
- Full release policy: `pnpm gate:release`

For code changes, the default pre-ship gate is boundaries, typecheck, lint, tests, and build, followed by the relevant E2E. Documentation-only changes need formatting/link validation and do not require rebuilding unchanged application code. Record any skipped check and the reason.

An E2E for prompt-to-preview is complete only when a normal browser submits a prompt, the agent writes actual project files, commands finish, Preview displays the generated application, a follow-up prompt changes that same project, and the project reloads with its history intact.

## Security and Data

- Never commit credentials, API keys, SSH material, SMTP passwords, Stripe secrets, cookies, session exports, database URLs, private logs, or real customer data.
- Store secrets only in ignored `.env.local` files, protected service environment files, platform secret stores, or mode-`0600` runtime records. Do not copy production values into `.env.example`.
- Do not print secret files to a terminal transcript. Inspect key names or redacted values when diagnosis requires configuration checks.
- Authentication, quota, billing, provisioning, and deployment authorization are server-side decisions. Never trust browser-provided entitlement state.
- Managed-instance and admin responses must not expose Cloudflare credentials, internal hashes, private database credentials, or operator state.
- Treat generated applications and model output as untrusted input. Validate paths, commands, URLs, archive entries, and process arguments before execution.
- Prevent path traversal and symlink escapes from project roots. Never run a generated project as root.
- Redact errors before storing or exposing them, but retain a server-side correlation ID and enough structured context for operators.

## Databases and Runtime Isolation

Normal hosted projects start without a database. A user may connect Supabase with a project URL plus publishable/anon key, or attach a user-owned PostgreSQL connection string. Connection records are stored outside project source with mode `0600`; only redacted status reaches the browser, and variables are injected server-side into that project's commands and Preview. PostgreSQL is never injected into a static Cloudflare build. Credentials must not be written to generated source, browser history, snapshots, deployment artifacts, commentary, or logs.

Legacy local per-project PostgreSQL provisioning is operator opt-in through `BOLT_PROJECT_DATABASE_ENABLED=true`; fresh installs keep it disabled. The platform's own profile/admin database remains independent and optional for self-hosts.

`/workspace-setup` additionally provisions an optional dedicated Ubuntu CLI workspace. One project gets one Unix user, one private directory, quotas, and auditable operations. It is database-free by default; operators may explicitly add a local PostgreSQL role/database, while most users should connect Supabase or their own PostgreSQL service from Agent Mode. Client-selected usernames must be valid non-reserved Linux usernames. Passwords are one-time handoff values; retain only hashes and metadata.

Runtime-node steady state uses the non-root `bolt-runtime-agent` with SSH keys and constrained server-side `sudo`. Root/password access is bootstrap or explicitly approved emergency access only and must be removed from service configuration after key verification. A failed provision remains failed with a redacted reason; never mark it active optimistically.

## Managed Instances and Publishing

`/managed-instances` is registration-first: one client receives one assigned instance. Show the hostname returned by the control plane, never a guessed hostname. Operators manage profiles, assignments, refreshes, suspensions, rollout history, and email activity through `admin.bolt.gives`.

Free project publishing uses the configured protected Cloudflare account and a persistent Pages advanced-mode Worker at `https://{subdomain}.instances.bolt.gives`. Operational and reserved names such as `admin`, `create`, `alpha1`, and `ahmad` cannot be assigned to projects. Verify deployment through the runtime control plane and then load the public application; a successful API response alone is insufficient.

Custom Domain hosting uses server-side Stripe Checkout and signed webhook fulfillment. The current launch offer and included quota are product configuration, not a client-side flag. Show DNS guidance from runtime configuration and verify domain ownership before activation. Secret keys stay on the server; browsers receive only a Checkout URL and explicitly public metadata.

## Hosted Operations

On the open-source production host:

- Source checkout: `/root/bolt.gives`
- Deployed application tree: `/srv/bolt-gives`
- Hosted runtime workspaces: `/srv/bolt-gives-runtime-workspaces`
- Primary services: `bolt-gives-app.service`, `bolt-gives-runtime.service`, `bolt-gives-collab.service`, and `bolt-gives-webbrowse.service`
- Typical local listeners: app `5173`, runtime `4321`, collaboration `1234`, web browsing `4179`

The deployed tree may be synchronized without `.git`. Verify the deployment manifest or file checksums; do not assume a live `.git` SHA describes running code. Do not modify similarly named alpha or tenant services unless the task explicitly targets them.

For runtime changes, validate both app and runtime services. For collaboration or web-browsing changes, validate the corresponding service too. Bind internal listeners to loopback unless the architecture explicitly requires a protected network listener.

Self-host installations support interactive setup, custom app/admin/create domains, optional local PostgreSQL for profile/admin data, and Caddy-managed HTTPS. Generated apps bring their own data service. Installer changes require shell syntax checks plus a realistic clean and repair path.

## Git, Releases, and Deployment

1. Start from an up-to-date branch and inspect the dirty worktree.
2. Keep one logical change per commit unless splitting would break an atomic migration.
3. Use Conventional Commits, for example `fix(runtime): stop preview recovery oscillation`.
4. Update `README.md`, `CHANGELOG.md`, and `ROADMAP.md` when behavior, installation, versioning, or roadmap status changes.
5. Do not claim a new version until `package.json`, release assets, documentation, tag, and deployed build agree.
6. Push normally. Never amend or force-push shared history unless explicitly requested.
7. Deploy from the release source of truth, restart only affected services, and retain a known-good rollback target.
8. Verify service status, logs, health endpoints, browser console, chat, runtime, Preview, and affected public domains.
9. Refresh managed instances only after the live checkout is aligned with the intended release and rollout health checks pass.

Core public surfaces include `https://bolt.gives`, `https://alpha1.bolt.gives`, `https://ahmad.bolt.gives`, `https://bolt-gives.pages.dev`, `https://admin.bolt.gives`, and `https://create.bolt.gives`. Choose the smallest relevant set, but validate a staging target before production for high-risk work.

## Incident Playbook

When generation fails, capture the correlation ID, selected provider/model, project and runtime IDs, final validated action, command exit code, Preview health reason, and service logs. Redact customer content and all credentials.

Use these distinctions:

- **Provider error:** upstream authentication, quota, schema, timeout, or malformed stream before valid actions.
- **Action error:** rejected path, command, tool schema, or incomplete file action.
- **Runtime error:** workspace provisioning, sync, process spawn, dependency install, resource limit, or database injection.
- **Preview error:** dev server exited, wrong host/port, proxy routing, health timeout, or browser-only exception.
- **Persistence error:** source/messages/runtime identity were generated but not durably associated with the authenticated project.
- **UI state error:** the server state is coherent but the browser shows stale, flashing, or contradictory status.

Fix the first failing boundary, not the last visible symptom. Bound automated repair attempts, preserve the last healthy source snapshot, and explain the terminal state in plain English. Never alternate indefinitely between Working and Needs Repair.

## Definition of Done

A change is complete only when:

- the original failure is reproduced or the gap is demonstrated;
- the smallest owning layer is fixed and regression coverage exists;
- module boundaries, typecheck, lint, tests, and build pass for code changes;
- a relevant real-browser E2E passes for cross-boundary behavior;
- project history, database isolation, Preview health, and follow-up prompts remain intact where applicable;
- documentation and release metadata reflect actual behavior;
- no secret or customer data appears in source, artifacts, logs, or commits;
- affected services restart cleanly and live endpoints are healthy when deployment is in scope;
- the user can see truthful progress, a working artifact, and a clear next action.

If any required check fails, report the exact failure and continue to the root cause. Do not describe partial work as shipped.
