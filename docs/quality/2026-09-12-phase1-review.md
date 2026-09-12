# v4.1.0 Phase 1 Review

Date: 2026-09-12. Current stable web version: **4.0.1**. This is an unreleased development checkpoint, not a fleet rollout. Only bolt.gives was changed; commercial and private Windows source were not touched.

## Scope

The first approval stage covers B01/B02/B03/B04/B05/B12 from the [audit](2026-09-12-v4.1-audit.md). This document retains that checkpoint's historical evidence. Phase 2 and deployment have since been authorized; follow the [current checkpoint](2026-09-12-phase2-checkpoint.md) for progress and deployment blockers.

## Implemented Changes

- **Source size and freshness (B01/B02):** one source-path policy excludes caches, dependencies, VCS/build output at every depth while retaining `.github`. Disk reads reject symlink escapes and use entry, file-size, total-size, and deadline limits. Same-count edits, rename/delete, and empty workspaces are reconciled from disk, not inferred from file counts. Concurrent managed mutations return 409 with bounded client retries instead of stale success. Browser source reads are capped and IndexedDB saves wait for transaction completion.
- **Pricing (B03):** the Upgrade button is safe for server rendering, rejects duplicate in-flight clicks, shows errors, and can retry. Direct `/pricing` loads and signed-out Upgrade/login routing work. A controlled cancellation fixture tests UI behavior without making a payment.
- **No-database self-host (B04):** fresh installs explicitly select single-owner mode and generate a private access token. A stable local profile and hashed sessions survive restarts without PostgreSQL or SMTP. Hosted profile authentication is unchanged. Runtime HTTP and Preview upgrades pass through the owner guard, including the Caddy route. No provider/infrastructure credentials are inherited by a new installation. Repair preserves existing secrets and does not silently downgrade a platform-database installation.
- **Account keys (B05):** provider cookies are associated with their profile; legacy browser envelopes are removed rather than restored. Logout and account changes clear keys and open key editors in other tabs. Late old-account callbacks cannot write credentials after logout. Reading saved settings no longer triggers saves or redundant model-catalog calls. Profile timestamps use stable UTC formatting to avoid hydration failures.
- **Browsing (B12):** browser and text transports share public-address validation. Connections pin the validated DNS address, reject mixed/private answers, check redirect destinations, and bound response size/time. Chromium routes its subresources through that transport, blocks WebSockets/service workers, and enforces request/byte budgets. The raw unprotected fetch fallback is gone; safe public-page browsing was also tested against example.com.
- **Cross-boundary failures found by E2E:** streamed Node request bodies now set duplex correctly; private self-host verification uses its configured runtime instead of an unauthenticated self-fetch; Node forwards authorized Preview WebSockets without calling fetch with an Upgrade header. Preview event callbacks await reconciliation and hand failures to their retry path. Owner-guard runtime outages return 503, not 401. Preview forwarding strips platform credentials before reaching generated servers.

## Limits and Compatibility

Defaults are 5,000 source entries, 4 MiB per file, a conservative 16 MiB serialized-source budget, and a ten-second disk scan. The server reserves worst-case JSON escaping space before allocating a file, so ordinary text may hit the total limit below 16 MiB of raw source. Browser/server consumers also cap received snapshot payloads. Oversized projects fail explicitly rather than silently truncating files; operators can adjust the documented runtime limits, but the current browser transport ceiling remains fixed.

Single-owner mode is not a multi-user hosting replacement. Its token lives in the install's protected `.env.local`; profile/session records live outside generated source. The runtime must remain on loopback. Existing platform PostgreSQL accounts remain separate from optional project Supabase/PostgreSQL connections.

## Verification

Final Phase 1 validation:

| Check                                   | Result                                                                                                                                                          |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Strict module boundaries and typecheck  | Passed                                                                                                                                                          |
| Lint                                    | Zero errors; ten warnings                                                                                                                                       |
| Unit/integration suite                  | 1,241 passed; nine skipped                                                                                                                                      |
| Production build and bundle budgets     | Passed; chat entry 1,788,659 bytes against a 2,000,000-byte budget                                                                                              |
| Installer smoke and configuration tests | Passed; no-db clean/repair, explicit platform-db, and existing-db preservation                                                                                  |
| Caddy configuration validation          | Both owner and platform-db routing configurations passed; no live Caddy reload                                                                                  |
| Account browser matrix                  | Passed with no browser exceptions; two real temporary PostgreSQL profiles and two tabs                                                                          |
| Public browsing                         | Real Chromium public-document/private-subresource fixtures passed with zero private-network requests; example.com browsing returned 200                         |
| Prompt-to-Preview browser journey       | Passed against the production build, including real FREE/Luna first generation, interaction, Code selection, follow-up, navigation, reload, and runtime restart |
| Configured-secret scan                  | No exact matches in 1,124 tracked and eligible new source/documentation files; not a complete historical-secret audit                                           |

The final generation run started at 18:07 UTC. First interactive Preview took about 43 seconds and the follow-up about 20 seconds, with exactly two chat requests. It recorded no unexpected browser/HTTP errors. The deliberate runtime shutdown produced expected retryable 503 responses and an interrupted event-stream diagnostic; the project, owner session, source, history, and prompt returned after restart without an uncaught promise. Snapshot measurement: **42,274 bytes, 13 source entries, 13 ms**. Runtime-process high-water RSS was **90,140 KiB**; this excludes generated Vite/Node child processes, Chromium, and the app server, so it is not a whole-service memory benchmark.

Earlier runs are not concealed: one follow-up exceeded the original test deadline; another first generation needed automatic retry after a timeout. The final run did not need a generation retry, but provider soak remains necessary.

Reproduction commands:

```bash
pnpm check:boundaries:strict
pnpm run typecheck
pnpm run lint
pnpm test
pnpm run build
pnpm smoke:self-host-installer
node scripts/e2e-phase1-local.mjs
node scripts/e2e-phase1-accounts.mjs
node scripts/e2e-browsing-boundaries.mjs
```

The generation harness reads only the configured MagnetAPI key for the app server. It does not pass that key to the non-root runtime or generated project. It submits normal browser prompts, interacts with the generated app, checks Code selection and composer visibility, applies a follow-up, navigates away/back, reloads, and restarts its own isolated runtime. Snapshot bytes, duration, and runtime high-water RSS are recorded in its local JSON report. Output is under ignored `output/playwright/phase1-20260912`.

The account harness creates and deletes its own temporary PostgreSQL 16 cluster on a random loopback port. Alice saves a dummy provider key through the UI; logout clears another tab's open editor; Bob cannot inherit it. It also exercises signed-out Upgrade routing, an actual unconfigured-checkout error, and an explicitly mocked cancellation redirect. It does not read operator secrets, send customer emails, touch production PostgreSQL, or perform a Stripe payment. Reports are under ignored `output/playwright/phase1-accounts-20260912`.

## Remaining Release Checks

- Real Stripe **test-mode** Checkout, cancellation/retry, signed webhook fulfillment, and entitlement verification are not certified by the UI fixture. No live charges were made.
- Installer syntax and clean/repair configuration plus isolated app journeys do not certify apt, systemd, public TLS/Caddy activation, or partial-install recovery on a clean Ubuntu VM. Keep the clean-OS matrix open.
- Live FREE generation showed intermittent response timeouts; automatic retry recovered a later run. A single successful journey does not establish first-pass provider reliability. Keep provider/deadline soak in the broader release evidence.
- **New finding B13, Preview-origin isolation:** `Preview.tsx` uses `allow-scripts allow-same-origin` while hosted Preview is served at the product origin under `/runtime/preview`. The cookie-forwarding fix protects requests to generated servers, but is not a complete boundary against generated browser JavaScript reading JavaScript-accessible platform storage or making same-origin authenticated calls. Dedicated Preview origins/capability-scoped access and browser isolation tests need a separately approved implementation. Treat this as a release blocker, not a fixed security claim.
- Phase 2 still includes misleading Ready/Active commentary, short-window login/focus accessibility, unverified Supabase status, and query-string payment claims. None are presented as fixed here.
- No production/fleet deployment, new Cloudflare instance, public project publishing, Windows testing, release tag, or version bump was performed in this Phase 1 checkpoint.

Phase 2 is now approved and underway. Do not describe either checkpoint as a released or error-free v4.1.0 while its release gates remain open.
