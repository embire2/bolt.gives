# Contributing

bolt.gives accepts contributions via the standard GitHub fork and pull request workflow (the same model used by bolt.diy and most StackBlitz open source projects).

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

Prereqs:
- Node.js `>= 18.18.0`
- `pnpm`

Install:
```bash
pnpm install
cp .env.example .env.local
```

Run:
```bash
pnpm run dev
```

## Reporting Issues

When opening an issue, include:
- What you expected to happen
- What happened instead
- Steps to reproduce
- Any relevant logs or screenshots (do not include secrets)

