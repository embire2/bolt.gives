# Alpha Isolation and Billing Acceptance

This is staging evidence, not a stable release or a fleet rollout.

## Public Browser Journey

On 13 September, a normal Chromium browser registered an owned test profile on
`https://alpha1.bolt.gives`, submitted a real FREE ChatGPT-Luna request through
MagnetAPI, loaded the generated Calendar Preview, changed that same application
with a follow-up, navigated away, and restored its saved source, messages and
runtime identity. Both chat requests returned 200. The final repeat completed in
229 seconds with no unexpected console or network errors. Canceled navigation
requests remain recorded separately rather than being treated as HTTP failures.

The Preview used a project-specific HTTPS hostname and a publicly trusted
certificate. Both alpha services and generated project containers run non-root.
Original deployed source, workspace and private database records remain intact
as rollback targets. Existing project database credentials authenticated through
the private container bridge without changing database users or passwords.

Earlier failures are retained in local evidence. They exposed a public gateway
self-proxy loop, unauthenticated server-side Preview verification, a legacy
database lookup using the wrong workspace root, and a command error attempting
to send HTTP headers after streaming had begun. Each now has regression coverage.
The history fixture also needed the current IndexedDB version and full-message
assertions instead of assertions against truncated diagnostic output.

## Billing

Normal alpha onboarding and the pricing Upgrade button opened a real Stripe
Checkout for USD 5 per calendar month. No card details were entered and no
payment was submitted. The owned unpaid session was expired after verification.
The public webhook rejected unsigned and altered requests and accepted a signed
no-op event and its replay. A separate disposable PostgreSQL fixture verified
paid activation, concurrent duplicate delivery, nonadjacent replay, stale
cancellation and monotonic renewal periods without touching customer billing.

The new dedicated production webhook remains disabled until the production
runtime has the signing secret and the coordinated rollout is complete. The
operator will perform the actual paid acceptance test; an unpaid Checkout is
not proof of a completed payment.

## Canary Findings

A real assigned Pages canary was created through the staging registration form.
Its repeated journeys exposed two additional deployment boundaries: Wrangler
discarded plain-text runtime routing bindings, and a partial deployment sync left
the Cloudflare entry file stale. Protected routing bindings now survive deploy,
and alpha code sync includes every tracked file. A stale-port redirect also lost
the instance's host-only login cookie at the central host; the gateway now keeps
that redirect on the authenticated instance.

Setting the automatic refresh interval to zero previously left startup rollout
enabled. That unexpectedly created six staging-branch deployments on older test
assignments. Alpha was stopped, all six branch deployments were removed, and
their configuration and assignments were restored. Cloudflare confirmed that
none of those six canonical production deployments changed. A regression now
requires zero interval to disable both startup and periodic refresh.

The public private-admin runtime path was confirmed reachable and immediately
blocked in Caddy. The application gateway has matching regression coverage;
the normal admin page remains reachable. A full-suite repeat passed 1,367 tests
with nine skipped before the subsequent Calendar interaction and redirect fixes.
Calendar interaction failed against the original template and then passed,
including creating an event, reload persistence and mini-calendar geometry.

The subsequent trace found the remaining repeated-repair cause: scanning an
escaped JSON follow-up with two quoted labels invented three additional UI
requirements from the surrounding sentence. Decoding the envelope first fixes
the reproduced regression. A separate fix normalizes streamed Preview-ready
events before callbacks can navigate to the unauthenticated central hostname.

The final normal Chromium canary journey passed generation, follow-up, saved
history and public publishing in 127 seconds. Both chat streams completed with
one artifact each, no recovery continuation and no manual intervention. The
fixture now fails on chat cancellation and all browser exceptions, rather than
silently treating canceled chat as benign. Public root/deep-link checks passed;
event creation and reload persistence were also exercised on the published app.
Earlier failures and their raw traces remain retained privately.

The canary was rolled back to its previous healthy Cloudflare deployment and
then restored to the candidate; canonical deployment identities and HTTP 200
health were verified after each operation. This tests operator rollback on the
owned canary, not automatic production-runtime rollback. The final full suite
passed 1,371 tests with nine skipped; typecheck, lint, strict boundaries and the
production build passed. The unsafe legacy Linux update script now delegates
to the guarded installer, with an executable quoted-path/options regression.

Both disposable canary projects and their assignment/profile records were
removed after acceptance, together with the two superseded public fixtures.
The [final static Calendar demo](https://release-app-1789323614575.instances.bolt.gives)
is intentionally retained for review. All test Preview containers were stopped;
the private evidence and source snapshots remain available to operators.

## Remaining Release Work

- Complete production migration, rollback and fleet health checks.
- Production registration currently refuses rollouts because its deployed `ca133420` source does not match `origin/main`. The difference includes application/runtime changes, not just documentation. Do not bypass the guard by changing `BOLT_RELEASE_SHA` without deploying and verifying the matching source.
- Configure scalable wildcard Preview TLS with the authoritative DNS operator. The Cloudflare account configured here is not authoritative for bolt.gives; successful per-project staging certificates are not a fleet-scale certificate plan.
- Keep the earlier intermittent browser hook crash under investigation; passing repeats alone are not a deterministic root-cause proof.
- The optional remote SSH workspace node currently times out; rootless hosted Preview does not depend on it.
- Native Windows rewrite and Windows/WSL reboot-resume are separate, unverified acceptance work, not certified by Linux browser tests.

Private local evidence is under `output/playwright/alpha-isolated-calendar-6`,
`output/playwright/stripe-checkout`, `output/playwright/release-canonical-preview-3`
and `output/playwright/managed-canary-quoted-followup`. Canary rollback evidence
is in `output/canary-rollback-acceptance.log`.
Do not commit browser session exports or customer/operator records.
