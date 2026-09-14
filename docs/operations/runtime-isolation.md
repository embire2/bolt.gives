# Runtime Isolation Rollout

This describes the **unreleased** isolation implementation after v4.1.0-beta.1.
Alpha and the owned Cloudflare canary have passed live isolation/generation
acceptance; production and customer fleet migration remain pending. See the
[current evidence](../quality/2026-09-13-alpha-acceptance.md), not older checkpoint
statements, for the latest validated scope.

## Boundaries

- Generated install, build, package repair, shell and Preview commands use one project mount in a rootless Podman container. The image filesystem is read-only; capabilities are dropped; CPU, RAM and process counts are limited. Only the assigned Preview port is published, on host loopback.
- The launcher rejects root execution in local mode. It also rejects unowned or symlinked container mounts rather than changing customer file ownership implicitly.
- Operator-data directory names cannot be used as runtime session IDs.
- Authenticated platform Preview URLs redirect to a project-specific HTTPS origin. A short-lived signed bootstrap becomes an HTTP-only, Secure, host-only, partitioned cookie. The bootstrap token is removed before application resources load.
- Generated responses cannot set parent-domain or platform cookies or opt into credentialed cross-project CORS. The gateway rejects another project's capability, platform runtime routes and cross-origin requests.
- The generated browser can report up to three bounded errors per minute through its own capability. It receives only project-scoped readiness, not platform logs, credentials or control-plane APIs.

## Runner Preparation

Use a dedicated account with subordinate UID/GID ranges, a private home, lingering user services and cgroup v2 delegation for CPU, memory and PIDs. The tested runner uses Podman, slirp4netns, uidmap, fuse-overlayfs and catatonit on Ubuntu 22.04. Do not grant the account unrestricted sudo or mount its container store/socket into projects.

Build `modules/runtime/Containerfile.project` as that account. Record the immutable `sha256:...` image ID, not its mutable local tag. Provisioning must verify the configured user's `HOME`, `XDG_RUNTIME_DIR` and user bus; inheriting root's environment breaks rootless execution.

Configure the protected service environment:

```dotenv
BOLT_PROJECT_EXECUTION_MODE=podman
BOLT_PROJECT_RUNNER_UID=<non-root-uid>
BOLT_PROJECT_RUNNER_GID=<non-root-gid>
BOLT_PROJECT_RUNNER_HOME=<private-runner-home>
BOLT_PROJECT_CONTAINER_IMAGE=sha256:<local-image-id>
BOLT_PREVIEW_ORIGIN_TEMPLATE=https://{id}.<dedicated-preview-domain>
BOLT_PREVIEW_SIGNING_SECRET=<independent-random-secret-at-least-32-characters>
```

Keep the signing secret stable across restarts. Neither it nor provider credentials belong in generated projects, public metadata or browser bundles. Do not log bootstrap query strings.

The runtime owns container cleanup after the attached process closes. Do not add
Podman's `--rm` back to the launcher: on the tested Ubuntu Podman version it races
exit-status retrieval during stop and produces exit 127. Normal stop sends
SIGTERM with a five-second forced-stop deadline, allowing applications to flush
state. `node scripts/e2e-project-shutdown.mjs` exercises five real shutdowns with
the same protected runner configuration as the isolation tests.

## cPanel Certificate Hook

`scripts/preview-dns-challenge.mjs` is an operator-only DNS-01 hook, not a public
runtime endpoint. Store its configuration outside the checkout in a root-owned
mode-0600 file without symlink ancestors. See the commented cPanel variables in
`.env.example`; set `BOLT_CPANEL_DNS_ENV_FILE` to that file's absolute path.
The API token requires its owning cPanel username, not the server's SSH username.

Run `node scripts/preview-dns-challenge.mjs check` before requesting a certificate.
This reads the configured zone and verifies its SOA without changing DNS. The
`auth` and `cleanup` modes read Certbot's `CERTBOT_DOMAIN` and
`CERTBOT_VALIDATION` variables. Only `_acme-challenge` TXT records for the exact
configured Preview namespaces are permitted. Existing A/MX records and other
challenge values are left alone; a delegated CNAME causes an explicit refusal.
Every attempted mutation gets a mode-0600 zone backup beside the configuration.
Authentication waits up to ten minutes for authoritative/public TXT visibility.

Wire these commands into Certbot's manual auth/cleanup hooks only after the
read-only check succeeds. Complete a staging-CA issuance and renewal rehearsal,
then issue the public wildcard and configure certificate installation plus a
validated Caddy reload. Keep keys readable only by the certificate service and
Caddy. The hook alone is not a configured renewal service or live TLS acceptance.

## Migration Gates

1. Stop accepting writes on the staging runtime. Retain the old application tree, service configuration, workspace tree and separate database connection records as a rollback target. Do not rotate credentials or alter the originals.
   The one-time copy script refuses any existing destination/environment and requires both source units to be loaded and inactive. Do not delete an active or partial destination merely to bypass this guard; inspect it and preserve newer work before planning recovery.
2. Copy source and metadata to a new private runtime tree, verify file checksums, and assign only the new copy to the runner. Explicitly handle separately configured connection-record paths. Do not recursively chown the original workspace tree or silently drop database records.
3. Run the trusted runtime as the prepared runner against that copy. Audit control-plane operations that formerly depended on root, including service updates, CLI provisioning and Caddy domain management. Container execution working alone does not certify these operations.
4. Route platform `/runtime/*` requests through the application authorization layer, not directly from public Caddy to the runtime port. The installer now generates this route for both owner-only and hosted-profile installations.
5. Provision valid public HTTPS for the dedicated Preview namespace and route only that namespace to the capability gateway. Keep the runtime listener private. Local tests use an isolated self-signed TLS fixture; that is not public certificate or DNS acceptance.
6. Run the commands below, then verify existing projects, browser-only error recovery, WebSockets, database connections, published applications, and a disposable assigned Cloudflare instance. Exercise rollback before promoting the same build to production.

```bash
pnpm e2e:runtime-isolation
pnpm e2e:isolated-generation
BOLT_E2E_STREAM_FAILURE=1 pnpm e2e:isolated-generation
BOLT_E2E_RELOAD_REPEATS=20 pnpm e2e:isolated-generation
BOLT_E2E_HOOK_REPLAY=1 pnpm e2e:isolated-generation
```

These require the runner configuration above. Real generation additionally reads `MAGNET_API_KEY` from the ignored operator `.env.local`. Hook replay instead uses a simulated upstream, does not read that credential, and is not a live-provider acceptance pass. Reports use private `output/playwright/` fixtures; no live customer project is overwritten. Run unit tests as a regular user: the generated-command boundary intentionally rejects root, including root-invoked package-manager fixtures.

Do not promote the release until the remaining gates in `ROADMAP.md` are closed. A successful local prompt/Preview journey does not certify live migration, billing, or the independent native Windows release.
