# Fresh Install Checklist (bolt.gives v1.0.0)

This checklist is meant to validate a clean developer machine setup end-to-end.

## Supported Install Platform (Important)

- Installing / self-hosting bolt.gives is supported on **Ubuntu 18.04+ only**.
- Windows is **not supported** for installation/self-hosting (but you can use the hosted app from Windows).
- macOS is **not supported** for installation/self-hosting (but you can use the hosted app from macOS).

## Prerequisites

Install these on Ubuntu:

1. Base packages:
   ```bash
   sudo apt-get update
   sudo apt-get install -y git curl ca-certificates build-essential
   ```
2. Node.js `>= 18.18.0` (recommended: Node.js `22` via `nvm`):
   ```bash
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
   # restart your shell, then:
   export NVM_DIR="$HOME/.nvm"
   . "$NVM_DIR/nvm.sh"
   nvm install 22
   nvm use 22
   node -v
   ```
3. pnpm (recommended: `corepack`):
   ```bash
   corepack enable
   corepack prepare pnpm@9.15.9 --activate
   pnpm -v
   ```

## Install
1. Clone the repo
   - `git clone https://github.com/embire2/bolt.gives.git`
   - `cd bolt.gives`
2. Install dependencies
   - `pnpm install`
3. Create local env
   - `cp .env.example .env.local`
   - Populate provider keys (never commit `.env.local`).

## Run
1. Start dev
   - `pnpm run dev`
2. Confirm services
   - App: `http://localhost:5173`
   - Collaboration server: `ws://localhost:1234`

## Build (If You Hit Out-Of-Memory)

This repo can require a larger Node heap during build:

- `pnpm run build:highmem`
- Or: `NODE_OPTIONS=--max-old-space-size=6142 pnpm run build`

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
