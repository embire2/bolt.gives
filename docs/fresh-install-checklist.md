# Fresh Install Checklist (bolt.gives v3.0.2)

This checklist is meant to validate a clean developer machine setup end-to-end.

## Supported Install Platform (Important)

- Installing / self-hosting bolt.gives is supported on **Ubuntu 18.04+ only**.
- Windows is **not supported** for installation/self-hosting (but you can use the hosted app from Windows).
- macOS is **not supported** for installation/self-hosting (but you can use the hosted app from macOS).

## Recommended path

Use the installer first:

```bash
curl -fsSL https://raw.githubusercontent.com/embire2/bolt.gives/main/install.sh -o install-bolt-gives.sh
chmod +x install-bolt-gives.sh
./install-bolt-gives.sh
```

Installer guarantees:

- Ubuntu dependency installation
- Node.js `22.x`
- `pnpm 9.x` (repo-pinned to `9.14.4`)
- repo clone/update
- `.env.local` initialization
- production build with `NODE_OPTIONS=--max-old-space-size=4096`
- systemd services for app, collaboration, and web browsing helpers

## Manual prerequisites

Install these on Ubuntu:

1. Base packages:
   ```bash
   sudo apt-get update
   sudo apt-get install -y git curl ca-certificates build-essential
   ```
2. Node.js `22.x`:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
   sudo apt-get install -y nodejs
   node -v
   ```
3. pnpm:
   ```bash
   sudo npm install -g pnpm@9.14.4
   pnpm -v
   ```

## Manual install

1. Clone the repo
   - `git clone https://github.com/embire2/bolt.gives.git`
   - `cd bolt.gives`
2. Install dependencies
   - `pnpm install`
3. Create local env
   - `cp .env.example .env.local`
   - Populate provider keys (never commit `.env.local`).
4. Build with the validated self-host heap baseline
   - `NODE_OPTIONS=--max-old-space-size=4096 pnpm exec remix vite:build`

## Run

1. Recommended
   - Use the installer-created services:
     - `sudo systemctl status bolt-gives-app --no-pager`
     - `sudo systemctl status bolt-gives-collab --no-pager`
     - `sudo systemctl status bolt-gives-webbrowse --no-pager`
2. Manual
   - Start each process in its own terminal:
     - `NODE_OPTIONS=--max-old-space-size=4096 pnpm run collab:server`
     - `NODE_OPTIONS=--max-old-space-size=4096 pnpm run webbrowse:server`
     - `NODE_OPTIONS=--max-old-space-size=4096 pnpm run start`
3. Confirm services
   - App: `http://localhost:5173`
   - Collaboration server: `ws://localhost:1234`
   - Web browsing service: `http://127.0.0.1:4179`

## Build

Validated self-host build command:

- `NODE_OPTIONS=--max-old-space-size=4096 pnpm exec remix vite:build`

## Quality Gate

- `pnpm run typecheck`
- `pnpm run lint`
- `pnpm test`

## Optional (Sessions + Supabase)

1. Configure Supabase vars in `.env.local`
2. Create `public.bolt_sessions` table
   - Apply `docs/supabase/bolt_sessions.sql` in Supabase SQL editor
3. Verify automated checks
   - `pnpm test` (ensures `tests/api.system.sessions.spec.ts` runs and passes)
   - `node scripts/e2e-sessions-share-link.mjs` (writes `docs/screenshots/share-session-e2e.png`)
