# AGENTS.md

## Mission

Build and maintain `bolt.gives` as a production-ready agentic coding platform, with a strong focus on reliability, transparent execution, and safe autonomous behavior.

Current release line:

- Stable: `v3.0.8`
- In progress: `v3.0.9`

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

## v3.0.8 Baseline / v3.0.9 Priority Stack

### Completed baseline

- Live Development Commentary Stream
- Agent Anti-Stall + Auto-Recovery
- Execution transparency panel + sticky footer
- Safer autonomy modes
- Architect self-heal v1 foundations
- Provider/model/API-key persistence and cost estimation normalization
- Installer-first self-host baseline
- Hosted FREE provider with a protected managed-token route pinned to `openai/gpt-oss-120b:free`
- Cloudflare managed-instance architecture docs
- Server-first hosted runtime default path
- Preview auto-recovery via server-side health checks
- Top-level Chat / Workspace tabs
- Harder client chunking and deferred heavy surfaces
- Bootstrap Tenant Admin route with default `admin / admin` on server-hosted instances
- Hosted FREE provider locked to one protected OpenRouter model (`openai/gpt-oss-120b:free`) with no client-visible fallback path
- Lightweight client-side provider catalog so server/provider SDK code stays off the browser startup path
- Tenant user portal with sign-in and password rotation
- Committed live smoke path for generated-app success plus preview break/recovery
- Locked FREE model label now renders consistently as `OpenAI gpt-oss-120b (free)` during selector bootstrap instead of falling back to a generic placeholder
- Managed Cloudflare trial-instance control plane route/API surface at `/managed-instances`
- One-client / one-instance runtime enforcement based on claimed email identity and browser session ownership
- Browser regression coverage for `FREE` + `OpenAI gpt-oss-120b (free)` label rendering on startup
- `Tenant Admin` now includes an operator view for managed Cloudflare trials, with status/expiry visibility plus server-backed refresh and suspend actions
- Managed Cloudflare instance metadata returned to browser surfaces is sanitized; Cloudflare operator credentials remain server-side only
- Managed Cloudflare trials now require a registration profile before provisioning
- Registered client profiles, assigned trial instances, and admin email activity are now stored in the private admin control plane behind `admin.bolt.gives`

### In progress / remaining (`v3.0.9`)

- Finish browser-weight reduction on the remaining editor/PDF/git/terminal payloads
- Keep prompt-to-preview execution status explicit in both `Chat` and `Workspace`
- Keep commentary task-specific and derived directly from runtime events only
- Live-enable the managed Cloudflare spawn/update control plane wherever operator credentials are configured
- Add operator rollout/rollback observability for managed Cloudflare instances
- Expand the operator surface with deployment history, rollback outcomes, and capacity visibility
- Production-safe tenant/account/RBAC hardening
- Tenant approval/invite lifecycle beyond the server-local registry baseline
- Self-host installer resilience, including interactive PostgreSQL setup and recovery from common apt/build/service failures
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
