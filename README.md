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
  <a href="https://create.bolt.gives">create a 15-day trial instance</a> ·
  <a href="CHANGELOG.md">changelog</a> ·
  <a href="ROADMAP.md">roadmap</a> ·
  <a href="#installation-ubuntu-1804-only-verbose-tested">install</a>
</p>

## Start Here

- [Create a 15-day managed Cloudflare trial instance](https://create.bolt.gives)
- [Open the live alpha environment](https://alpha1.bolt.gives)
- [Review the roadmap](ROADMAP.md)
- [Read the changelog](CHANGELOG.md)

`create.bolt.gives` lands on the public `/managed-instances` registration flow. Users complete a short profile, request a preferred subdomain, and then receive a success page showing the live URL, assigned hostname, expiry, and rollout state for the trial.

## Roadmap to v3.0.9

`v3.0.9` is the next launch-hardening release. The goal is to make bolt.gives easier to trust as a daily coding workspace, easier to self-host, and safer to operate at scale.

Recent hardening in this line includes safer hidden continuation dispatch: follow-up recovery prompts now wait until the active chat stream is genuinely idle before they are sent, which reduces mid-run disconnect/reconnect loops on longer builds.
Another recent runtime fix now synthesizes preview handoff commands from the merged workspace state instead of the latest assistant delta only, which prevents broken follow-up runs from replaying dependency-only installs and stalling preview startup.
Release verification now also includes a browser-level post-deploy asset health check so stale manifests and missing client bundles fail the release instead of leaving users on a non-interactive shell.

### Launch blockers

- Make prompt-to-preview status explicit at every step: `scaffolding`, `installing`, `starting`, `preview ready`, `repairing`.
- Keep commentary task-specific in both `Chat` and `Workspace`, driven from real runtime/file/command events instead of generic filler.
- Reduce the remaining browser-heavy editor/PDF/git/terminal paths so long sessions stay responsive.
- Harden tenant/account lifecycle with production-safe auth, approval history, invite/reset flows, and RBAC.
- Add managed-instance rollout visibility with deployment history, health-checked refreshes, and rollback outcomes.
- Ship first-party template packs plus CI smoke coverage so common app requests start from a reliable baseline.
- Keep the self-host installer resilient enough to recover from common package, dependency, build, and service-start failures without forcing the user to start over.

### Key improvements planned

- Tighten Cloudflare managed-instance lifecycle around health-verified updates and rollback.
- Expand operator visibility inside `admin.bolt.gives` with trial capacity, deployment state, and outbound communication history.
- Keep the built-in `FREE` + `DeepSeek V3.2` path reliable across hosted, Pages, and managed trial instances.
- Continue moving heavy execution and reconciliation work off the browser and onto the server runtime.
- Keep docs and self-host setup short, direct, and launch-oriented.

## Current Platform Baseline (`v3.0.8`)

- Open-source AI coding workspace with transparent execution and visible agent actions.
- Hosted `FREE` provider ships locked to `DeepSeek V3.2` through a protected server-side OpenRouter route.
- Managed hosted runtime handles installs, builds, tests, preview hosting, and file sync on live instances by default.
- Follow-up prompts on existing hosted projects now reuse validated runtime commands instead of stalling on prose-only model handoffs.
- Hosted file actions now target the active starter entry file even when the model chooses the wrong JS/TS sibling extension, so generated apps replace the fallback starter instead of being written into an inactive file.
- Hosted FREE preview verification now ignores stale fallback-starter detections once the synced workspace no longer contains the starter placeholder, which stops valid generated apps from being rolled back to an older starter snapshot.
- `Chat` and `Workspace` are separate top-level tabs, with a dedicated `Workspace Activity` area for commentary and execution state.
- Managed Cloudflare trial instances are registration-first, one-client / one-instance, 15-day environments with preferred-subdomain support.
- `admin.bolt.gives` provides the private operator panel for client profiles, managed-instance assignments, and admin email activity.
- Self-hosting supports custom app/admin/create domains, local PostgreSQL, and Caddy-managed HTTPS.
- Live release validation already includes real browser startup and preview-recovery smoke coverage.

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

## Installation (Ubuntu 18.04+ Only, Verbose, Tested)

This installation path is designed to let users self-host the full product on their own VPS:

- public app domain
- public admin/operator domain
- optional public create/trial-registration domain
- local PostgreSQL for the private admin/control-plane data
- Caddy-managed HTTPS on the chosen domains

Core coding stays open source and self-hostable. Sensitive server-side keys stay in `.env.local` and never need to be exposed to browser users.

### 0. What you need

- Ubuntu `18.04+` (recommended `22.04+`)
- A user account with `sudo` access
- Internet access for package installation and GitHub clone
- Public DNS A records for the domains the user wants to use, all pointing at the VPS IP

Recommended self-host domain layout:

- app: `code.example.com`
- admin: `admin.example.com`
- create: `create.example.com`

The `create` domain is optional. If it is omitted, the registration flow still works at:

- `https://<app-domain>/managed-instances`

Windows/macOS note:

- You can use bolt.gives in the browser on Windows/macOS.
- You should install/self-host bolt.gives on Ubuntu 18.04+.

### 1. Recommended: run the installer

Download the installer from GitHub, inspect it, then run it.

Simplest path:

```bash
curl -fsSL https://raw.githubusercontent.com/embire2/bolt.gives/main/install.sh -o install-bolt-gives.sh
chmod +x install-bolt-gives.sh
./install-bolt-gives.sh
```

If you run it without domain or PostgreSQL flags, the installer now prompts interactively for the missing values.

Fully explicit path:

```bash
curl -fsSL https://raw.githubusercontent.com/embire2/bolt.gives/main/install.sh -o install-bolt-gives.sh
chmod +x install-bolt-gives.sh
./install-bolt-gives.sh \
  --app-domain code.example.com \
  --admin-domain admin.example.com \
  --create-domain create.example.com
```

The installer will:

- install `git`, `curl`, `ca-certificates`, and `build-essential`
- install `python3`
- install Node.js `22.x`
- install a compatible `pnpm 9.x` release (repo-pinned to `9.14.4`)
- install local `PostgreSQL`, `psql`, and create a dedicated local admin/control-plane database
- install `Caddy` and configure HTTPS reverse-proxy blocks for the chosen public domains
- clone or update `https://github.com/embire2/bolt.gives`
- create `.env.local` from `.env.example` if it does not exist
- write self-host public URLs into `.env.local` for:
  - `BOLT_APP_PUBLIC_URL`
  - `BOLT_ADMIN_PANEL_PUBLIC_URL`
  - `BOLT_CREATE_TRIAL_PUBLIC_URL`
- write local PostgreSQL connection settings into `.env.local` for:
  - `BOLT_ADMIN_DATABASE_HOST`
  - `BOLT_ADMIN_DATABASE_PORT`
  - `BOLT_ADMIN_DATABASE_NAME`
  - `BOLT_ADMIN_DATABASE_USER`
  - `BOLT_ADMIN_DATABASE_PASSWORD`
  - `BOLT_ADMIN_DATABASE_SSL=disable`
- generate a private `BOLT_TENANT_ADMIN_COOKIE_SECRET`
- build the app with a **4 GB** Node heap (`NODE_OPTIONS=--max-old-space-size=4096`)
- install and start these systemd services:
  - `bolt-gives-app`
  - `bolt-gives-collab`
  - `bolt-gives-webbrowse`
  - `bolt-gives-runtime`

If the domain or PostgreSQL flags are omitted, the installer now prompts interactively for:

- public app domain
- public admin domain
- optional public create/trial domain
- Let's Encrypt contact email
- local PostgreSQL database name
- local PostgreSQL user
- optional local PostgreSQL password (blank = generated)

If a recoverable step fails, the installer now retries and repairs the common failure paths before giving up:

- apt / dpkg state
- pnpm dependency install state
- build artifacts and Vite cache
- service startup and first HTTP health check

Recommended real-world installer command:

```bash
curl -fsSL https://raw.githubusercontent.com/embire2/bolt.gives/main/install.sh -o install-bolt-gives.sh
chmod +x install-bolt-gives.sh
./install-bolt-gives.sh \
  --app-domain code.example.com \
  --admin-domain admin.example.com \
  --create-domain create.example.com \
  --postgres-db bolt_gives_admin \
  --postgres-user bolt_gives_admin
```

Optional overrides:

```bash
INSTALL_DIR="$HOME/apps/bolt.gives" ./install-bolt-gives.sh
```

After the installer finishes:

- app: `http://127.0.0.1:5173`
- collaboration server: `ws://127.0.0.1:1234`
- web browsing service: `http://127.0.0.1:4179`
- runtime control plane: `http://127.0.0.1:4321`
- admin panel: `https://admin.example.com` (or whatever `--admin-domain` was set to)
- trial registration: `https://create.example.com` (or `https://<app-domain>/managed-instances` if `--create-domain` was omitted)

### 2. Add your provider keys

The installer creates `.env.local` for you. Edit it after install:

```bash
cd ~/bolt.gives
nano .env.local
```

Then restart the services:

```bash
sudo systemctl restart bolt-gives-app bolt-gives-collab bolt-gives-webbrowse bolt-gives-runtime
```

bolt.gives core still does not require an external hosted database, but the full self-hosted operator stack now supports a local PostgreSQL service for:

- registered client profiles
- managed Cloudflare trial assignments
- admin/operator email activity

Important:

- keep `FREE_OPENROUTER_API_KEY` on the server only
- keep any `OPENAI_API_KEY`, `OPEN_ROUTER_API_KEY`, or other provider secrets on the server only unless the user intentionally wants browser-local key entry
- never commit `.env.local`

Hosted-instance note:

- If you run a managed/shared instance, you can define `FREE_OPENROUTER_API_KEY` server-side to expose a locked hosted coder without exposing the token to users.
- Keep `OPEN_ROUTER_API_KEY` unset on hosted/shared instances if you want the public `OpenRouter` provider to remain user-supplied.
- The hosted `FREE` coder is pinned to `deepseek/deepseek-v3.2`. If that protected route is unavailable, the UI surfaces a clear retry/switch-provider error instead of silently routing to another model.
- Managed Cloudflare trial instances do not receive the OpenRouter key itself. They receive a server-only relay secret on the Pages project, and the live app relays hosted FREE requests back to the operator runtime without exposing the upstream token.
- Hosted FREE relay authorization now falls back to the local runtime service on the operator host, so the built-in `DeepSeek V3.2` path keeps working on Pages-hosted managed trials without asking the user for their own API key.

### 3. Verify the install

```bash
sudo systemctl status bolt-gives-app --no-pager
sudo systemctl status bolt-gives-collab --no-pager
sudo systemctl status bolt-gives-webbrowse --no-pager
sudo systemctl status bolt-gives-runtime --no-pager
sudo systemctl status postgresql --no-pager
sudo systemctl status caddy --no-pager
```

Open `http://127.0.0.1:5173`, then verify:

- UI loads without a server crash
- chat opens
- terminal and preview panels render
- collaboration and web browsing helper services are reachable
- the admin domain loads the tenant/operator panel
- the create domain loads the managed trial registration form

Recommended public checks after DNS is pointed:

- `https://code.example.com`
- `https://admin.example.com`
- `https://create.example.com`

If the user skips a dedicated create domain, the installer falls back to:

- `https://code.example.com/managed-instances`

### 4. Manual install alternative

If you do not want to use the installer, this is the validated manual path for users who want to provision everything themselves.

```bash
sudo apt-get update
sudo apt-get install -y git curl ca-certificates build-essential python3 postgresql postgresql-client postgresql-contrib caddy
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo npm install -g pnpm@9.14.4
git clone https://github.com/embire2/bolt.gives.git
cd bolt.gives
cp .env.example .env.local
sudo -u postgres createuser --pwprompt bolt_gives_admin
sudo -u postgres createdb --owner=bolt_gives_admin bolt_gives_admin
cat >> .env.local <<'EOF'
BOLT_ADMIN_PANEL_PUBLIC_URL=https://admin.example.com
BOLT_CREATE_TRIAL_PUBLIC_URL=https://create.example.com
BOLT_ADMIN_DATABASE_HOST=127.0.0.1
BOLT_ADMIN_DATABASE_PORT=5432
BOLT_ADMIN_DATABASE_NAME=bolt_gives_admin
BOLT_ADMIN_DATABASE_USER=bolt_gives_admin
BOLT_ADMIN_DATABASE_PASSWORD=replace_me
BOLT_ADMIN_DATABASE_SSL=disable
EOF
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

Then place Caddy in front of the app with the chosen domains:

```caddyfile
code.example.com {
  encode zstd gzip
  header {
    Cache-Control "no-store, max-age=0, must-revalidate"
  }

  handle /runtime/* {
    reverse_proxy 127.0.0.1:4321
  }

  handle_path /collab/* {
    reverse_proxy 127.0.0.1:1234
  }

  handle {
    reverse_proxy 127.0.0.1:5173
  }
}

admin.example.com {
  encode zstd gzip
  @root path /
  redir @root /tenant-admin 302

  handle /runtime/* {
    reverse_proxy 127.0.0.1:4321
  }

  handle_path /collab/* {
    reverse_proxy 127.0.0.1:1234
  }

  handle {
    reverse_proxy 127.0.0.1:5173
  }
}

create.example.com {
  encode zstd gzip
  @root path /
  redir @root /managed-instances 302

  handle /runtime/* {
    reverse_proxy 127.0.0.1:4321
  }

  handle_path /collab/* {
    reverse_proxy 127.0.0.1:1234
  }

  handle {
    reverse_proxy 127.0.0.1:5173
  }
}
```

### 5. Contributor note about memory

The repo still contains heavier maintainer scripts used for large local test/build workflows.  
The installer and manual self-host path above are the validated open-source install path and run with a **4 GB** Node heap.

## Deploying To Cloudflare Pages (Verbose, Step By Step)

This is the **supported self-service Cloudflare path that works today**.

What this gives the user right now:

- their own isolated Cloudflare Pages deployment
- their own chosen `*.pages.dev` project name
- optional custom domain after the first deploy
- automatic redeploys from GitHub when they push updates

What this does **not** give yet:

- live managed trial provisioning on a runtime that does not have `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` configured

The managed trial control plane is now part of the product under `/managed-instances`. It becomes operational on a given deployment only when the runtime has the required Cloudflare credentials configured.

### 1. Prerequisites

Before starting, the user needs:

- a Cloudflare account
- a GitHub account
- a fork or clone of `https://github.com/embire2/bolt.gives`
- Node.js `22.x` and `pnpm 9.x` locally if they want to test before connecting Git

### 2. Prepare the repo

If the user wants to test locally first:

```bash
git clone https://github.com/embire2/bolt.gives.git
cd bolt.gives
pnpm install
NODE_OPTIONS=--max-old-space-size=6142 pnpm run build
```

This repo is already configured for Cloudflare Pages in `wrangler.toml`:

- build output directory: `build/client`
- Pages Functions entry: `functions/[[path]].ts`
- compatibility flag: `nodejs_compat`

### 3. Create the Pages project in Cloudflare

In the Cloudflare dashboard:

1. Open `Workers & Pages`
2. Click `Create`
3. Choose `Pages`
4. Choose `Connect to Git`
5. Select the GitHub repository the user wants to deploy

The **project name** becomes the default `*.pages.dev` subdomain.

Example:

- project name: `my-bolt-gives`
- default URL: `https://my-bolt-gives.pages.dev`

If the user wants a different public URL later, they can attach a custom domain after the first successful deploy.

### 4. Use these exact Cloudflare build settings

Use the following values in the Cloudflare Pages setup form:

- Framework preset: `None`
- Root directory: `/`
- Build command: `NODE_OPTIONS=--max-old-space-size=6142 pnpm run build`
- Build output directory: `build/client`

Do **not** point Pages at another output folder. This project expects `build/client`.

### 5. Set the required environment variables in Pages

In Cloudflare Pages, open:

- `Settings`
- `Environment variables`

Set at least:

- `NODE_OPTIONS=--max-old-space-size=6142`

Optional, depending on how they want the AI runtime to behave:

- `FREE_OPENROUTER_API_KEY=...`
  - Use this only if they want the built-in hosted `FREE` provider to work on **their** deployment.
  - This stays server-side in Cloudflare. It is **not** exposed to browser users.
  - The shipped FREE path is locked to `deepseek/deepseek-v3.2`.
- `OPENAI_API_KEY=...`
  - Optional if they want OpenAI available server-side by default on their own instance.
- `OPEN_ROUTER_API_KEY=...`
  - Optional for their own OpenRouter-backed server-side use cases.
  - Leave this unset if they want OpenRouter to remain entirely user-supplied in the UI.

Important:

- The open-source app does **not** expose `FREE_OPENROUTER_API_KEY` to end users.
- If a user wants their deployment to ship with a working FREE coder immediately after install, they need to set `FREE_OPENROUTER_API_KEY` in Cloudflare for their own project.

### 6. First deploy

Once the Git repo and build settings are connected:

1. Click `Save and Deploy`
2. Wait for the build to complete
3. Open the generated `*.pages.dev` URL

On first load, the expected default UX is:

- land on `Chat`
- provider already set to `FREE`
- model label already showing `DeepSeek V3.2`

### 7. Give the user their own subdomain

Users have two options:

1. Use their Cloudflare Pages project name as the default subdomain
   - example: `clinic-bolt.pages.dev`
2. Attach a custom domain in:
   - `Workers & Pages`
   - selected project
   - `Custom domains`

That means users can already choose their own public address today without waiting for the future managed trial control plane.

### 8. Automatic updates from GitHub

If the project is connected through Cloudflare Pages Git integration:

- every push to the configured branch triggers a new deployment automatically
- this is the easiest way to keep the instance updated from GitHub

If they want the production instance to track stable releases only:

- connect Pages to `main`

If they want a soak-test instance:

- connect a separate Pages project to `alpha`

### 9. Troubleshooting memory or build failures

If the build runs out of memory:

- confirm `NODE_OPTIONS=--max-old-space-size=6142` is set in Pages
- confirm the build command is exactly:
  - `NODE_OPTIONS=--max-old-space-size=6142 pnpm run build`

If the UI loads but the FREE provider does not work:

- confirm `FREE_OPENROUTER_API_KEY` is set in the Cloudflare Pages environment
- redeploy the project after saving env changes
- for managed 15-day trial instances, refresh the trial deployment from the operator/runtime control plane so the Pages relay secret is applied; end users should never need to enter a FREE API key manually

If the deploy succeeds but the URL still shows an older release:

- open the latest deployment in Pages
- confirm the connected Git branch and latest commit SHA
- trigger a redeploy from the newest commit

### 10. About the managed 15-day trial

The shipped control-plane model is:

- free experimental shared runtime while capacity lasts
- future Pro from `$12/month` with more tools and higher limits

The shipped control plane now covers:

- user signs into bolt.gives
- user requests a managed Cloudflare instance
- bolt.gives enforces one-client / one-instance ownership
- user chooses a subdomain
- the managed instance stays active for 15 days
- updates can roll forward from the current stable build through the runtime sync path

What still remains:

- live operator credential enablement on every managed runtime
- rollback verification on failed managed-instance updates
- deeper operator observability for managed-instance rollout state

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

## Docker Images (GHCR)

This repo includes a `Docker Publish` GitHub Actions workflow that can build and (optionally) push images to GitHub Container Registry.

By default, publishing is disabled. To enable pushing to GHCR:

1. Create an Actions variable: `GHCR_PUSH_ENABLED=true`
2. (Optional) Create an Actions secret: `GHCR_PAT` with `read:packages` and `write:packages`

Notes:

- If `GHCR_PAT` is not set, the workflow will fall back to the built-in `GITHUB_TOKEN`.
- Images publish to `ghcr.io/<owner>/<repo>`.

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
