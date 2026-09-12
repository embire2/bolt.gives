# bolt.gives

> **Looking for the commercial edition?** [WebCoder.Codes](https://webcoder.codes) is the commercial version of this project. Its team of 120+ developers is building a managed Agentic Coding experience for organizations that want commercial hosting, support, and product development beyond the open-source release.

[![Current release](https://img.shields.io/badge/release-v4.0.1-173f5f)](https://github.com/embire2/bolt.gives/releases)
[![Next release](https://img.shields.io/badge/roadmap-v4.1.0-d97706)](ROADMAP.md)
[![License](https://img.shields.io/badge/license-MIT-148456)](LICENSE)
[![Node](https://img.shields.io/badge/Node.js-22.x-339933)](.nvmrc)
[![pnpm](https://img.shields.io/badge/pnpm-9.14.4-f69220)](package.json)

**bolt.gives is an open-source Agentic Coding platform that turns a plain-English request into a working, previewable web application.** It writes the files, installs dependencies, runs commands, starts the development server, checks that Preview is healthy, and keeps the prompt available for follow-up changes.

[Try bolt.gives](https://bolt.gives) | [Report a bug](https://github.com/embire2/bolt.gives/issues/new/choose) | [Share feedback](https://github.com/embire2/bolt.gives/discussions) | [Read the roadmap](ROADMAP.md)

> **Reliability update, 12 September 2026:** v4.0.1 remains the stable web release. Our latest audit found 12 code/test-contract issues, including a broken pricing page and oversized/stale snapshots. A real alpha1 project reached Preview, accepted a follow-up, and restored after reload, but the run still recorded a snapshot 502. **v4.1.0 will prioritize these bugs and a separately versioned native Windows rewrite, not more feature sprawl.** Read the [findings, evidence, and small implementation tasks](docs/quality/2026-09-12-v4.1-audit.md). This is a plan, not a claim that the fixes are shipped. Model/database descriptions below include unreleased development work; live instances may differ.

**Implementation checkpoint, not a release:** [Draft PR #19](https://github.com/embire2/bolt.gives/pull/19) contains Phase 1 fixes and the approved Phase 2 work completed so far: bounded/current snapshots, pricing SSR repair, private database-free owner login, account-owned provider keys, protected browsing, honest database/payment status, accessible onboarding, and recoverable installers. **1,272 tests pass.** Preview refresh no longer writes fetched snapshots back over agent files; reload prefers existing runtime source instead of an older browser cache. [Installer CI passed](https://github.com/embire2/bolt.gives/actions/runs/34716586998) clean/repair Ubuntu 22.04/24.04 installs with and without platform PostgreSQL and PowerShell 5.1/7 contracts on Windows. Read the [Phase 1 evidence](docs/quality/2026-09-12-phase1-review.md) and [Phase 2 checkpoint](docs/quality/2026-09-12-phase2-checkpoint.md), including failed generation repeats. **Neither production nor the fleet has been updated:** repeatable final generation, isolated Preview origins/TLS, and non-root project-process isolation remain release gates. Real Stripe fulfillment, Windows/WSL reboot-resume, and native desktop parity are not certified.

## What You Can Do

Type a request such as:

> Build a responsive appointment booking app for a mobile dog groomer. Include services, available time slots, customer details, and a polished confirmation screen.

bolt.gives then:

1. Understands the request and carries the current project context into the run.
2. Creates or updates real source files instead of returning disconnected code snippets.
3. Runs dependency installation, builds, tests, and development commands in the managed runtime.
4. Opens the generated app in Preview only after the runtime can load it successfully.
5. Explains progress in plain English while technical command details remain available on demand.
6. Accepts follow-up prompts against the same files, history, runtime, and Preview.
7. Publishes supported static projects to a shareable Cloudflare-backed address.

The product rule is simple: **generated files are not a successful result; a health-verified Preview is.**

## Real Screenshots

These screenshots are captured from the actual application with Playwright. They are not design mockups.

### Start in plain English

![bolt.gives v4 home and new-project prompt](docs/screenshots/home.png)

### Choose how the agent should work

Select a hosted FREE model, ask for a direct build or a plan-first run, import an existing project, or connect data only when the application needs it.

![bolt.gives new-project prompt and model controls](docs/screenshots/chat-plan.png)

### Build and continue in Agent Mode

Conversation, the compact follow-up prompt, Code, and Preview remain part of one project surface.

This calendar was generated from a normal English prompt in a real isolated Node.js runtime with no project database. Chromium waited for the generated files, development command, healthy Preview, and runtime snapshot before taking the screenshot.

![A real calendar project running in bolt.gives Agent Mode](docs/screenshots/agent-mode-calendar-v4.0.1.png)

### Connect data only when the app needs it

Projects start without a database. Supabase quick connect needs only the Project URL and publishable/anon key; PostgreSQL uses a private server-held connection string.

![bolt.gives project Database connection dialog](docs/screenshots/database.png)

## Agent Mode

Version 4 replaced separate, competing Chat and Workspace routes with one continuous project experience.

- A new project starts with a full prompt so the user can describe the outcome clearly.
- The first build moves into **Agent Mode** automatically.
- Desktop keeps the conversation and a small follow-up composer beside a dominant Code/Preview workspace.
- Mobile provides an explicit Agent/App switch while keeping the prompt available.
- Preview health changes do not force the user away from Code or make the page flash between states.
- The selected model can change during a project without discarding history.
- Recovery is bounded. The UI shows a stable repairing state instead of looping forever between Working and Needs Repair.

Unreleased provider work will show the hosted FREE default as **ChatGPT-Luna - Medium effort** through the protected server-side MagnetAPI transport. Compatibility choices for Opus 4.8, Sonnet 5, and Fable 5 remain available without exposing the operator credential to the browser bundle or generated project. The audited live alpha instance still displayed ChatGPT-5.6 SOL; the pending provider changes are not included in this documentation-only publication.

The pending user-funded integration adds **MagnetAPI** to the provider dropdown. Once released, users will sign in at [MagnetAPI.org](https://magnetapi.org), buy a plan, create a User API Key in its dashboard, and enter it in bolt.gives. Planned choices include ChatGPT-Luna, ChatGPT-5.6 Ultra, Opus 5, Sonnet 5, and Fable 5.1; actual upstream IDs and account-specific discovery must pass the I03 release checks. MagnetAPI advertises these inference routes at 10% of standard direct-provider cost. Personal MagnetAPI requests must never fall back to bolt.gives' operator-funded FREE key.

## What Version 4 Includes

### Prompt to Preview

- A hosted Node.js/Linux runtime for files, commands, package installation, builds, tests, and development servers.
- Real Preview health checks before success is reported.
- Automatic recovery for common dependency, manifest, routing, Vite, and startup failures.
- First-party Appointment, Calendar, SaaS Dashboard, Marketing, Commerce, and Portfolio template packs with Chromium smoke coverage.
- Website browse-to-build support for prompts that reference an existing public website.

### Continue the Same Project

- Profile-scoped project history.
- Durable conversations and source snapshots.
- Stable runtime identity across reloads.
- Follow-up prompts that receive current project memory and the latest runtime files.
- Completed historical actions remain visible but are not executed again when a project reopens.

### Code and Preview Together

- File tree and editor.
- Integrated terminal output.
- Responsive, full-size Preview.
- Compact follow-up prompt in Agent Mode.
- Plain-English progress and expandable technical diagnostics.
- Runtime state that does not override the user's Code/Preview selection.

### Publish and Share

- GitHub and GitLab project export.
- Protected Cloudflare project deployment for configured hosts.
- FREE project subdomains under the operator's configured domain.
- Optional Custom Domain billing and entitlement hooks for operators that configure Stripe.
- Deployment health checks instead of optimistic success messages.

### Operate a Fleet

- Managed instance registration and assignment.
- Release-SHA rollout guards.
- Health-verified refreshes and last-good rollback data.
- Tenant, profile, audit, mail, and deployment control-plane surfaces.
- Optional isolated runtime-node workspaces for operators that need dedicated Linux CLI access.

## Databases Are Optional

Generated applications no longer require a bolt.gives-managed PostgreSQL server. A normal project begins with no database and can build, Preview, save, restore, and publish without one.

The PostgreSQL database used by bolt.gives itself for profiles or operator data is separate. Self-hosters may enable that database, but it is not inherited by generated apps.

### Connect Supabase

1. Create or open a project in [Supabase](https://supabase.com/dashboard/projects).
2. In Supabase, open **Project Settings > API**.
3. In bolt.gives, open **Database > Supabase**.
4. Paste the **Project URL** and **Publishable key** or legacy **anon key**.
5. Select **Connect Supabase**, then restart an existing Preview to apply the new environment.

In the v4.1 development build, Supabase reports **configured, not verified**. Saving a URL/key is not proof of network access, permissions, or RLS correctness. Test a real database operation in your app. Use **Replace credentials** for rotation; an unsuccessful replacement preserves the previous record. Restart Preview after replacement or disconnection because existing processes retain their old environment.

The runtime provides these variables to the project:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
SUPABASE_URL
SUPABASE_ANON_KEY
```

Supabase publishable/anon keys are designed for client use, but Row Level Security still controls access. Enable RLS and write policies for every client-accessible table. Never use a Supabase service-role key in the quick-connect field.

An optional account picker can list projects from a Supabase personal access token. That management token stays in memory for the current browser session and is not persisted to local storage.

### Connect Your PostgreSQL Server

1. Create a restricted database user for one application.
2. Allow network access from the bolt.gives runtime host.
3. In bolt.gives, open **Database > PostgreSQL**.
4. Paste a connection string such as `postgresql://app:password@db.example.com/app?sslmode=require`.
5. Select **Verify and connect**.

The runtime tests `SELECT 1` before saving the connection. It stores the URL in a mode-`0600` record outside project source and injects `DATABASE_URL` plus standard `PG*` variables into that project's server process. Only the provider, host, database name, and connection status return to the browser.

PostgreSQL URLs are deliberately excluded from static Cloudflare build environments. A browser-only static app should use Supabase or a separately deployed API rather than exposing direct PostgreSQL credentials.

## How We Reached v4

bolt.gives began as a browser-focused AI code generator. The v3 release line turned it into a hosted coding system: project persistence, server-side model routing, managed runtimes, Preview recovery, profile-scoped history, Cloudflare publishing, fleet administration, and reproducible template tests were added in successive patches.

That work exposed a product problem: Chat and Workspace competed for the screen, recovery could move the user between views, and important follow-up controls became difficult to find. v3.5 focused on first-pass Preview reliability and lower browser overhead. v4 then unified the complete flow into Agent Mode and made verified Preview the completion contract.

`v4.0.1` is the current stable web release. It retains v4's Agent Mode and fixes Cloudflare Pages' HTML fallback for omitted favicon requests so a healthy published project remains console-clean.

The complete release record is in [CHANGELOG.md](CHANGELOG.md).

## v4.1.0 Plan

**Make the existing workflow dependable before expanding it.** The [September audit](docs/quality/2026-09-12-v4.1-audit.md) combines six-module code tracing, isolated contract reproductions, 32 real-browser route visits, and hosted FREE project generation. It does not claim exhaustive coverage or error-free software.

| Finding                                                                             | How v4.1.0 will tackle it                                                                                            |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| B01: Package caches and nested dependencies enter source snapshots, increasing work | Filter generated trees consistently and bound snapshot bytes, file counts, and reads; measure browser/transport cost |
| B02: Disk edits with unchanged file counts can return stale source                  | Reconcile revisions, changes, deletions, and renames; test follow-up context and restore against the latest source   |
| B03: `/pricing` returns HTTP 500                                                    | Repair the server-render boundary and verify direct navigation plus the real Upgrade/login/Checkout path             |
| B04: No-database self-host registration returns 503 behind mandatory onboarding     | Add an explicit supported self-host identity mode and run both no-db and platform-db clean-install journeys          |
| B05: Saved provider credentials survive logout                                      | Make credentials account-owned and test complete cleanup across logout, account switches, and browser tabs           |
| B06: Unreachable Supabase settings appear connected                                 | Distinguish saved settings from verified connection health; test failure, rotation, and Preview restart behavior     |
| B07: Short-window login controls cannot be reached by scrolling                     | Fix available-height scrolling and test phone keyboards, banners, and zoom                                           |
| B08: Keyboard focus escapes the onboarding dialog                                   | Add real focus containment, background inertness, and accessible error/focus handling                                |
| B09: Pricing can claim payment from a return-URL parameter                          | Display payment state from authenticated server records, never from the query string alone                           |
| B10: Commentary can remain Active when Preview is Ready                             | Use one event-derived state and remove generic filler; verify reload, recovery, and readable status text             |
| B11: Screenshot/version gates and stale E2E selectors miss broken journeys          | Make normal onboarding, first Preview, interaction, follow-up, restore, and browser-error checks mandatory           |
| B12: Browsing fallback has a weaker destination-validation policy                   | Unify safe network validation, redirect handling, limits, and test doubles across browse transports                  |

The first audit run hit a Code/Preview switching timeout. A second completed the task-board journey, including an Add task interaction, follow-up subtitle, saved-project URL, and reload, but logged a snapshot 502. These errors remain investigation tasks, not a clean E2E pass. Typecheck and strict module boundaries passed; lint had zero errors and seven warnings; **1,167 tests passed, nine were skipped, and all six template Preview smokes passed**. Full Windows testing, a new managed-instance/publication journey, live billing, and real clean-OS installation were not performed in this audit.

[ROADMAP.md](ROADMAP.md) divides each finding into owned, reviewable subtasks with acceptance tests. Existing database-optional and MagnetAPI work must pass those gates before release. New feature expansion is deferred. A version number, screenshot, or HTTP 200 alone will not qualify v4.1.0 for release.

Work is split into two checkpoints. **Phase 1** addresses B01/B02/B03/B04/B05/B12. **Phase 2 is authorized and in progress**, addressing B06-B10 plus installer recovery and broader release evidence. Permission to deploy does not waive the Preview-origin security blocker or turn local tests into fleet, payment, clean-OS, or native-Windows certification.

### A Truly Native Windows Client

The preferred rewrite is **C++20 with C++/WinRT, WinUI 3/XAML, and the Windows App SDK**, developed and tested in a Windows environment. Native controls will handle authentication, projects, chat, editor, terminal, settings, and deployments. WebView2 is allowed only for generated-app Preview, not for loading the bolt.gives website as the application. Microsoft's [native Windows guidance](https://learn.microsoft.com/en-us/windows/apps/get-started/) supports WinUI 3 with C++ or C#.

First we will prove a small editor/terminal/Preview slice and measure it against the existing WPF client, which is already a native Windows technology. C# WinUI 3 remains an alternative only if that evidence supports a safer implementation. The [Windows work packages](docs/quality/2026-09-12-v4.1-audit.md#native-windows-rewrite) cover OTP login, account-safe migration, feature parity, responsive streaming, signed updates, rollback, and real Windows UI Automation.

**Desktop v1.10.2 remains the released client. Desktop v2.0.0 is the proposed rewrite version**, independent of web v4.1.0 and not yet shipped. Desktop source remains private; public releases receive compiled assets only. No mandatory replacement will be rolled out before native parity, signing, migration, and updater failure-path tests pass.

## Install on Ubuntu

The supported self-host target is Ubuntu 20.04 or newer. A current Ubuntu LTS release is recommended.

> **Stable versus development (B04):** the stable no-database installer has a mandatory-registration gap. The unreleased Phase 1 installer instead creates a private single-owner login without PostgreSQL or SMTP. Until those changes are released, stable installs should configure platform profile storage or use `--with-postgres`. Installer configuration/repair tests and isolated application journeys are not proof of a complete clean-machine apt/systemd/Caddy installation.

### Requirements

- A regular Linux user with `sudo` access. Do not run the installer as `root`.
- At least 4 GB RAM for the default production build.
- Outbound HTTPS access for GitHub, npm, model providers, and Playwright browser downloads.
- Optional app/admin DNS records if Caddy should provide public HTTPS.
- No PostgreSQL server unless local profile/admin persistence is required.

### Recommended Installer

Download and inspect the installer before running it:

```bash
curl -fsSL https://raw.githubusercontent.com/embire2/bolt.gives/main/install.sh -o install-bolt-gives.sh
less install-bolt-gives.sh
chmod +x install-bolt-gives.sh
./install-bolt-gives.sh
```

The development installer:

- verifies Ubuntu and refuses root execution;
- installs Node.js 22 and pnpm 9.14.4;
- clones or safely updates `main` without overwriting a dirty checkout;
- creates `.env.local` with independent generated secrets and mode `0600`;
- installs dependencies and builds the production application;
- creates app, runtime, collaboration, and web-browsing systemd services;
- optionally configures Caddy and HTTPS;
- leaves PostgreSQL off by default.

Recovery is bounded and explicit: failed downloads/package commands retry; dependency repairs retain the frozen lockfile; failed builds restore previous build artifacts; invalid Caddy configuration is rolled back without forcibly restarting the shared proxy. Repairs never reset an existing PostgreSQL role's password or take over another role's database. A failed Git update leaves the current installation and private configuration in place. Already-running services are explicitly restarted after a successful update, and health checks use finite timeouts. Rerun the same command after correcting a reported prerequisite. Disk exhaustion, invalid credentials, conflicting local changes, DNS, and operating-system reboots cannot be safely repaired by pretending success.

### Windows PowerShell Setup (Development)

The public [install.ps1](install.ps1) installs the **open-source server in Ubuntu on WSL2**, not the separately versioned native Windows desktop application. It supports Windows PowerShell 5.1 and PowerShell 7. Review the script in the validation checkout, then run:

```powershell
.\install.ps1 -CheckOnly
.\install.ps1 -InstallWsl
.\install.ps1
```

WSL installation requests administrator approval when needed. If a reboot or first-run Linux user setup is required, the script stops with instructions and can be rerun; it never silently restarts Windows or deletes a distribution. Ubuntu must use a non-root user with sudo and active systemd. See Microsoft's [WSL installation](https://learn.microsoft.com/en-us/windows/wsl/install) and [systemd configuration](https://learn.microsoft.com/en-us/windows/wsl/wsl-config#systemd-support) guidance. Downloads have bounded retries; nonzero Linux exit codes remain failures. No operator credentials are embedded.

Local PowerShell parser/contract tests pass; a full Windows/WSL installation and reboot-resume journey remains a release gate. The new CI workflow exercises Windows PowerShell 5.1/7 contracts and disposable Ubuntu 22.04/24.04 clean/repair installations with and without platform PostgreSQL. A workflow definition is not a passing CI run.

### Single-Owner Mode (Unreleased)

On a fresh database-free Phase 1 installation, the installer sets `BOLT_SELF_HOST_MODE=single-user` and generates `BOLT_SELF_HOST_ACCESS_TOKEN` in the protected `.env.local` file inside the installation directory (by default, `$HOME/bolt.gives`). Open that file privately on your server, enter the owner token in the browser's **Your private workspace** form, then select an AI provider and enter your own API key. Do not share or commit the owner token.

This is one private owner, not an unauthenticated multi-user service. The profile and hashed sessions survive runtime restarts in a mode-`0600` file outside project source. Repair installs preserve the token; explicitly rotating it invalidates prior sessions while retaining the owner identity. Runtime HTTP and Preview WebSocket requests pass through owner authentication. Keep the runtime listener private on loopback.

Existing platform-PostgreSQL installations are not silently converted to single-owner mode. New `--with-postgres` installs retain the hosted profile workflow. Generated projects remain database-free in either mode. A fresh self-host does not inherit the hosted FREE operator key, Stripe settings, SMTP credentials, or Cloudflare account.

To install optional PostgreSQL for bolt.gives profile/admin data:

```bash
./install-bolt-gives.sh --with-postgres
```

To configure public domains in one command:

```bash
./install-bolt-gives.sh \
  --app-domain code.example.com \
  --admin-domain admin.example.com \
  --letsencrypt-email ops@example.com
```

Useful options:

| Option            | Purpose                                                  |
| ----------------- | -------------------------------------------------------- |
| `--with-postgres` | Install local PostgreSQL for platform profile/admin data |
| `--skip-postgres` | Explicitly keep the database-free default                |
| `--skip-caddy`    | Run services without public Caddy configuration          |
| `--skip-build`    | Update source/configuration without rebuilding           |
| `--skip-service`  | Do not install or restart systemd units                  |
| `--branch NAME`   | Install a branch other than `main` for testing           |

After installation:

```bash
sudo systemctl status bolt-gives-app --no-pager
sudo systemctl status bolt-gives-runtime --no-pager
sudo systemctl status bolt-gives-collab --no-pager
sudo systemctl status bolt-gives-webbrowse --no-pager
```

Run the executable installer smoke before publishing installer changes:

```bash
pnpm smoke:self-host-installer
```

The detailed checklist is in [docs/fresh-install-checklist.md](docs/fresh-install-checklist.md).

## Developer Setup

```bash
git clone https://github.com/embire2/bolt.gives.git
cd bolt.gives
corepack enable
corepack prepare pnpm@9.14.4 --activate
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev
```

Use Node 22.22.0 from [.nvmrc](.nvmrc). Keep real credentials only in ignored `.env.local` files or a platform secret store. Never put them in `.env.example`, screenshots, logs, generated projects, or commits.

Self-hosters can configure their own supported model provider in Settings. The hosted FREE provider and its quota are server-side services operated by the public deployment; cloning this repository does not grant access to private hosted credentials.

## Six Modules, One Build

The source is split into six ownership modules so most changes touch only one or two domains:

| Package               | Responsibility                                                                  |
| --------------------- | ------------------------------------------------------------------------------- |
| `@bolt/core`          | Shared contracts, paths, security, logging, URLs, and low-level utilities       |
| `@bolt/agent`         | Providers, prompts, context, streams, tools, commentary, browsing, and recovery |
| `@bolt/runtime`       | Hosted commands, workspace sync, Preview lifecycle, health, and isolation       |
| `@bolt/project`       | Files, history, Workbench, editor, terminal, actions, and integrations          |
| `@bolt/control-plane` | Profiles, tenants, instances, updates, publishing, billing, mail, and audit     |
| `@bolt/surfaces`      | Remix routes, application chrome, Cloudflare adapters, and orchestration        |

Read [docs/architecture/modules.md](docs/architecture/modules.md), [AGENTS.md](AGENTS.md), and the nearest module `AGENTS.md` before making a cross-module change.

## Validate a Change

Use the smallest module check while developing:

```bash
pnpm module:list
pnpm module:check runtime
pnpm module:affected
```

Before a code change is released:

```bash
pnpm check:boundaries:strict
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Cross-boundary behavior also needs its relevant browser or service smoke. A prompt-to-preview E2E is complete only when a normal browser creates files, reaches a healthy Preview, applies a follow-up change to the same project, and reloads with history intact.

Refresh README screenshots with:

```bash
./scripts/capture-screenshots.sh
```

## Test It and Tell Us What Breaks

The project needs testing on VPS providers, network configurations, browsers, generated frameworks, and application ideas that maintainers will not discover alone.

1. Install `main` on an Ubuntu test server.
2. Create a real application from a normal English prompt.
3. Wait for the health-verified Preview.
4. Ask for a follow-up change.
5. Reload and reopen the project from history.
6. Try a Supabase connection, a restricted PostgreSQL connection, or no database at all.
7. Publish if your Cloudflare integration is configured.

Open a [bug report](https://github.com/embire2/bolt.gives/issues/new/choose) with the route, selected provider/model, exact visible error, final command exit code, Preview health reason, browser console output, and redacted service logs. Never attach credentials or customer data.

Use [GitHub Discussions](https://github.com/embire2/bolt.gives/discussions) for product feedback, installation reports, template ideas, and roadmap proposals. A reproducible report with a small test project is more useful than a broad statement that generation failed.

## Contributing

Contributions are welcome from first-time and experienced open-source developers.

1. Read [CONTRIBUTING.md](CONTRIBUTING.md) and choose an existing Issue or a focused roadmap item.
2. Comment on the Issue before starting a large change so work is not duplicated.
3. Fork the repository and branch from `main`.
4. Fix the smallest owning module and add a regression test.
5. Run the affected module check and the full required gates.
6. Open a pull request explaining the user problem, root cause, solution, and verification evidence.

Good first contributions include installer portability reports, accessible UI fixes, template smoke coverage, provider schema tests, Preview recovery reproductions, documentation corrections, and browser bundle reductions.

## Security

Do not report vulnerabilities in a public Issue. Follow the repository's private security-reporting path where available, and never include production credentials, session cookies, database URLs, SSH material, or customer data in a report.

Generated code and model output are untrusted. The runtime includes path/command validation, workspace isolation, recovery bounds, and secret-handling controls. The [audit](docs/quality/2026-09-12-v4.1-audit.md) identifies remaining snapshot-filtering, credential-lifecycle, and browse-validation gaps; these must be fixed and tested rather than treated as already complete.

## License

[MIT](LICENSE)
