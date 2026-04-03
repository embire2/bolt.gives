<p align="center">
  <img src="public/boltlogo2.png" alt="bolt.gives" width="360" />
</p>

<p align="center">
  collaborative, open-source ai coding workspace
</p>

<p align="center">
  <a href="https://bolt.gives">
    <img alt="Join the mailing list" src="https://img.shields.io/badge/join%20the%20mailing%20list-bolt.gives-0a84ff?style=for-the-badge" />
  </a>
</p>

<p align="center">
  <a href="https://alpha1.bolt.gives">live alpha</a> ·
  <a href="CHANGELOG.md">changelog</a> ·
  <a href="ROADMAP.md">roadmap</a> ·
  <a href="#installation-ubuntu-1804-only-verbose-tested">install</a>
</p>

## Experimental Cloudflare Instance Spawn

`v3.0.6` keeps the implementation blueprint for an **experimental managed Cloudflare instance service** for bolt.gives and adds a lighter browser startup path, stronger tenant approval/invite lifecycle controls, and a release gate that now executes the live smoke path before shipping.

What is technically possible at **no cost from Cloudflare** today:

- Run the experimental managed service on a **shared Cloudflare Workers / Pages / Workers Builds path**.
- Give each client **one managed workspace / logical instance**, enforced by a tenant registry and provisioning locks.
- Roll out updates automatically from `main` by using **Cloudflare Git integration / Workers Builds** as the control-plane source of truth.
- Keep the service **free and experimental** while capacity lasts.

What is **not** free on Cloudflare today:

- A dedicated **Cloudflare Containers `standard-2`** runtime (`6 GiB` RAM / `12 GB` disk) per client.

Product split:

- **Free experimental**: shared Cloudflare runtime, one client / one managed workspace, automatic git updates.
- **Future Pro from `$12/month`**: dedicated `6 GiB` Node container, more tools, and higher limits.

Implementation files in this repo:

- `docs/cloudflare-managed-instances.md`
- `docs/cloudflare-managed-instances.sql`

Important:

- This is a **real implementation plan and operator blueprint**, not a claim that a fully public self-service spawn API is already live.
- The free experimental path is designed around Cloudflare's free-tier products.
- The dedicated `6 GiB` Node instance is intentionally moved to the future Pro path, because Cloudflare Containers do not provide that tier at zero cost.
- The public, automated spawn control plane is tracked in `ROADMAP.md` under `v3.0.7`.

## App Overview

Current version: **v3.0.6**

Next release targets:

- `v3.0.7`: managed Cloudflare control plane, explicit preview lifecycle states, continued browser-weight reduction, and production tenant hardening.

Current `v3.0.6` release line:

- Hosted `alpha1`, `ahmad`, and similar managed instances now run install/build/dev-server/preview workloads through a managed server-side runtime by default.
- Browser-side WebContainer remains available as the fallback path, but it is no longer the default execution mode on hosted instances.
- Production builds now split the client more aggressively into explicit subsystem chunks instead of one oversized generic vendor path.
- The heaviest default browser path no longer carries client-side Shiki syntax highlighting for chat code blocks, tool payloads, artifact shell blocks, or diff rendering.
- Workbench export, repository push, and test/security scan integrations now lazy-load their heavy dependencies instead of inflating the shared startup store.
- More of the heavy desktop shell is now split into on-demand chunks, including `Workbench`, `Preview`, `DiffView`, provider/settings/deploy surfaces, and the execution/commentary panels.
- Markdown, code rendering, thought blocks, and artifact rendering now sit behind deeper lazy boundaries so heavy language/rendering code only loads when a message actually needs it.
- Long technical feeds now virtualize large event windows instead of keeping the full timeline mounted in the browser.
- Hosted instances still default to a built-in `FREE` provider backed by `DeepSeek V3.2`.
- The hosted free model runs through a server-side OpenRouter token that is not exposed to browser users.
- Hosted FREE now exposes only `DeepSeek V3.2`, so the installed product behaves exactly as the UI advertises.
- The browser now reads provider metadata from a lightweight catalog, so provider SDKs stay on the server path and users still keep their own API-key flows for supported providers.
- Cloudflare Pages / preview deployments now resolve hosted FREE credentials more reliably, including relay support when the preview runtime does not have the managed FREE secret locally configured.
- Cloudflare Pages coding sessions now route collaboration/event websocket traffic to the managed collaboration backend instead of self-targeting nonexistent `/collab` endpoints, which previously left long runs stuck behind heartbeat commentary with no stable preview.
- Hosted preview health/error detection now reads server-side preview diagnostics instead of depending on browser iframe scraping, which gives Architect a cleaner signal for self-heal on runtime failures.
- Hosted preview status polling now follows the exact session id embedded in the active preview URL, so preview recovery stays attached to the real managed runtime session instead of stale client state.
- Hosted preview updates now use compact server summaries plus SSE instead of relying on tight browser polling loops for state churn.
- Hosted preview health is now verified on the server after workspace mutations, so self-heal can restore the last known good snapshot even if the browser never catches the transient failure overlay.
- The main shell is now split into top-level `Chat` and `Workspace` tabs, so prompt/live commentary is isolated from files/preview/terminal and future surfaces can be opened or closed without crushing the prompt area.
- `Chat` now stays active by default while `Workspace` opens, so early run progress stays visible instead of being hidden behind files/preview immediately.
- Live managed instances now always land on `Chat` first, with `FREE` + `DeepSeek V3.2` preselected so users can start prompting immediately.
- `Workspace` now includes a bottom `Workspace Activity` area with commentary, execution transparency, and technical timeline information.
- Provider/model visibility is restored directly above the prompt box so users can always see what AI path is active.
- Saved provider preferences now tolerate partial browser state without breaking the live model list on startup.
- Sidebar access is explicit again through the header button and left-edge opener; it no longer relies on accidental hover to expose chat history.
- Terminal visibility changes no longer crash the `Workspace` surface on stale panel-layout state.
- A bootstrap `Tenant Admin` dashboard is now available on server-hosted instances at `/tenant-admin`, with default bootstrap credentials `admin / admin`.
- Tenant admin now includes bootstrap password rotation, pending approval, tenant enable/disable controls, lifecycle/login metadata, and invite-based onboarding/reset flows on the server-hosted baseline.
- Tenant users now also have a dedicated `/tenant` sign-in, invite acceptance, and password-rotation portal.
- The repo now includes a committed live smoke script at `scripts/live-release-smoke.mjs` exposed via `pnpm run smoke:live`, and the release workflow now boots the local runtime stack and executes that smoke before release completion.
- This repo now includes the operator blueprint and tenancy schema for an experimental **one-client / one-instance Cloudflare managed service**, with:
  - a free experimental shared-runtime path
  - a future Pro path for dedicated `6 GiB` Node containers

bolt.gives is an open-source, free, collaborative AI coding workspace.

Core principles:

- Open source and free to self-host/use.
- Zero-required-database setup for bolt.gives core.
- Optional databases/integrations are for user projects only.
- Transparent agent execution (users can see what is happening and why).

Platform support:

- Use in browser: Windows/macOS/Linux.
- Install/self-host: **Ubuntu 18.04+ only**.

Release verdict for `v3.0.1`:

- Local gates passed: `typecheck`, `lint`, `test`, `build`
- Local dev smoke passed
- Live smoke passed on `https://alpha1.bolt.gives`
- Live smoke passed on `https://ahmad.bolt.gives`

Release verdict for `v3.0.6`:

- Local gates passed: `typecheck`, `lint`, `test`, `build`
- Cloudflare Pages FREE-provider path now passes live verification
- Live smoke still passes on `https://alpha1.bolt.gives`
- Live smoke still passes on `https://ahmad.bolt.gives`
- Live hosted-runtime browser E2E passed on `https://alpha1.bolt.gives` with OpenAI `gpt-5.4`, including server-side sync replacing the fallback starter inside preview without a manual reload.
- Live hosted-runtime auto-recovery E2E now passes on `https://alpha1.bolt.gives` by generating a hosted app, intentionally breaking it, and verifying that the managed runtime restores the last known good snapshot and returns preview to healthy.
- `pnpm run smoke:live` is now the committed combined smoke path for generated-app success plus preview break/recovery.

What `v3.0.6` specifically changes:

- Hosted instances now prefer the managed server-side runtime for installs, builds, preview hosting, and file sync, with WebContainer reduced to the fallback path instead of the default.
- Hosted preview iframes now refresh when new server-side file sync revisions land, so generated apps replace the starter automatically.
- Hosted preview failure detection now comes from retained server-side preview diagnostics, letting the app surface preview errors and self-heal candidates without asking the browser to inspect the iframe document itself.
- Managed runtime session ids now stay literal and safe across workspace sync, preview URLs, preview-status lookups, and Architect recovery, which removes a hidden runtime id remap from the hosted path.
- Browser terminals on hosted instances now stay lightweight and status-oriented instead of pulling heavy interactive shell work into the client tab.
- `Workbench`, `Preview`, `DiffView`, provider/settings/deploy surfaces, and execution/commentary panels now load on demand, reducing the default browser bundle cost of the main shell.
- Markdown/code/thought/artifact rendering now loads behind deeper lazy boundaries instead of front-loading language-heavy chat rendering into the initial shell.
- Long technical feeds now virtualize large event lists so long coding sessions keep the browser responsive instead of mounting the full timeline at once.
- Hosted preview state now reaches the browser through compact server summaries and SSE updates, which cuts the frequency and size of preview-status churn in the client tab.
- Hosted runtime now performs its own preview health verification after workspace mutations, so a broken generated app can auto-heal even if the browser never captures the overlay/error document.
- Provider metadata no longer depends on the full browser-side `LLMManager` graph, which keeps provider SDK resolution on the server and reduces client startup weight.
- Commentary heartbeats now derive from the active file/command/step state instead of generic keep-alive phrasing.
- Tenant users now have a dedicated account portal and server-backed password rotation flow instead of relying only on the bootstrap admin surface.
- Cloudflare Pages / preview deployments now resolve hosted FREE-provider credentials correctly across both Pages-style and Worker-style runtime contexts.
- If a public Pages runtime does not have a local hosted FREE secret, it can now relay hosted FREE requests back to the managed runtime instead of failing with a token error.
- Public Pages deployments now automatically discard unsafe/stale collaboration socket settings and reconnect to the managed collaboration backend, preventing coding runs from pausing on repeated `/collab` websocket `404` failures.
- The repo now documents the managed Cloudflare instance service architecture with an honest split:
  - free experimental shared-runtime path at no platform cost
  - future Pro path for dedicated Cloudflare Containers `standard-2` (`6 GiB`)
  - automatic rollout design from `main`
- Release/versioning/docs are now aligned on the `v3.0.6` line.

What still remains after `v3.0.6`:

- The validated OpenAI core path is now working.
- The heaviest hosted install/build/preview work is now off the browser, but the client bundle and long-run UI rendering are still heavier than they should be.
- `ROADMAP.md` now tracks the current stable `v3.0.6` baseline and the next major delivery bucket `v3.0.7`.
- `v3.0.7` is focused on completing the managed-instance control plane, explicit preview lifecycle states, full production tenant/RBAC hardening, and pushing the remaining heavy editor/runtime payloads deeper behind on-demand boundaries.

## Screenshots

Home:
![bolt.gives home](docs/screenshots/home.png)

Chat:
![bolt.gives chat](docs/screenshots/chat.png)

Plan prompt example:
![bolt.gives plan prompt](docs/screenshots/chat-plan.png)

System in action:
![bolt.gives system in action](docs/screenshots/system-in-action.png)

Changelog:
![bolt.gives changelog](docs/screenshots/changelog.png)

## Roadmap (Post-3.0.5)

Roadmap files:

- Summary tracker: `ROADMAP.md`

Current roadmap split:

- `v3.0.6`: shipped baseline for a thinner client shell, tenant approval/invite lifecycle, runtime-event-driven commentary, and release-gated live smoke coverage.
- `v3.0.7`: managed Cloudflare control plane, production tenant hardening, remaining browser-weight reduction, and operator/rollback tooling.

## Current Features (v3.0.6)

- Built-in hosted `FREE` provider support with a locked server-side OpenRouter path for `DeepSeek V3.2`.
- FREE now exposes exactly one shipped model option so new installs can start coding immediately without choosing or configuring a model first.
- Default provider selection now prefers the hosted `FREE` coder on managed instances, while preserving the full user-configurable `OpenRouter` provider separately.
- Lightweight provider metadata catalog in the browser so provider SDK implementations stay on the server and user-managed provider/API-key flows still work.
- Managed hosted runtime on live instances for installs, builds, tests, dev servers, preview hosting, and file sync, with browser-side WebContainer retained only as the fallback path.
- Server-side preview diagnostics and status polling so preview failures can be detected and routed into self-heal without relying on browser-side iframe inspection.
- Compact hosted preview SSE updates plus lower-frequency reconciliation polling instead of tight browser-side preview polling loops.
- Server-side post-mutation preview health verification so self-heal can detect and restore broken generated apps without waiting for the browser to parse an iframe error state.
- Cloudflare Pages / preview deployments can now reuse the hosted FREE route through the managed runtime when the preview deployment does not hold the managed secret itself.
- Top-level `Chat` / `Workspace` tabs with closable workspace persistence so prompt/commentary and files/preview can be focused independently.
- `Chat` stays active by default while the workspace opens, so users can keep reading progress instead of being forced into the workbench immediately.
- `Workspace` includes a bottom `Workspace Activity` panel with live commentary, execution transparency, and technical timeline visibility.
- Harder lazy-loading of `Workbench`, `Preview`, `DiffView`, provider/settings/deploy surfaces, and execution/commentary panels to reduce default browser load.
- Deeper lazy-loading of markdown/code/thought/artifact rendering so message-heavy language tooling is deferred until it is actually used.
- **Functional Runtime Scanner**: Active error monitoring in the Workbench that intercepts dev server/preview failures and automatically queues AI auto-fixes.
- **Modern Red-to-Blue Theme**: Polished glassmorphism UI with transparent headers and an inset editor card design.
- **Web IDE Integration**: Quick-access button to deploy or manipulate your workspace directly in `webcontainer.codes` via the header.
- **E2B Sandbox Support**: Cloud-hosted Linux sandbox as an alternative to the in-browser WebContainer. Enable in Settings → Cloud Environments with your E2B API key.
- **Firecrawl Integration**: Cloud-based web scraping via the Firecrawl API as an alternative to the local Playwright server. Configure via `FIRECRAWL_API_KEY` env var or in Settings.
- **BoltContainer**: Custom WebContainer alternative built by bolt.gives. Features an in-memory VFS with file watchers, E2B cloud execution, and drop-in API compatibility. Select in Settings → Cloud Environments → Runtime Engine.
- Explicit manual Vite chunking for the major client subsystems so React/editor/terminal/collaboration/markdown/git/chart code no longer collapses into one oversized generic vendor blob.
- Lightweight default code/tool/artifact/diff rendering that removes client-side Shiki from the normal runtime path.
- Lazy workbench integrations for export, repository push, and test/security scan flows so heavy libraries only load when the user actually opens those actions.
- Experimental managed Cloudflare instance architecture documented in-repo, including one-client / one-instance enforcement, a no-cost shared-runtime path, a future `standard-2` (`6 GiB`) Pro tier, and automatic rollout design from `main`.
- Commentary-first coding workflow (`Plan -> Doing -> Verifying -> Next`) with visible execution progress.
- Dedicated `Live Commentary` feed separated from the technical timeline so plain-English updates stay visible during long runs.
- Anti-stall detection and auto-recovery events in timeline.
- Execution transparency panel (model/provider/step/elapsed/actions/recovery state).
- Safer autonomy modes (`read-only`, `review-required`, `auto-apply-safe`, `full-auto`).
- Architect self-heal knowledgebase for common scaffold/build/runtime failures.
- Preview runtime errors can now be queued directly into Architect auto-repair instead of relying only on a manual `Ask Bolt` action.
- Tenant admin supports bootstrap password rotation, tenant enable/disable actions, and lifecycle/login metadata on server-hosted instances.
- Tenant users now have a `/tenant` sign-in portal with password rotation.
- Multi-provider model support and model/provider/API-key persistence.
- Web browsing tools (`web_search`, `web_browse`) with Playwright-backed extraction (or Firecrawl when configured).
- Real-time collaboration support (Yjs + websocket server).
- First-party deployment support and update manager.
- Cost estimation subsystem with cross-provider normalization.
- Long-run timeline de-bloat and feed virtualization.
- Virtualized technical feed rendering for larger execution histories.
- Path-safe artifact writing and starter-continuation safeguards so fallback scaffolds continue into a real app instead of stopping at the starter.
- Resilient dev-side helper services that reuse existing collaboration/web-browse ports instead of crashing on `EADDRINUSE`.
- Repeatable live release smoke automation via `pnpm run smoke:live`.

## Installation (Ubuntu 18.04+ Only, Verbose, Tested)

This installation path is designed to run bolt.gives locally with no required database.

### 0. What you need

- Ubuntu `18.04+` (recommended `22.04+`)
- A user account with `sudo` access
- Internet access for package installation and GitHub clone

Windows/macOS note:

- You can use bolt.gives in the browser on Windows/macOS.
- You should install/self-host bolt.gives on Ubuntu 18.04+.

### 1. Recommended: run the installer

Download the installer from GitHub, inspect it, then run it:

```bash
curl -fsSL https://raw.githubusercontent.com/embire2/bolt.gives/main/install.sh -o install-bolt-gives.sh
chmod +x install-bolt-gives.sh
./install-bolt-gives.sh
```

The installer will:

- install `git`, `curl`, `ca-certificates`, and `build-essential`
- install Node.js `22.x`
- install a compatible `pnpm 9.x` release (repo-pinned to `9.14.4`)
- clone or update `https://github.com/embire2/bolt.gives`
- create `.env.local` from `.env.example` if it does not exist
- build the app with a **4 GB** Node heap (`NODE_OPTIONS=--max-old-space-size=4096`)
- install and start these systemd services:
  - `bolt-gives-app`
  - `bolt-gives-collab`
  - `bolt-gives-webbrowse`

Optional overrides:

```bash
INSTALL_DIR="$HOME/apps/bolt.gives" ./install-bolt-gives.sh
```

After the installer finishes:

- app: `http://127.0.0.1:5173`
- collaboration server: `ws://127.0.0.1:1234`
- web browsing service: `http://127.0.0.1:4179`

### 2. Add your provider keys

The installer creates `.env.local` for you. Edit it after install:

```bash
cd ~/bolt.gives
nano .env.local
```

Then restart the services:

```bash
sudo systemctl restart bolt-gives-app bolt-gives-collab bolt-gives-webbrowse
```

No database setup is required for the bolt.gives core runtime.

Hosted-instance note:

- If you run a managed/shared instance, you can define `FREE_OPENROUTER_API_KEY` server-side to expose a locked hosted coder without exposing the token to users.
- Keep `OPEN_ROUTER_API_KEY` unset on hosted/shared instances if you want the public `OpenRouter` provider to remain user-supplied.
- The hosted `FREE` coder is pinned to `deepseek/deepseek-v3.2`. If that protected route is unavailable, the UI surfaces a clear retry/switch-provider error instead of silently routing to another model.

### 3. Verify the install

```bash
sudo systemctl status bolt-gives-app --no-pager
sudo systemctl status bolt-gives-collab --no-pager
sudo systemctl status bolt-gives-webbrowse --no-pager
```

Open `http://127.0.0.1:5173`, then verify:

- UI loads without a server crash
- chat opens
- terminal and preview panels render
- collaboration and web browsing helper services are reachable

### 4. Manual install alternative

If you do not want to use the installer, this is the validated manual path.

```bash
sudo apt-get update
sudo apt-get install -y git curl ca-certificates build-essential
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo npm install -g pnpm@9.14.4
git clone https://github.com/embire2/bolt.gives.git
cd bolt.gives
cp .env.example .env.local
pnpm install --frozen-lockfile || pnpm install
NODE_OPTIONS=--max-old-space-size=4096 pnpm exec remix vite:build
```

Run it locally:

```bash
# terminal 1
NODE_OPTIONS=--max-old-space-size=4096 pnpm run collab:server

# terminal 2
NODE_OPTIONS=--max-old-space-size=4096 pnpm run webbrowse:server

# terminal 3
NODE_OPTIONS=--max-old-space-size=4096 pnpm run start
```

### 5. Contributor note about memory

The repo still contains heavier maintainer scripts used for large local test/build workflows.  
The installer and manual self-host path above are the validated open-source install path and run with a **4 GB** Node heap.

## Deploying To Cloudflare Pages

This repo is configured for Cloudflare Pages via `wrangler.toml`:

- Build output: `build/client`
- Pages Functions entry: `functions/[[path]].ts`

If your Pages build runs out of memory, increase Node's heap:

- Set `NODE_OPTIONS=--max-old-space-size=6142` in Cloudflare Pages build environment
- Or use a high-memory build command: `NODE_OPTIONS=--max-old-space-size=6142 pnpm run build`
- Or run: `pnpm run build:highmem`

Fresh install checklist:

- `docs/fresh-install-checklist.md`

## Built-In Web Browsing

bolt.gives can now browse docs from user prompts like:

- `Study these API documentation: https://developers.cloudflare.com/workers/`

How it works:

- The model uses built-in tools: `web_search` and `web_browse`.
- `web_browse` reads the target URL with Playwright and extracts title, headings, links, and body content.
- The model can then create a Markdown study file directly in the workspace using `<boltAction type="file">`.

Configuration:

- `WEB_BROWSE_SERVICE_URL` (optional): URL for the browsing service.
  - Default: `http://127.0.0.1:4179`
- Browser install is handled during dependency install (`pnpm install`) via postinstall.
  - To skip browser download: `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 pnpm install`

## Real-Time Collaboration

The editor uses Yjs and connects to a local `y-websocket` compatible server.

- Server script: `scripts/collaboration-server.mjs`
- Default WS URL: `ws://localhost:1234`
- Default persistence directory: `.collab-docs` (override with `COLLAB_PERSIST_DIR`)

Client settings (stored in browser localStorage):

- `bolt_collab_enabled` (defaults to enabled when unset)
- `bolt_collab_server_url` (defaults to `ws://localhost:1234`)

## Screenshots (Reproducible)

To refresh the screenshots used in this README:

```bash
./scripts/capture-screenshots.sh
```

Outputs:

- `docs/screenshots/home.png`
- `docs/screenshots/chat.png`
- `docs/screenshots/chat-plan.png`
- `docs/screenshots/system-in-action.png`
- `docs/screenshots/changelog.png`

To capture screenshots from the live alpha environment instead of a local dev server:

```bash
SKIP_DEV_SERVER=1 BASE_URL=https://alpha1.bolt.gives ./scripts/capture-screenshots.sh
```

To generate a shared-session restore screenshot (requires Supabase configured in `.env.local`):

```bash
node scripts/e2e-sessions-share-link.mjs
```

## Validation Gate

Before pushing changes:

```bash
pnpm run typecheck
pnpm run lint
pnpm test
pnpm run gate:release:live
```

`gate:release:live` checks:

- both live domains (`alpha1.bolt.gives` and `ahmad.bolt.gives`) return healthy pages
- live version + changelog version match `package.json`
- screenshot capture assertions pass (no server-error capture states, expected dimensions, non-empty output)

## Mailing List

Join our mailing list for future updates and release announcements:

- https://bolt.gives

## Docker Images (GHCR)

This repo includes a `Docker Publish` GitHub Actions workflow that can build and (optionally) push images to GitHub Container Registry.

By default, publishing is disabled. To enable pushing to GHCR:

1. Create an Actions variable: `GHCR_PUSH_ENABLED=true`
2. (Optional) Create an Actions secret: `GHCR_PAT` with `read:packages` and `write:packages`

Notes:

- If `GHCR_PAT` is not set, the workflow will fall back to the built-in `GITHUB_TOKEN`.
- Images publish to `ghcr.io/<owner>/<repo>`.

## Roadmap

See `ROADMAP.md`.

## Contributing (Fork + PR Workflow)

We follow a standard GitHub fork + PR workflow.

1. Fork this repository on GitHub.
2. Clone your fork locally:
   ```bash
   git clone https://github.com/<your-username>/bolt.gives.git
   cd bolt.gives
   ```
3. Add the upstream remote:
   ```bash
   git remote add upstream https://github.com/embire2/bolt.gives.git
   git fetch upstream
   ```
4. Create a branch off `main`:
   ```bash
   git checkout -b feat/my-change
   ```
5. Make changes and run the validation gate:
   - `pnpm run typecheck`
   - `pnpm run lint`
   - `pnpm test`
6. Push your branch to your fork and open a Pull Request targeting `embire2/bolt.gives:main`.

PR expectations:

- Keep PRs focused (one feature/bugfix per PR).
- Explain what changed, why, and how reviewers can verify it.
- Do not commit secrets. Put keys in `.env.local` (gitignored).

## License

MIT
