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

`v3.0.2` adds the implementation blueprint for an **experimental managed Cloudflare instance service** for bolt.gives.

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
- The public, automated spawn control plane is tracked in `ROADMAP.md` under `v3.0.3`.

## App Overview

Current version: **v3.0.2**

Next release targets:

- `v3.0.3`: server-first heavy execution + managed Cloudflare instance control plane.

Current `v3.0.2` release line:

- Hosted `alpha1`, `ahmad`, and similar managed instances now run install/build/dev-server/preview workloads through a managed server-side runtime by default.
- Browser-side WebContainer remains available as the fallback path, but it is no longer the default execution mode on hosted instances.
- Hosted instances still default to a built-in `FREE` provider backed by `DeepSeek V3.2`.
- The hosted free model runs through a server-side OpenRouter token that is not exposed to browser users.
- Hosted FREE still silently falls back to `qwen/qwen3-coder` if `DeepSeek V3.2` is unavailable, without exposing the fallback model in the client UI.
- Cloudflare Pages / preview deployments now resolve hosted FREE credentials more reliably, including relay support when the preview runtime does not have the managed FREE secret locally configured.
- Cloudflare Pages coding sessions now route collaboration/event websocket traffic to the managed collaboration backend instead of self-targeting nonexistent `/collab` endpoints, which previously left long runs stuck behind heartbeat commentary with no stable preview.
- The main shell is now split into top-level `Chat` and `Workspace` tabs, so prompt/live commentary is isolated from files/preview/terminal and future surfaces can be opened or closed without crushing the prompt area.
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

Release verdict for `v3.0.2`:

- Local gates passed: `typecheck`, `lint`, `test`, `build`
- Cloudflare Pages FREE-provider path now passes live verification
- Live smoke still passes on `https://alpha1.bolt.gives`
- Live smoke still passes on `https://ahmad.bolt.gives`
- Live hosted-runtime browser E2E passed on `https://alpha1.bolt.gives` with OpenAI `gpt-5.4`, including server-side sync replacing the fallback starter inside preview without a manual reload.

What `v3.0.2` specifically changes:

- Hosted instances now prefer the managed server-side runtime for installs, builds, preview hosting, and file sync, with WebContainer reduced to the fallback path instead of the default.
- Hosted preview iframes now refresh when new server-side file sync revisions land, so generated apps replace the starter automatically.
- Browser terminals on hosted instances now stay lightweight and status-oriented instead of pulling heavy interactive shell work into the client tab.
- Cloudflare Pages / preview deployments now resolve hosted FREE-provider credentials correctly across both Pages-style and Worker-style runtime contexts.
- If a public Pages runtime does not have a local hosted FREE secret, it can now relay hosted FREE requests back to the managed runtime instead of failing with a token error.
- Public Pages deployments now automatically discard unsafe/stale collaboration socket settings and reconnect to the managed collaboration backend, preventing coding runs from pausing on repeated `/collab` websocket `404` failures.
- The repo now documents the managed Cloudflare instance service architecture with an honest split:
  - free experimental shared-runtime path at no platform cost
  - future Pro path for dedicated Cloudflare Containers `standard-2` (`6 GiB`)
  - automatic rollout design from `main`
- Release/versioning/docs are now aligned on the `v3.0.2` line.

What is still true after `v3.0.2`:

- The validated OpenAI core path is now working.
- The heaviest hosted install/build/preview work is now off the browser, but the client bundle and long-run UI rendering are still heavier than they should be.
- `ROADMAP.md` now tracks the current stable `v3.0.2` baseline and the next major delivery bucket `v3.0.3`.

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

## Roadmap (Post-3.0.2)

Roadmap files:

- Summary tracker: `ROADMAP.md`

Current roadmap split:

- `v3.0.2`: shipped baseline for installer-first self-hosting, hosted FREE reliability, and the Cloudflare managed-instance blueprint.
- `v3.0.3`: server-first heavy execution, first-party template coverage, the actual managed Cloudflare control plane, optional teams mode, and update/audit hardening.

## Current Features (v3.0.2)

- Built-in hosted `FREE` provider support with a locked server-side OpenRouter path for `DeepSeek V3.2`.
- Silent internal hosted-model fallback from `DeepSeek V3.2` to `qwen/qwen3-coder` when the primary upstream route is unavailable.
- Default provider selection now prefers the hosted `FREE` coder on managed instances, while preserving the full user-configurable `OpenRouter` provider separately.
- Managed hosted runtime on live instances for installs, builds, tests, dev servers, preview hosting, and file sync, with browser-side WebContainer retained only as the fallback path.
- Cloudflare Pages / preview deployments can now reuse the hosted FREE route through the managed runtime when the preview deployment does not hold the managed secret itself.
- Top-level `Chat` / `Workspace` tabs with closable workspace persistence so prompt/commentary and files/preview can be focused independently.
- Experimental managed Cloudflare instance architecture documented in-repo, including one-client / one-instance enforcement, a no-cost shared-runtime path, a future `standard-2` (`6 GiB`) Pro tier, and automatic rollout design from `main`.
- Commentary-first coding workflow (`Plan -> Doing -> Verifying -> Next`) with visible execution progress.
- Dedicated `Live Commentary` feed separated from the technical timeline so plain-English updates stay visible during long runs.
- Anti-stall detection and auto-recovery events in timeline.
- Execution transparency panel (model/provider/step/elapsed/actions/recovery state).
- Safer autonomy modes (`read-only`, `review-required`, `auto-apply-safe`, `full-auto`).
- Architect self-heal knowledgebase for common scaffold/build/runtime failures.
- Preview runtime errors can now be queued directly into Architect auto-repair instead of relying only on a manual `Ask Bolt` action.
- Multi-provider model support and model/provider/API-key persistence.
- Web browsing tools (`web_search`, `web_browse`) with Playwright-backed extraction.
- Real-time collaboration support (Yjs + websocket server).
- First-party deployment support and update manager.
- Cost estimation subsystem with cross-provider normalization.
- Long-run timeline de-bloat and feed virtualization.
- Path-safe artifact writing and starter-continuation safeguards so fallback scaffolds continue into a real app instead of stopping at the starter.
- Resilient dev-side helper services that reuse existing collaboration/web-browse ports instead of crashing on `EADDRINUSE`.

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

- If you run a managed/shared instance, you can define `FREE_OPENROUTER_API_KEY` server-side to expose a locked free coder without exposing the token to users.
- Keep `OPEN_ROUTER_API_KEY` unset on hosted/shared instances if you want the public `OpenRouter` provider to remain user-supplied.
- The hosted `FREE` coder keeps `deepseek/deepseek-v3.2` as the visible primary route and silently falls back to `qwen/qwen3-coder` if the primary route is unavailable. If both hosted routes fail, the UI surfaces a clear retry/switch-provider error instead of stalling.

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
