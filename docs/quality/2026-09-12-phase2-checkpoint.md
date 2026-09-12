# v4.1 Reliability Checkpoint

Date: 2026-09-12. Stable web version remains **4.0.1**; target **4.1.0** is not released. Phase 2 and deployment were authorized, but approval does not waive failing security or acceptance gates. Commercial and private native Windows source have not been changed.

## Implemented, Not Deployed

Phase 1 source/persistence, private owner login, pricing SSR, account-key isolation, and public-browsing changes are retained. See [Phase 1 evidence](2026-09-12-phase1-review.md).

- B06: Supabase is configured, not connectivity-verified. PostgreSQL records verification time after `SELECT 1`; existing records without proof are not treated as verified. Replacement is atomic; failure keeps previous settings. The UI explains that running processes retain old environment variables until restarted.
- B07/B08: Login scrolls inside the application layout, provider notice wraps on narrow screens, and native modal onboarding makes background controls inert. Explicit Tab wrapping avoids browser-chrome focus escape. The expanded account journey passes native Chromium 200% zoom, 390x500 login, twelve Tab steps, Escape containment, registration, two-account/two-tab logout, Supabase rotation/disconnect, Checkout failure/cancellation and forged-success rejection. It recorded no browser exceptions. This is not a Stripe payment test.
- B09: Pricing reads server billing state only after a Checkout return. Forged URL parameters, stale active records, and failed billing reads do not confirm payment. Pending checks are bounded, with manual recheck available.
- B10: Generic/duplicate timer commentary no longer displaces real events. Historical heartbeat cards are ignored. A newer start/error invalidates prior Preview verification; finishing generation alone does not mean Preview is Ready. Background health polling uses display-only events, never the agent's completion signal; this prevents saved Preview health from finalizing a new prompt.
- Installers: retry exhaustion now returns the actual failure. Failed Git fetches do not move configuration away. Dependency recovery retains the lockfile; failed rebuilds restore previous artifacts. Existing PostgreSQL roles are not password-reset or repurposed. Caddy rollback avoids a forced shared-service restart. Setup is serialized per user and reports the failing stage without printing its command/credentials.
- Windows PowerShell: public WSL2 server setup, not a desktop binary. Syntax/prerequisite/download/exit-code contracts are tested. WSL enablement, first user setup and reboot requirements remain explicit; no unattended reboot, security-policy bypass, or distro deletion occurs.

## Evidence

Current full unit/integration run: **1,262 passed, nine skipped**. Strict boundaries, typecheck, lint (zero errors, ten warnings), production build, and bundle budget pass. Linux syntax/configuration/recovery fixtures and PowerShell 7.6.6 parser/contracts pass. The official PowerShell archive checksum was verified before execution. These results do not certify Windows PowerShell 5.1 or a Windows installation; CI was added for those contracts.

The production-build FREE/Luna browser journey at 19:41 UTC generated an interactive task board in about 39 seconds, applied a follow-up in about 14 seconds, retained Code selection and the composer, and restored source/history/Preview after navigation, reload, and deliberate runtime restart. It used a disposable non-root runtime, no project database, and no production data. No unexpected browser errors were recorded. The later final build includes the small-screen banner/focus changes, whose account journey is separately gated.

Repeat failures are retained as evidence: a 19:56 run remained on the fallback starter with asset 409 responses; a newly introduced background-health/completion coupling was removed before publication. The 20:06 run produced a healthy task form with no browser errors, but did not meet the test's blank-click behavior requirement. The acceptance prompt now explicitly requests a titled-task form and the browser must submit a title and find that exact new card. A fresh full journey is required after the final status changes; neither failed run counts as release acceptance.

The new CI workflow defines Ubuntu 22.04/24.04 clean/repair installs with no database and optional platform database, plus Windows PowerShell 5.1/7 contract jobs. **Definition is not execution**: do not mark I06 complete until actual jobs pass. Draft pull requests do not automatically publish a Preview deployment. Real TLS, clean-machine prompt generation and Windows/WSL reboot-resume testing remain open.

## Why Deployment Is Held

**B13 is not implemented:** generated Preview is served under the platform origin with `allow-scripts allow-same-origin`. Removing cookies from the upstream HTTP request does not isolate browser JavaScript. The release needs distinct Preview origins, session-scoped access, control-plane mutation protection and real cross-origin Vite/WebSocket/storage tests. Simply changing the iframe sandbox would break generated apps and is not a verified substitute.

Direct DNS checks corrected an earlier assumption about Cloudflare: `bolt.gives` uses authoritative OpenWeb/Day nameservers, and an arbitrary `pv-*.bolt.gives` name already resolves to this host. Its HTTPS request fails TLS. The empty Cloudflare zone list does not prove that missing DNS records block Preview; the release needs an implemented origin boundary plus verified certificate/routing configuration at the actual host/DNS provider. Do not paste provider credentials into a public issue or source file.

**Additional live isolation finding B14:** the production runtime service has no non-root service user configured, and its generated-command `spawn` does not drop UID/GID. Commands therefore inherit root on that path. The local acceptance harness deliberately runs its runtime without root; that is not proof that production is isolated. A staged per-project process/filesystem isolation migration is required before releasing the broad runtime changes. Do not rotate shared PostgreSQL/root credentials or recursively change existing customer workspace ownership as a substitute.

Read-only live checks still found `/pricing` returning 500 on bolt.gives, alpha1, create, and bolt-gives.pages.dev while `/api/health` returned 200. No new deployment has been made, so local fixes must not be described as live fixes. A `main` push automatically starts Pages deployment; publish this checkpoint on a validation branch until the blocker is fixed.

Remaining release scope: B13/B14; I02 mixed-version/atomic rollback; I03 full live BYOK transport/model switching; I04 disposable assigned fleet instance and public deploy/rollback; I05 real Stripe test-mode and remaining account/domain/collaboration paths; I06 real installer matrix; and private native Windows W01-W07. No forced Windows update or new desktop release was attempted.

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
