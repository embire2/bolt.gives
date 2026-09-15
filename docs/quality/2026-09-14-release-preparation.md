# Release Preparation, 14 September

This checkpoint is not a stable publication. Production remains v4.0.1, with
v4.1.0-beta.1 on the validation branch and alpha.

## Fixed and Verified

- A real rootless container reproduced `Could not retrieve exit code from event: died not found` and returned exit 127 during shutdown. Graceful stop alone did not fix it. Removing competing Podman auto-removal and leaving cleanup to the attached-process close handler did. Five repeats flushed a SIGTERM marker, returned exit zero and produced no event-lookup error. No test containers remain.
- The migration copy tool now refuses pre-existing destinations or environment records, nested/symlinked targets, and source services that are active, missing or not confirmed inactive. Its real alpha invocation refused before writes. The original and active workspace trees remain untouched by that check.
- The initial cPanel DNS-01 hook had 18 mocked API regressions covering username requirements, HTTPS/redirect boundaries, zone identity, namespace scoping, explicit wildcard routing, byte-exact cleanup, concurrent serial changes, bounded retries and credential-safe errors. The initially missing username was subsequently supplied; the live acceptance below supersedes that initial limitation. Byte-preserving decoding prevents unrelated binary TXT values from matching an ACME challenge. The hook refuses changes without explicit wildcard routing and stores backups outside source.

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

The cPanel endpoint is reachable over verified HTTPS. The supplied account
username authenticated, and the token remains outside the repository with
mode 0600. No additional DNS-account or registrar access is currently required.

After DNS access is verified: rehearse wildcard issuance/renewal, complete the
production isolation migration and rollback, enable the dedicated signed Stripe
webhook against the migrated runtime, and run the remaining public/fleet
acceptance checks before merging the stable release. Production registration's
source-SHA guard must not be bypassed by changing metadata alone. No card was
charged, no credential was rotated, and native Windows work remains a separate
release lane.

## Final Browser and Migration Continuation

Two strict browser repeats exposed additional defects rather than being counted
as passes. The first recorded Vite WebSocket reconnect failures during managed
Preview restarts. Removing the HTML client tag was insufficient because Vite's
CSS/module helpers import it again. The pinned Vite client now retains those
helpers without starting its unmanaged HMR connection; generated application
WebSockets and isolated-origin asset paths are unchanged. The next repeat found
concurrent snapshot readers returning a false 409. Per-session serialization and
bounded retries now preserve complete, current snapshots without letting an
aborted queued reader unlock readers ahead of it.

Readiness now makes a bounded request to the configured runtime and verifies
its protocol and version. An actual mixed-version process fixture returned 503
against the original runtime and 200 against the candidate. Liveness remains a
cheap, independent check. This is not yet full same-version revision enforcement.

- Alpha passed real FREE/Luna generation, follow-up and history restore in 90.1 seconds, with no fatal browser/network errors.
- The assigned Cloudflare canary passed the same flow in 93.7 seconds. A subsequent 159.4-second run also published the generated app, loaded assets/deep links and restored history. The published Calendar accepted an event and retained it after reload. Previous-deployment rollback and candidate restoration both passed health checks.
- The production copy ran under the non-root account on separate ports with trusted wildcard TLS. Normal onboarding, first Preview, follow-up and saved-history restore passed in 96.1 seconds. This was a preflight, not a production traffic switch.
- The repaired automatic-recovery E2E uses Agent Mode, normal onboarding and cross-origin frame locators. An injected source syntax error reached the copied runtime, triggered repair and returned to the exact previous source and visible Preview. The compact composer remained visible; no unexpected browser errors occurred.
- An injected initial chat failure resumed automatically through the real FREE provider. Preview interaction, Code selection, follow-up, navigation, reload and intentional runtime restart passed, followed by 30 cold reloads with no unexpected browser errors. Source snapshot size was 43,369 bytes, read in 22 ms; runtime high-water RSS was 89,416 KiB. These are fixture measurements, not fleet-wide performance claims.
- A separate immediate-stop test reproduced `stopped: true` while the attached Podman client still ran. Stop now waits for actual client close and successful container removal, retries the creation race within a deadline and permits retry after a failed stop. Three real immediate-stop checks and five graceful shutdowns passed. The initial failing fixture also had a cleanup working-directory error; that harness error was fixed separately, and its owned container was removed.

The production migration's first plain archive copy expanded shared dependency
storage and was stopped after 488 seconds; original services were restored.
Hard-link-preserving online pre-stage then completed. A custom full-tree hash
experiment exceeded its time/memory budget and was discarded, not shipped.
Final verification checks every source/private-data path and byte while excluding
rebuildable `node_modules` caches, which were pre-staged separately. The two
owned candidate projects were archived, source and private records reconciled,
and checksums verified while source services were stopped. Original services
restarted after 2.076 seconds. No original workspace, database password or
customer record was deleted or rotated.

The prepared target is `/srv/bolt-gives-isolated`, with
`/srv/bolt-gives-isolated-workspaces` and a protected
`/etc/bolt-gives/production-isolated.env`. The original deployment remains active.
The preflight services are stopped and its temporary route explicitly reports
maintenance. Do not rerun the fresh-target migration or overwrite these trees.
Before promotion, reconcile any subsequent production writes and rehearse the
service/routing rollback. Automatic fleet refresh remains disabled on candidates.

The earlier B15 hook failure is still untraced. Inspecting its original command
history showed the build had completed before that failed run; concurrent build
replacement is not a demonstrated explanation. The improved diagnostic harness
also captures modules and HTTP failures from isolated Preview origins. Passing
soaks are not represented as a deterministic cause or resolution of B15.

Public review artifact: [generated Calendar](https://release-app-1789412097975.instances.bolt.gives).
The assigned canary is an owned test fixture, not a customer-fleet rollout.

Private evidence: `output/release-20260914-alpha-snapshot-fixed.log`,
`output/release-20260914-canary-publish-final.log`,
`output/release-20260914-canary-rollback.log`,
`output/release-20260914-production-preflight-e2e.log`,
`output/release-20260914-production-preflight-recovery.log`,
`output/release-20260914-final-injected-recovery-soak.log`,
`output/release-20260914-early-stop-before.log`,
`output/release-20260914-shutdown-final-eight.log`, and
`output/release-20260914-production-final-source-copy.log`.

## Intentional-Exit Monitor Regression

The next alpha and Cloudflare journeys completed Preview, follow-up and history
restore, but an independent container audit found the alpha fixture running
again after HTTP 200 cleanup. A direct DELETE reproduced `starting` after 500 ms
and `ready` after two seconds. The Podman stop itself had succeeded: the Preview
liveness monitor queued recovery while `terminateSessionProcesses` awaited the
child's close. This is distinct from the earlier stop-before-creation race.

Shutdown now marks every handle before awaiting any close. The monitor ignores
intentional and superseded exits while retaining current unexpected-exit
recovery. Two regressions cover those cases; the full suite passes 1,450 tests,
with nine skipped. Calendar cleanup now requires five seconds of idle/no-Preview
state after a JSON-confirmed successful stop. Earlier generation passes remain
valid for generation, but are not claimed as verified shutdown acceptance.

Private evidence: `output/release-20260914-intentional-stop-before.log`,
`output/release-20260914-intentional-stop-tests-fixed.log`, and
`output/release-20260914-stop-monitor-full-tests.log`. Live acceptance of this
additional fix must be recorded before promotion.
