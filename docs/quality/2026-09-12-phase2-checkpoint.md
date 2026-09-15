# v4.1 Reliability Checkpoint

Date: 2026-09-12. Stable web version remains **4.0.1**; target **4.1.0** is not released. Phase 2 and deployment were authorized, but approval does not waive failing security or acceptance gates. Commercial and private native Windows source have not been changed.

## Implemented, Not Deployed

Phase 1 source/persistence, private owner login, pricing SSR, account-key isolation, and public-browsing changes are retained. See [Phase 1 evidence](2026-09-12-phase1-review.md).

- Source authority: Preview snapshot pulls no longer replay filesystem mutations back into the runtime. Stale responses are rejected after source/project changes, active file actions or unsaved editor changes. Read-only reconciliation preserves Code selection. History reload prefers current runtime source, including deletions; cached restore requires an explicit missing-session response. Regression tests exercise these contracts without weakening explicit local-history restores.
- Generation: fixture transport tracing proved a synthetic `Reply with OK` preflight timed out at 30,001 ms before actual generation. It has been replaced with local credential/model validation. Actual FREE requests still enforce authentication, quotas and funding errors. The client no longer treats a completed scaffold or a cloned snapshot as proof of a working app.
- Shutdown persistence: a real browser run retained its follow-up through navigation/reload, then lost it on runtime shutdown. Disk assertions isolated the write to the shutdown window. Intentional stop now invalidates asynchronous repair probes, cancels autostart and rejects late rollback scheduling without an active Preview. Two regression tests exercise late proxy failures and an already-running probe.
- Snapshot concurrency: an active-generation repeat recorded a snapshot 500. Independently reproduced tests show that an entry removed between listing and opening previously escaped as a generic filesystem error. Reads now return a bounded retryable 409, retaining the last complete map, and atomic `.bolt-sync-*.tmp` writes are excluded from all source filters. Permission failures are not misclassified as retryable changes.

- B06: Supabase is configured, not connectivity-verified. PostgreSQL records verification time after `SELECT 1`; existing records without proof are not treated as verified. Replacement is atomic; failure keeps previous settings. The UI explains that running processes retain old environment variables until restarted.
- B07/B08: Login scrolls inside the application layout, provider notice wraps on narrow screens, and native modal onboarding makes background controls inert. Explicit Tab wrapping avoids browser-chrome focus escape. The expanded account journey passes native Chromium 200% zoom, 390x500 login, twelve Tab steps, Escape containment, registration, two-account/two-tab logout, Supabase rotation/disconnect, Checkout failure/cancellation and forged-success rejection. It recorded no browser exceptions. This is not a Stripe payment test.
- B09: Pricing reads server billing state only after a Checkout return. Forged URL parameters, stale active records, and failed billing reads do not confirm payment. Pending checks are bounded, with manual recheck available.
- B10: Generic/duplicate timer commentary no longer displaces real events. Historical heartbeat cards are ignored. A newer start/error invalidates prior Preview verification; finishing generation alone does not mean Preview is Ready. Background health polling uses display-only events, never the agent's completion signal; this prevents saved Preview health from finalizing a new prompt.
- Installers: retry exhaustion now returns the actual failure. Failed Git fetches do not move configuration away. Dependency recovery retains the lockfile; failed rebuilds restore previous artifacts. Existing PostgreSQL roles are not password-reset or repurposed. Caddy rollback avoids a forced shared-service restart. Setup is serialized per user and reports the failing stage without printing its command/credentials.
- Windows PowerShell: public WSL2 server setup, not a desktop binary. Syntax/prerequisite/download/exit-code contracts are tested. WSL enablement, first user setup and reboot requirements remain explicit; no unattended reboot, security-policy bypass, or distro deletion occurs.

## Evidence

Current full unit/integration run: **1,284 passed, nine skipped**. Strict boundaries, typecheck, lint (zero errors, ten warnings), production build, and bundle budget pass. Linux syntax/configuration/recovery fixtures and PowerShell 7.6.6 parser/contracts pass. The official PowerShell archive checksum was verified before execution.

The production-build FREE/Luna browser journey at 19:41 UTC generated an interactive task board in about 39 seconds, applied a follow-up in about 14 seconds, retained Code selection and the composer, and restored source/history/Preview after navigation, reload, and deliberate runtime restart. It used a disposable non-root runtime, no project database, and no production data. No unexpected browser errors were recorded. The later final build includes the small-screen banner/focus changes, whose account journey is separately gated.

Repeat failures are retained as evidence: a 19:56 run remained on the fallback starter with asset 409 responses; a newly introduced background-health/completion coupling was removed before publication. The 20:06 run produced a healthy task form with no browser errors, but did not meet the test's blank-click behavior requirement. The acceptance prompt now explicitly requests a titled-task form and the browser must submit a title and find that exact new card after generation settles. Neither failed run counts as release acceptance; the later journeys below exercise the corrected contract.

The later 21:02 UTC journey passed after the preflight/shutdown fixes: first interactive Preview in 38 seconds, follow-up in 14 seconds, preserved Code selection, navigation/reload, and runtime restart. Disk assertions confirmed the follow-up remained saved before and after shutdown/startup. Snapshot: 13 entries, 43,511 bytes, 14 ms; runtime high-water RSS 90,684 KiB for this small fixture, not a general workload guarantee. Expected conflict retries and the deliberately induced restart 503s are recorded; unexpected errors were zero. A concurrent-build browser attempt is invalid evidence and is not counted.

**Final production-build repeat, 21:05 UTC:** includes the snapshot-filter/concurrent-removal changes. First interactive Preview in 44 seconds, follow-up in 15 seconds, Code selection preserved, navigation/reload and runtime restart passed. Exactly two real FREE requests; no unexpected browser/HTTP errors. Snapshot: 13 entries, 43,663 bytes, 14 ms; runtime high-water RSS 95,296 KiB. The only 503s occurred during the intentionally stopped runtime. The [restored Preview screenshot](../screenshots/agent-mode-v4.1-checkpoint.png) contains only an owned fixture. All disposable services and workspaces were cleaned up.

[Installer CI passed all five jobs](https://github.com/embire2/bolt.gives/actions/runs/34716586998): real Ubuntu 22.04/24.04 clean/repair installs with no database and optional platform database, plus PowerShell 5.1/7 contracts on a Windows runner. Application/pricing/runtime health and configuration preservation passed after deliberately stopping and repairing the app. Real TLS, clean-machine prompt generation and Windows/WSL reboot-resume testing remain open, so I06 is not entirely complete. Draft Preview deployment was correctly skipped. CI/CD, Code Quality, Security Analysis and PR Validation also passed at checkpoint b849afc; optional Codeball failed because its external api.codeball.ai hostname did not resolve.

## Why Deployment Is Held

**B13 is not implemented:** generated Preview is served under the platform origin with `allow-scripts allow-same-origin`. Removing cookies from the upstream HTTP request does not isolate browser JavaScript. The release needs distinct Preview origins, session-scoped access, control-plane mutation protection and real cross-origin Vite/WebSocket/storage tests. Simply changing the iframe sandbox would break generated apps and is not a verified substitute.

Direct DNS checks corrected an earlier assumption about Cloudflare: `bolt.gives` uses authoritative OpenWeb/Day nameservers, and an arbitrary `pv-*.bolt.gives` name already resolves to this host. Its HTTPS request fails TLS. The empty Cloudflare zone list does not prove that missing DNS records block Preview; the release needs an implemented origin boundary plus verified certificate/routing configuration at the actual host/DNS provider. Do not paste provider credentials into a public issue or source file.

**Additional live isolation finding B14:** the production runtime service has no non-root service user configured, and its generated-command `spawn` does not drop UID/GID. Commands therefore inherit root on that path. The local acceptance harness deliberately runs its runtime without root; that is not proof that production is isolated. A staged per-project process/filesystem isolation migration is required before releasing the broad runtime changes. Do not rotate shared PostgreSQL/root credentials or recursively change existing customer workspace ownership as a substitute.

Read-only live checks still found `/pricing` returning 500 on bolt.gives, alpha1, create, and bolt-gives.pages.dev while `/api/health` returned 200. No new deployment has been made, so local fixes must not be described as live fixes. A `main` push automatically starts Pages deployment; publish this checkpoint on a validation branch until the blocker is fixed.

Remaining release scope: broader generation/recovery soak; B13/B14; I02 mixed-version/atomic rollback; I03 full live BYOK transport/model switching; I04 disposable assigned fleet instance and public deploy/rollback; I05 real Stripe test-mode and remaining account/domain/collaboration paths; remaining I06 TLS/WSL/generation paths; and private native Windows W01-W07. No forced Windows update or new desktop release was attempted.

## 13 September Combined Beta Follow-Up

Both implemented halves are consolidated for an opt-in test prerelease, not stable deployment. At `89de3f7`, [CI/CD](https://github.com/embire2/bolt.gives/actions/runs/34719193886), [Security Analysis](https://github.com/embire2/bolt.gives/actions/runs/34719193834), Code Quality, PR Validation, and [Installer Recovery](https://github.com/embire2/bolt.gives/actions/runs/34719193742) completed successfully. Codeball failed to resolve its external `api.codeball.ai` dependency; it was not disabled or represented as a green check.

Publication checks reproduced an installer defect for tag-based repair (`origin/<tag>` does not exist). Real-Git tests now cover initial annotated-tag install, repeated repair, forward tag upgrade, branch update, missing refs, divergence and rewritten-tag refusal. Prerelease update ordering is also corrected so the eventual stable release outranks its beta.

The first new production-build browser repeat at **10:24 UTC on 13 September failed** and is not counted as acceptance. Its real FREE response nested `<boltArtifact>` inside the `write_file.content` string. The browser parser prematurely closed the outer file action and synced a one-byte `App.tsx`, triggering a missing-default-export exception. The provider bridge now normalizes an unambiguous single-file wrapper before emitting the artifact, rejects nested commands/path changes and explicitly requests raw file content. Regression tests feed every streaming prefix into the browser parser and compare its single complete file with server extraction. This does not change B13/B14.

The **10:35 UTC repeat also failed**, with `Cannot read properties of null (reading 'useState')` at 10:36:05. Its screenshot shows an empty central application surface. No stack was retained by the original harness, so the responsible frame/module has not been established. This is B15, an open investigation rather than a claimed fix. The harness now captures redacted error stacks and Preview module imports; tests were not weakened to suppress the failure.

The **10:37 UTC instrumented repeat passed**: normal owner login, real FREE/Luna generation, interactive task addition in about 20 seconds, follow-up in about 20 seconds, retained Code/composer, navigation, reload and deliberate runtime restart. Exactly two real model requests; no unexpected browser/HTTP errors. Snapshot: 13 entries, 42,003 bytes, 27 ms; runtime high-water RSS 95,860 KiB. Only the deliberate restart produced 503s. The [beta screenshot](../screenshots/agent-mode-v4.1-beta.1.png) shows the restored follow-up and actual beta version. All owned fixture services/workspaces were cleaned up. This passing run does not resolve intermittent B15 or production isolation.

After the tool-envelope and publication fixes, **1,319 tests passed, nine skipped**. Typecheck, lint (zero errors, ten existing warnings), boundaries, production build and the 2 MB initial-chat budget pass (1,790,880 bytes). Linux syntax/default smoke, five real-Git ref recovery tests and local PowerShell parser/contracts pass. Stable deployment remains held for the documented gates.

The beta account/accessibility browser repeat also passed with zero recorded browser exceptions: two accounts/tabs and key isolation, logout, 390x500 login, native Chromium 200% zoom, modal focus containment, Supabase rotation/disconnect, Checkout error/retry/cancellation fixtures and forged-payment rejection. This uses a disposable local platform database and does not certify live Stripe fulfillment, OTP delivery or native Windows.

Artifact scanning found B16: an ignored `.env` GitHub token was embedded through the broad `VITE_*` prefix and whole-object `import.meta.env` access. Matching live asset requests returned 200 and contained the same token; GitHub's authenticated user endpoint returned 401, so the old token was not usable at verification. No token value was printed, committed or rotated. The build now exposes only exact public names, omits credential-bearing provider URLs and has an actual Vite bundle regression for direct/whole-object secret access. Existing live/cached assets have not been replaced by this beta publication. Do not reactivate or reuse the exposed token.

The post-B16 suite passes **1,326 tests, nine skipped**, typecheck, build/budget and boundaries. Scanning public source plus rebuilt client assets against 29 configured credential values returns no matches. This is a current-artifact scan, not a full Git history audit or proof that every old deployment cache is clean.

**Final post-B16 production-build browser repeat, 10:49 UTC:** passed normal login, interactive first Preview in about 28 seconds, follow-up in about 12 seconds, Code selection, navigation, reload and intentional runtime restart. Exactly two real FREE/Luna requests, no unexpected browser/HTTP errors, and only intentional restart 503s. The current beta screenshot is from this final repeat. Snapshot: 13 entries, 42,344 bytes, 13 ms; runtime high-water RSS 93,372 KiB. All owned runtime processes/workspaces were cleaned up. B15 remains open because no deterministic root cause/regression for the earlier intermittent crash has been established.

## Reproduce

```bash
pnpm check:boundaries:strict
pnpm run typecheck
pnpm run lint
pnpm test
pnpm run build
pnpm smoke:self-host-installer
node scripts/e2e-phase1-local.mjs
BOLT_E2E_NATIVE_ZOOM=1 xvfb-run -a node scripts/e2e-phase1-accounts.mjs
node scripts/e2e-browsing-boundaries.mjs
```

The accounts harness requires disposable PostgreSQL binaries, Chromium, Xvfb and xdotool. Reports/screenshots remain under ignored `output/playwright`; they contain test fixture identities, not customer sessions. Run `pwsh -NoProfile -File scripts/test-windows-setup.ps1` for portable PowerShell contracts. This does not substitute for the private native Windows application's UI Automation suite.
