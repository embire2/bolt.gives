# Release Preparation, 14 September

This checkpoint is not a stable publication. Production remains v4.0.1, with
v4.1.0-beta.1 on the validation branch and alpha.

## Fixed and Verified

- A real rootless container reproduced `Could not retrieve exit code from event: died not found` and returned exit 127 during shutdown. Graceful stop alone did not fix it. Removing competing Podman auto-removal and leaving cleanup to the attached-process close handler did. Five repeats flushed a SIGTERM marker, returned exit zero and produced no event-lookup error. No test containers remain.
- The migration copy tool now refuses pre-existing destinations or environment records, nested/symlinked targets, and source services that are active, missing or not confirmed inactive. Its real alpha invocation refused before writes. The original and active workspace trees remain untouched by that check.
- The cPanel DNS-01 hook has 18 mocked API regressions covering username requirements, HTTPS/redirect boundaries, zone identity, namespace scoping, explicit wildcard routing, byte-exact cleanup, concurrent serial changes, bounded retries and credential-safe errors. Final review caught ASCII decoding masking high TXT bits; byte-preserving decoding now prevents unrelated binary TXT values from matching an ACME challenge. The hook also refuses changes without an explicit wildcard route for each namespace: adding a TXT child can otherwise disable an inherited broader wildcard. It stores backups outside source. API authentication, authoritative mutation, wildcard issuance and renewal remain untested without the token owner's cPanel username.

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

The full unprivileged suite passed 1,400 tests with nine skipped. Production
build/bundle budget, typecheck, lint and strict module boundaries passed. Lint
retains ten existing warnings and no errors. Runtime and control-plane module checks passed too.

Private evidence:

- `output/project-shutdown-before.log` and `output/project-shutdown-owned-cleanup.log`
- `output/release-isolation-20260914.log`
- `output/playwright/release-shutdown-20260914/report.json`
- `output/release-readiness-20260914-*.log`

## Remaining Gates

### Later Operator Continuation

The supplied cPanel username authenticated successfully. Live API responses
exposed the direct HTTPS envelope and relative DNS names, both now covered by
regressions. Six explicit routing records preserve the `instances.bolt.gives`
parent and both Preview namespaces without changing existing mail/site records.

The registrar's second server, `pns2.day.co.za`, refused this zone because its
DNS daemon had no `bolt.gives` zone. Existing authorized access to the same
`webhotel.cloud` host allowed repair without changing registrar delegation or
other hosted zones. The primary refuses AXFR, so a root-owned, cPanel-fed mirror
updates only this zone every 30 seconds. Candidate files pass `named-checkzone`,
serials cannot move backwards, and the daemon's served serial is checked after
reload. This caught and fixed a restrictive-umask problem that left BIND serving
old data even though `rndc reload` returned zero. The original `webhotel.cloud`
zone still answers with its unchanged serial.

The initial certificate attempt returned a staging certificate despite failed
propagation hooks; that is not counted as acceptance. A fresh staging account
then passed both propagation hooks and cleanup. Public Let's Encrypt issuance
also passed, and an unknown alpha Preview hostname completes trusted TLS and
returns the expected authorization-safe 404. A certificate/key install hook
checks matching keys, required wildcard names and expiry, switches them
atomically and restores the previous pair if validated Caddy reload fails.

Non-root mail settings reproduced EACCES against the root service file. Mutable
settings now live separately with mode 0600; omitted SMTP passwords are preserved
and explicit clearing shadows inherited values. SMTP authentication passed
without sending mail. A narrowly delegated oneshot validates/reloads Caddy; a
real invocation as the non-root runner passed. The suite now passes 1,424 tests,
nine skipped. Production application migration is still pending.

Private evidence: `output/preview-certbot-staging-verified.log`,
`output/preview-certbot-public.log`, `output/preview-certbot-renewal.log` and
`output/release-20260914-dns-sync-*.log`. The earlier missing-username notes below
describe the initial checkpoint, not the current access or DNS state.

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
