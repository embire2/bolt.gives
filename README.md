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
  <a href="v1.0.4.md">v1.0.4 roadmap</a> ·
  <a href="#installation-ubuntu-1804-only-verbose-tested">install</a>
</p>

## App Overview

Current version: **v1.0.3**

bolt.gives is an open-source, free, collaborative AI coding workspace.

Core principles:
- Open source and free to self-host/use.
- Zero-required-database setup for bolt.gives core.
- Optional databases/integrations are for user projects only.
- Transparent agent execution (users can see what is happening and why).

Platform support:
- Use in browser: Windows/macOS/Linux.
- Install/self-host: **Ubuntu 18.04+ only**.

## Screenshots

Home:
![bolt.gives home](docs/screenshots/home.png)

Chat:
![bolt.gives chat](docs/screenshots/chat.png)

Plan prompt example:
![bolt.gives plan prompt](docs/screenshots/chat-plan.png)

Changelog:
![bolt.gives changelog](docs/screenshots/changelog.png)

## Roadmap (v1.0.4)

Roadmap files:
- Detailed plan: `v1.0.4.md`
- Summary tracker: `ROADMAP.md`

v1.0.4 mission: make frozen windows mid-project a thing of the past by moving heavy lifting from the user's machine to server-side execution.

P0 targets:
- Zero-infra runtime guarantee (no mandatory DB/env).
- Client-hosted isolated instance kit.
- Optional Teams add-on (roles/permissions/invites).
- Collaboration audit trail + export.
- Architect v2 self-heal + safety guard.
- Commentary v2 with clear plain-English progress updates.
- First-party template packs with smoke coverage.
- Long-run performance and stability hardening (server-first heavy tasks).
- Cost estimation integrity across providers.
- Safe multi-instance update channels with retry/rollback.

## Current Features (v1.0.3)

- Commentary-first coding workflow (`Plan -> Doing -> Verifying -> Next`) with visible execution progress.
- Anti-stall detection and auto-recovery events in timeline.
- Execution transparency panel (model/provider/step/elapsed/actions/recovery state).
- Safer autonomy modes (`read-only`, `review-required`, `auto-apply-safe`, `full-auto`).
- Architect self-heal knowledgebase for common scaffold/build/runtime failures.
- Multi-provider model support and model/provider/API-key persistence.
- Web browsing tools (`web_search`, `web_browse`) with Playwright-backed extraction.
- Real-time collaboration support (Yjs + websocket server).
- First-party deployment support and update manager.
- Cost estimation subsystem with cross-provider normalization.
- Long-run timeline de-bloat and feed virtualization.

## Installation (Ubuntu 18.04+ Only, Verbose, Tested)

This installation path is designed to run bolt.gives locally with no required database.

### 0. What you need

- Ubuntu `18.04+` (recommended `22.04+`)
- `git`, `curl`, `build-essential`
- Node.js `22.x`
- `pnpm` `9.x`

Windows/macOS note:
- You can use bolt.gives in the browser on Windows/macOS.
- You should install/self-host bolt.gives on Ubuntu 18.04+.

### 1. Install base packages

```bash
sudo apt-get update
sudo apt-get install -y git curl ca-certificates build-essential
```

### 2. Install Node.js 22 with nvm

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm install 22
nvm use 22
node -v
```

Expected: a `v22.x.x` version output.

### 3. Enable pnpm via corepack

```bash
corepack enable
corepack prepare pnpm@9.15.9 --activate
pnpm -v
```

Expected: a `9.x.x` version output.

### 4. Clone and enter the project

```bash
git clone https://github.com/embire2/bolt.gives.git
cd bolt.gives
```

### 5. Install dependencies

```bash
pnpm install
```

Playwright browsers are installed during dependency setup.

### 6. Create local environment file

```bash
cp .env.example .env.local
```

Then edit `.env.local` and set at least one provider key (for example OpenAI).  
No database setup is required for bolt.gives core runtime.

### 7. Ensure default dev ports are free (prevents startup conflicts)

```bash
fuser -k 5173/tcp 2>/dev/null || true
fuser -k 1234/tcp 2>/dev/null || true
fuser -k 4179/tcp 2>/dev/null || true
```

If you still suspect conflicts, inspect ports:

```bash
ss -ltnp | grep -E ':(5173|1234|4179)\\b' || true
```

### 8. Run development mode

```bash
pnpm run dev
```

Default endpoints:
- App: `http://localhost:5173`
- Collaboration server: `ws://localhost:1234`
- Web browsing service: `http://127.0.0.1:4179`

### 9. Verify the install

Open `http://localhost:5173`, then verify:
- UI loads without server crash.
- You can open chat and send a prompt.
- Terminal and preview panels render.
- No database is required to start and use core features.

### 10. Production build (recommended high-memory path)

```bash
pnpm run build:highmem
pnpm run start
```

If needed, enforce memory explicitly:

```bash
NODE_OPTIONS=--max-old-space-size=4096 pnpm run build
```

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

Install script (Ubuntu 18.04+ only):
```bash
./scripts/install-bolt-gives.sh
```

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
```

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
