# Agents Notes

## Scope (Non-Negotiable)

- Only tackle issues that are **valid bugs** (reproducible on the current upstream codebase).
- Only tackle issues that **no one else has fixed** (check existing PRs/commits before starting).

## Repos & Branches

- Upstream (official): `stackblitz-labs/bolt.diy`
- Fork (our working repo): `embire2/bolt.diy`

Alpha testing is done on the **`alpha` branch** in `embire2/bolt.diy`.

## Local Workspaces (This Server)

- `/root/bolt.diy`: primary workspace (feature branches intended for upstream PRs)
- `/root/bolt.diy.alpha`: workspace for the fork’s `alpha` branch (large/risky changes land here first)

Keep changes separated:

- Do experimental work in `/root/bolt.diy.alpha` on `alpha`.
- When ready to upstream, **cherry-pick** into a clean, focused branch based on `upstream/main` in `/root/bolt.diy`.

## PR Hygiene

- **One bugfix per PR.** No bundling unrelated changes.
- PR titles must follow **Conventional Commits** and be lowercase:
  - `fix: ...`, `feat: ...`, `docs: ...`, `refactor: ...`, `test: ...`, `chore: ...`
  - First letter after the colon should be lowercase (example: `fix: handle xyz`, not `fix: Handle xyz`).
- PR descriptions must include:
  - What changed and why
  - Steps to reproduce the bug (before) + verification steps (after)
  - Testing performed (commands + what you validated)

## Testing Gate (Before Opening/Updating Any PR)

Run locally:

- `pnpm run typecheck`
- `pnpm run lint`
- `pnpm test`

If the change touches chat streaming, providers, file actions, deployments, or other core user flows:

- Run an **end-to-end smoke test** using at least **1 AI provider**.
- Never commit or paste API keys/tokens in git, PRs, or logs.

## Secrets

- Keep all secrets in `.env.local` (gitignored) or injected environment variables.
- Never include secrets in commits, PR text, screenshots, or terminal output copied into GitHub.
