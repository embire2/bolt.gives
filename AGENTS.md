# AGENTS.md

## Mission

Build and maintain `bolt.gives` as a production-ready agentic coding platform, with a strong focus on reliability, transparent execution, and safe autonomous behavior.

Current release line:
- Stable: `v1.0.1`
- In progress: `v1.0.2`

Do not ship hidden behavior. If the agent takes actions, users should be able to see what happened and why.

---

## Repository and Branch Rules

- Primary repo: `https://github.com/embire2/bolt.gives`
- Primary working branch for live updates: `main`
- Optional staging branch: `alpha` (used when risky features need live soak first)

If both `alpha` and `main` are active:
- Land high-risk work on `alpha`
- Verify on `https://alpha1.bolt.gives`
- Fast-forward or merge cleanly into `main`

Never force-push shared branches unless explicitly approved.

---

## Work Scope Rules

- Prioritize valid, reproducible issues or clearly approved roadmap items.
- One logical change per commit unless a larger atomic change is required for correctness.
- Keep behavior changes explicit in commit messages and release notes.
- Avoid refactors during hotfixes unless needed to fix the issue safely.

When uncertain, choose the smallest safe change that unblocks users.

---

## v1.0.2 Priority Stack

### Completed
- Live Development Commentary Stream
  - Commentary is streamed incrementally and separated from code/action events.
- Agent Anti-Stall + Auto-Recovery
  - Loop/no-progress/timeout detection plus recovery backoff/finalize strategy.

### In Progress / Remaining
- Execution Transparency Panel (model/tool/step/elapsed/usage visibility)
- Safer Autonomy Modes (`read-only`, `review-required`, `auto-apply-safe`, `full-auto`)
- Reliability guardrails hardening across providers (schema and regression matrix)
- Persistent project memory (scoped)
- Minimal sub-agent framework (planner/executor split)

---

## Mandatory Implementation Workflow

1. Confirm current behavior
- Reproduce the issue or validate feature gap.
- Record exact file(s) and runtime path affected.

2. Implement minimal safe fix
- Keep protocol contracts backward compatible.
- Add guardrails for strict providers when touching tool schemas.

3. Add/Update tests
- Add regression tests close to the changed code.
- Include at least one test that would fail before the fix.

4. Validate locally
- `pnpm run typecheck`
- `pnpm run lint`
- `pnpm test`

5. Run targeted E2E smoke for core-path changes
- Required when touching chat streaming, providers, tools, deployments, auth, or file actions.
- Use at least one real provider path when credentials are available.

6. Commit and push
- Use Conventional Commits:
  - `fix: ...`
  - `feat: ...`
  - `docs: ...`
  - `test: ...`
  - `refactor: ...`
  - `chore: ...`

---

## Deployment Rules (Cloudflare + alpha1)

Production-like validation targets:
- `https://alpha1.bolt.gives`
- `https://ahmad.bolt.gives`

When deploying:
- Confirm build passes under Cloudflare constraints.
- Confirm runtime starts and chat flow works.
- Confirm static assets are fresh (logo/version/changelog visibility where applicable).
- Confirm no auth/tool schema runtime errors in browser console and server logs.
- Confirm both live domains return healthy responses after deployment:
  - `https://alpha1.bolt.gives`
  - `https://ahmad.bolt.gives`

If deployment fails:
- Capture exact error text.
- Patch root cause, not symptoms.
- Re-run smoke test before declaring fixed.

---

## Security and Secrets

- Never commit API keys, tokens, cookies, session dumps, or private logs.
- Keep secrets in `.env.local` or environment variables (gitignored).
- Redact credentials in screenshots, issue text, and commit messages.
- Do not paste production secrets into CI output or PR discussion.

---

## Documentation Rules

When behavior changes, update docs in the same PR/commit set:
- `CHANGELOG.md` for user-facing behavior
- `README.md` for setup/usage changes
- `1.0.2.md` for roadmap status updates

Roadmap items must be marked clearly:
- `[x]` complete
- `[~]` partial/in progress
- `[ ]` not started

Include commit references for completed roadmap items when possible.

---

## Quality Bar Before Merge

A change is done only when all are true:
- Code compiles and tests pass.
- Lint/typecheck pass.
- Core flow still works end-to-end.
- Docs reflect the new behavior.
- No regressions introduced in adjacent critical paths.

If any item fails, do not mark the task complete.
