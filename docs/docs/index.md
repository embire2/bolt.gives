# bolt.gives Documentation

bolt.gives is a collaborative, open-source AI coding workspace.

## Platform Support (Important)

- Using bolt.gives in a browser: supported on Windows, macOS, and Linux (any modern browser).
- Installing / self-hosting bolt.gives: supported on **Ubuntu 18.04+ only**.
  - Windows is **not supported** for installation/self-hosting (but you can use the hosted app from Windows).
  - macOS is **not supported** for installation/self-hosting (but you can use the hosted app from macOS).

## Setup (Ubuntu 18.04+)

### 1) Install Prerequisites

```bash
sudo apt-get update
sudo apt-get install -y git curl ca-certificates build-essential
```

### 2) Install Node.js (Recommended: Node 22 via nvm)

bolt.gives requires Node.js `>= 18.18.0`. For best results, use Node.js `22`.

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
# restart your shell, then:
export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"
nvm install 22
nvm use 22
node -v
```

### 3) Install pnpm (Recommended: corepack)

```bash
corepack enable
corepack prepare pnpm@9.15.9 --activate
pnpm -v
```

## Clone + Install

```bash
git clone https://github.com/embire2/bolt.gives.git
cd bolt.gives
pnpm install
cp .env.example .env.local
```

## Run (Development)

```bash
pnpm run dev
```

Defaults:
- App: `http://localhost:5173`
- Collaboration server: `ws://localhost:1234`

## Configure API Keys (No bolt.gives signup required)

bolt.gives does not require a bolt.gives account. To use LLMs, you configure your provider API keys:

- Cloud providers (OpenAI/Anthropic/OpenRouter/etc.): you sign up with that provider to obtain an API key.
- Local providers (Ollama/LM Studio/etc.): you run the provider locally and point bolt.gives at it.

You can configure keys in either of these ways:

1. In-app settings (recommended):
   - Open Settings
   - Choose your provider
   - Paste your API key
2. `.env.local`:
   - Add values to `.env.local` (never commit it)

## Build (High Memory)

This repo can require a larger Node heap during builds.

```bash
pnpm run build:highmem
pnpm run start
```

If you prefer the explicit environment variable:

```bash
NODE_OPTIONS=--max-old-space-size=6142 pnpm run build
```

## Cloudflare Pages (Git Deploy)

If you deploy this repo via Cloudflare Pages:

- Framework preset: `None`
- Root directory: `/`
- Build command: `NODE_OPTIONS=--max-old-space-size=6142 pnpm run build`
- Build output directory: `build/client`
- If you want the built-in hosted FREE coder on your own deployment, set `FREE_OPENROUTER_API_KEY` in the Pages environment settings
- If your build fails with out-of-memory, confirm `NODE_OPTIONS=--max-old-space-size=6142` is set in the Pages build environment
- For the full step-by-step setup guide, use the `Deploying To Cloudflare Pages` section in `README.md`

## Additional Docs

- Fresh install checklist: `docs/fresh-install-checklist.md`
- Contributing: `CONTRIBUTING.md`
- Changelog: `CHANGELOG.md`
