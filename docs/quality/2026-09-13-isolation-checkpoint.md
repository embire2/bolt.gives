# Isolation and Recovery Checkpoint

Date: 13 September 2026. Development branch: `fix/v4.1-reliability-checkpoint`.

This is implementation and test evidence, not a stable release or a production migration.
The public application still serves v4.0.1. The published opt-in prerelease remains v4.1.0-beta.1.

## Implemented

- Rootless per-project Podman processes for installs, builds, shell commands and Preview. Only the project directory is mounted; the image is read-only, capabilities are dropped and CPU/RAM/PID limits apply. Existing directory ownership must be migrated explicitly.
- Await container termination before reusing a Preview port. Failed termination retains the reservation instead of claiming successful shutdown.
- Signed project-specific HTTPS Preview origins, host-only partitioned access cookies, scoped readiness/error reporting and cross-project/origin checks. Platform runtime traffic is authenticated and installer Caddy routes go through that guard.
- Reject operator-storage directory names as project IDs and strip platform cookies, internal headers and unsafe generated response headers at the Preview boundary.
- Keep empty failed assistant messages from triggering history navigation before queued recovery. Restore the latest visible user objective when Chat initializes.
- Track real buffered FREE file-argument activity without streaming partial files or treating keep-alives as progress.

## Reproductions and Validation

The empty-assistant navigation regression failed before the fix. A later real FREE request delivered only transport keep-alives for two minutes; the app then retried and received a valid file. This was an upstream stall, not proof that file generation had started.

Three combined real-provider browser runs passed with non-root containers and project-specific HTTPS Preview:

| Owned fixture                     | Result                                                                                                                                                                                             |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rootless-origin-20260913-5`      | Interactive generated task board, cross-origin platform mutation denied with 403, Code selection, follow-up, navigation, reload and runtime restart                                                |
| `rootless-origin-recovery-final`  | Injected empty first-stream failure; automatic continuation dispatched in under one second; real provider subsequently generated the app; follow-up/history/restart passed; 20 cold reloads passed |
| `rootless-origin-transport-trace` | Real upstream stall, bounded retry, interactive app and follow-up, history/restart continuity, 20 cold reloads passed                                                                              |

The deliberate runtime restart returned temporary 503 responses; these were expected, recorded and recovered. Earlier failed runs are retained in the private operator evidence and are not included in the pass count. The test TLS certificate is self-signed and accepted only by the local test browser. This is not public TLS acceptance.

Additional checks:

- 1,347 unit/integration tests passed, nine skipped, using Node 22 and a non-root test account.
- Typecheck, strict module boundaries and production build/bundle budget passed. Lint has zero errors and ten existing warnings.
- The real container test verified non-root UID/GID, denied root/operator/sibling files and symlink escape, resource limits, project-only environment, denied private host loopback and loopback-only Preview publication.
- Five deterministic task-board startup replays passed with varied response timing; a sixth passed with both fixture services using the selected Node 22 binary and no operator API credential. The last four also verified browser-error delivery through the isolated gateway while retaining the project. These are simulated-provider diagnostics, not additional live FREE passes. None reproduced B15.
- The disposable PostgreSQL account browser matrix passed cross-tab key clearing, account separation, short-window login/modal controls, truthful Supabase rotation/disconnection and rejection of forged payment success. Checkout error/retry/cancel used an owned fixture, not a Stripe payment.
- Installer smoke passed syntax, help, generated secret/environment permissions and database-free/optional-platform-database contracts. It does not replace clean-machine public TLS or reboot/resume acceptance.

All 23 affected-module tasks passed. The final production build and bundle check passed again. The live `pnpm gate:release` deliberately remains failed: alpha1 serves v4.0.1 rather than the checkout's v4.1.0-beta.1. Both alpha1 and the primary public site returned HTTP 200 during the final read-only check. No service or production proxy was replaced.

Reports and screenshots are in ignored `output/playwright/` directories. They contain only owned test projects and are not published as customer data. Provider traces record event types, counts and usage, never operator keys.

## Still Required Before Stable Rollout

1. **B13:** Provision public Preview TLS/routing and verify WebSockets, browser error recovery and the deployed authorization route. Choose a separate registrable Preview domain or complete platform cookie-tossing defenses; different subdomains alone do not stop JavaScript from attempting parent-domain cookies.
2. **B14:** Back up and migrate staging workspace ownership and private database records, verify the runtime's privileged control-plane operations, and prove rollback. Do not recursively change the original customer tree or rotate credentials. Then migrate production and fleet targets from the same verified build.
3. **B15:** Obtain a deterministic reproduction and exact frame/module stack for the earlier intermittent `useState` crash. Cold-reload passes are encouraging but do not close this finding. The browser harness now records execution contexts and provides an explicitly simulated provider replay for inexpensive startup reproduction; those runs must not be counted as real-provider generation.
4. **I03/I04/I05:** Finish user-key model switching, a disposable assigned Cloudflare generation/publishing/update/rollback journey and real Stripe **test-mode** fulfillment. Only live Stripe credentials are currently available; do not charge a real card to satisfy a test.
5. **I02/I06:** Complete mixed app/runtime revision acceptance, atomic rollout/rollback and clean-machine TLS/WSL reboot-resume checks. The proprietary native Windows rewrite remains a separate release lane.

See [runtime migration requirements](../operations/runtime-isolation.md) and [the roadmap](../../ROADMAP.md). No stable tag, main-branch merge or production/fleet deployment is authorized by this evidence alone.
