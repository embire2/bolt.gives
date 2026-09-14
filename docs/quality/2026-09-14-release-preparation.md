# Release Preparation, 14 September

This checkpoint is not a stable publication. Production remains v4.0.1, with
v4.1.0-beta.1 on the validation branch and alpha.

## Fixed and Verified

- A real rootless container reproduced `Could not retrieve exit code from event: died not found` and returned exit 127 during shutdown. Graceful stop alone did not fix it. Removing competing Podman auto-removal and leaving cleanup to the attached-process close handler did. Five repeats flushed a SIGTERM marker, returned exit zero and produced no event-lookup error. No test containers remain.
- The migration copy tool now refuses pre-existing destinations or environment records, nested/symlinked targets, and source services that are active, missing or not confirmed inactive. Its real alpha invocation refused before writes. The original and active workspace trees remain untouched by that check.
- The cPanel DNS-01 hook has 14 mocked API regressions covering username requirements, HTTPS/redirect boundaries, zone identity, namespace scoping, precise cleanup, concurrent serial changes, bounded retries and credential-safe errors. It stores backups outside source. API authentication, authoritative mutation, wildcard issuance and renewal remain untested without the token owner's cPanel username.

## Browser and Runtime Evidence

A fresh production-build Chromium journey used the real managed FREE/Luna
transport, not a simulated provider. It generated an interactive task board,
preserved Code selection, applied a follow-up to that same app and restored its
source/history after navigation, reload and an intentional runtime restart.
No unexpected browser errors occurred. One concurrent-snapshot 409 and two
restart-window 503 responses were recorded as expected recovery conditions,
not hidden. This used local TLS fixtures; it does not establish public wildcard
certificate acceptance or a deterministic cause for the older B15 hook crash.

The real rootless process suite again verified UID/GID, private/sibling-file and
symlink isolation, CPU/RAM/PID limits, project-only environment injection,
host-loopback protection and the assigned Preview listener.

The full unprivileged suite passed 1,396 tests with nine skipped. Production
build/bundle budget, typecheck, lint and strict module boundaries passed. Lint
retains ten existing warnings and no errors. Runtime module checks passed too.

Private evidence:

- `output/project-shutdown-before.log` and `output/project-shutdown-owned-cleanup.log`
- `output/release-isolation-20260914.log`
- `output/playwright/release-shutdown-20260914/report.json`
- `output/release-readiness-20260914-*.log`

## Remaining Gates

The cPanel endpoint is reachable over verified HTTPS, and the token is stored
outside the repository with mode 0600. Its owning account username is still
required. Do not guess it from the domain or reuse the machine's SSH username.
No authoritative DNS record has been changed in this checkpoint.

After DNS access is verified: rehearse wildcard issuance/renewal, complete the
production isolation migration and rollback, enable the dedicated signed Stripe
webhook against the migrated runtime, and run the remaining public/fleet
acceptance checks before merging the stable release. Production registration's
source-SHA guard must not be bypassed by changing metadata alone. No card was
charged, no credential was rotated, and native Windows work remains a separate
release lane.
