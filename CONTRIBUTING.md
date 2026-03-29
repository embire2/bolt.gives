# Contributing

bolt.gives accepts contributions via the standard GitHub fork and pull request workflow (the same model used by most StackBlitz open source projects).

## Platform Support (Important)

- Installing / self-hosting bolt.gives for development is supported on **Ubuntu 18.04+ only**.
- Windows is **not supported** for installation/self-hosting (but you can use the hosted app from Windows).
- macOS is **not supported** for installation/self-hosting (but you can use the hosted app from macOS).

## Quick Rules

- One feature or bugfix per PR.
- Keep secrets out of git. Put keys in `.env.local` (gitignored).
- Run the validation gate before opening or updating a PR:
  - `pnpm run typecheck`
  - `pnpm run lint`
  - `pnpm test`

## Contributing Workflow (Fork + PR)

1. Fork `embire2/bolt.gives` on GitHub.
2. Clone your fork:
   ```bash
   git clone https://github.com/<your-username>/bolt.gives.git
   cd bolt.gives
   ```
3. Add upstream and fetch:
   ```bash
   git remote add upstream https://github.com/embire2/bolt.gives.git
   git fetch upstream
   ```
4. Create a branch from upstream `main`:
   ```bash
   git checkout main
   git pull --ff-only upstream main
   git checkout -b feat/my-change
   ```
5. Make your changes.
6. Run the validation gate:
   ```bash
   pnpm run typecheck
   pnpm run lint
   pnpm test
   ```
7. Push your branch to your fork and open a PR to `embire2/bolt.gives:main`.

## PR Guidance

Include in the PR description:
- What changed and why
- Steps to verify locally
- Tests you ran

## Development Setup

Prereqs (Ubuntu 18.04+ only):

1. Install base packages:
   ```bash
   sudo apt-get update
   sudo apt-get install -y git curl ca-certificates build-essential
   ```
2. Install Node.js `>= 18.18.0` (recommended: Node.js `22` via `nvm`):
   ```bash
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
   # restart your shell, then:
   export NVM_DIR="$HOME/.nvm"
   . "$NVM_DIR/nvm.sh"
   nvm install 22
   nvm use 22
   node -v
   ```
3. Install `pnpm` (recommended: `corepack`):
   ```bash
   corepack enable
   corepack prepare pnpm@9.15.9 --activate
   pnpm -v
   ```

Install:
```bash
pnpm install
cp .env.example .env.local
```

Run:
```bash
pnpm run dev
```

If the build fails with "JavaScript heap out of memory":
```bash
pnpm run build:highmem
```

## Reporting Issues

When opening an issue, include:
- What you expected to happen
- What happened instead
- Steps to reproduce
- Any relevant logs or screenshots (do not include secrets)
