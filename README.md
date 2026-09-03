# bolt.gives

> **Looking for the commercial edition?** [WebCoder.Codes](https://webcoder.codes) is the commercial version of this project. Its team of 120+ developers is building a managed Agentic Coding experience for organizations that want commercial hosting, support, and product development beyond the open-source release.

[![Current release](https://img.shields.io/badge/release-v4.0.1-173f5f)](https://github.com/embire2/bolt.gives/releases)
[![Next release](https://img.shields.io/badge/roadmap-v4.1.0-d97706)](ROADMAP.md)
[![License](https://img.shields.io/badge/license-MIT-148456)](LICENSE)
[![Node](https://img.shields.io/badge/Node.js-22.x-339933)](.nvmrc)
[![pnpm](https://img.shields.io/badge/pnpm-9.14.4-f69220)](package.json)

**bolt.gives is an open-source Agentic Coding platform that turns a plain-English request into a working, previewable web application.** It writes the files, installs dependencies, runs commands, starts the development server, checks that Preview is healthy, and keeps the prompt available for follow-up changes.

[Try bolt.gives](https://bolt.gives) | [Report a bug](https://github.com/embire2/bolt.gives/issues/new/choose) | [Share feedback](https://github.com/embire2/bolt.gives/discussions) | [Read the roadmap](ROADMAP.md)

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

The hosted FREE model menu currently supports ChatGPT-5.6 SOL, Opus 4.8, Sonnet 5, and Fable 5 through the server-side provider configured by the operator. Provider credentials do not enter the browser bundle or generated project.

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
5. Select **Connect Supabase** and continue prompting.

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

v4.1.0 continues reliability and operator hardening rather than adding another competing workspace concept.

The current `main` branch already contains the first v4.1 work: database-free generated projects, two-field Supabase quick connect, private user-owned PostgreSQL connections, database-optional dedicated CLI workspaces, a database-free Ubuntu installer, and session-scoped runtime cleanup that cannot terminate another workspace's build process.

Before v4.1.0 is declared stable, the plan is to:

- Expand clean-install and partial-repair tests across supported Ubuntu LTS releases.
- Complete production RBAC, approvals, invitations, and password-reset lifecycle coverage.
- Add collaboration audit export and stronger runtime-node quota visibility.
- Complete customer billing portal, cancellation, invoices, top-ups, and entitlement search.
- Add database connection health, credential rotation, and deployment guidance.
- Move more reconciliation off the browser and continue splitting the remaining legacy source hotspots.
- Keep reducing initial JavaScript and enforce bundle budgets in CI.

See [ROADMAP.md](ROADMAP.md) for the live checklist. Roadmap items are proposals until their tests, documentation, and release evidence are complete.

## Install on Ubuntu

The supported self-host target is Ubuntu 20.04 or newer. A current Ubuntu LTS release is recommended.

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

The installer:

- verifies Ubuntu and refuses root execution;
- installs Node.js 22 and pnpm 9.14.4;
- clones or safely updates `main` without overwriting a dirty checkout;
- creates `.env.local` with independent generated secrets and mode `0600`;
- installs dependencies and builds the production application;
- creates app, runtime, collaboration, and web-browsing systemd services;
- optionally configures Caddy and HTTPS;
- leaves PostgreSQL off by default.

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

Generated code and model output are untrusted. The runtime validates paths and commands, isolates workspaces, filters machine-local trees from snapshots, bounds recovery, and keeps infrastructure credentials outside browser bundles and project artifacts.

## License

[MIT](LICENSE)
