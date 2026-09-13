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

The Cloudflare canary has not yet completed clean generation, follow-up and
publishing acceptance. Earlier failure logs remain retained. No stable release
or completed fleet rollout is implied by creating the instance.

## Remaining Release Work

- Validate an assigned Cloudflare canary, including generation, restore and public publishing.
- Complete production migration, rollback and fleet health checks.
- Keep the earlier intermittent browser hook crash under investigation; passing repeats alone are not a deterministic root-cause proof.
- The optional remote SSH workspace node currently times out; rootless hosted Preview does not depend on it.
- Native Windows rewrite and Windows/WSL reboot-resume are separate, unverified acceptance work, not certified by Linux browser tests.

Private local evidence is under `output/playwright/alpha-isolated-calendar-6`,
`output/playwright/stripe-checkout` and `output/playwright/release-canonical-preview-3`.
Do not commit browser session exports or customer/operator records.
