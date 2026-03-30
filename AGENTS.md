# AGENTS.md

## Mission

Build and maintain `bolt.gives` as a production-ready agentic coding platform, with a strong focus on reliability, transparent execution, and safe autonomous behavior.

Current release line:

- Stable: `v3.0.3`
- In progress: `v3.0.4`

Do not ship hidden behavior. If the agent takes actions, users should be able to see what happened and why.

---

## Repository and Branch Rules

- Primary repo: `https://github.com/embire2/bolt.gives`
- Primary working branch for live updates: `main`
- Optional staging branch: `alpha`

If both `alpha` and `main` are active:
- Land high-risk work on `alpha`
- Verify on `https://alpha1.bolt.gives`
- Fast-forward or merge cleanly into `main`
- Keep `main` as the release source-of-truth; keep `alpha` fast-forwarded to `main` when no soak test is active.

Never force-push shared branches unless explicitly approved.

---

## Work Scope Rules

- Prioritize reproducible issues or clearly approved roadmap items.
- One logical change per commit unless a larger atomic change is required for correctness.
- Keep behavior changes explicit in commit messages and release notes.
- Avoid unrelated refactors during hotfixes unless they are needed for safety.

---

## v3.0.3 Baseline / v3.0.4 Priority Stack

### Completed baseline

- Live Development Commentary Stream
- Agent Anti-Stall + Auto-Recovery
- Execution transparency panel + sticky footer
- Safer autonomy modes
- Architect self-heal v1 foundations
- Provider/model/API-key persistence and cost estimation normalization
- Installer-first self-host baseline
- Hosted FREE provider with managed-token routing and silent fallback
- Cloudflare managed-instance architecture docs
- Server-first hosted runtime default path
- Preview auto-recovery via server-side health checks
- Top-level Chat / Workspace tabs
- Harder client chunking and deferred heavy surfaces
- Bootstrap Tenant Admin route with default `admin / admin` on server-hosted instances

### In progress / remaining (`v3.0.4`)

- Finish browser-weight reduction on remaining vendor/editor payloads
- Full managed Cloudflare spawn/update control plane
- Production-safe tenant/account/RBAC hardening
- First-party template packs + CI smoke coverage
- Teams add-on and collaboration audit trail
- Update-channel rollback verification and operator tooling

---

## Mandatory Implementation Workflow

1. Confirm current behavior
- Reproduce the issue or validate the feature gap.
- Record exact file(s) and runtime path affected.

2. Implement minimal safe fix
- Keep contracts backward compatible where possible.
- Add guardrails for strict providers when touching tool schemas.

3. Add or update tests
- Add regression coverage close to the changed code.
- Include at least one test that would fail before the fix.

4. Validate locally
- `pnpm run typecheck`
- `pnpm run lint`
- `pnpm test`
- `pnpm run build`

5. Run targeted E2E smoke for core-path changes
- Required when touching chat streaming, providers, tools, deployments, auth, preview, or file actions.
- Use at least one real provider path when credentials are available.

6. Commit and push
- Use Conventional Commits.

---

## Deployment Rules

Validation targets:
- `https://alpha1.bolt.gives`
- `https://ahmad.bolt.gives`
- `https://bolt-gives.pages.dev`

When deploying:
- Confirm build passes.
- Confirm runtime starts and chat flow works.
- Confirm static assets and version/changelog are fresh.
- Confirm no provider/tool schema runtime errors in browser console and server logs.
- Confirm all live domains return healthy responses.

If deployment fails:
- Capture the exact error text.
- Fix root cause, not symptoms.
- Re-run smoke before declaring success.

---

## Security and Secrets

- Never commit API keys, tokens, cookies, session dumps, or private logs.
- Keep secrets in `.env.local` or environment variables.
- Redact credentials in screenshots, issue text, and commit messages.

---

## Documentation Rules

When behavior changes, update docs in the same change set:
- `CHANGELOG.md`
- `README.md`
- `ROADMAP.md`

Roadmap states:
- `[x]` complete
- `[~]` partial/in progress
- `[ ]` not started

---

## Quality Bar Before Merge

A change is done only when all are true:
- Code compiles and tests pass.
- Lint and typecheck pass.
- Core flow still works end-to-end.
- Docs reflect the new behavior.
- No regressions are introduced in adjacent critical paths.

If any item fails, do not mark the task complete.
