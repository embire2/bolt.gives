# Contributing to bolt.gives

## Platform Support (Important)

- Installing / self-hosting bolt.gives for development is supported on **Ubuntu 18.04+ only**.
- Windows is **not supported** for installation/self-hosting (but you can use the hosted app from Windows).
- macOS is **not supported** for installation/self-hosting (but you can use the hosted app from macOS).

## Start Here

The canonical contribution guide lives in the repo root:

- `CONTRIBUTING.md`

That file includes:
- PR rules and validation gate (`pnpm run typecheck`, `pnpm run lint`, `pnpm test`)
- Development setup steps
- Issue reporting expectations

## Quick Dev Setup (Ubuntu 18.04+)

```bash
sudo apt-get update
sudo apt-get install -y git curl ca-certificates build-essential
```

Install Node.js (recommended: Node 22 via `nvm`):

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"
nvm install 22
nvm use 22
```

Enable pnpm (recommended: corepack):

```bash
corepack enable
corepack prepare pnpm@9.15.9 --activate
```

Run the app:

```bash
pnpm install
cp .env.example .env.local
pnpm run dev
```

