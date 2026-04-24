# Cloudflare Managed Instances (Experimental Blueprint)

Status: the app/runtime control plane is implemented and live in the `v3.0.9` release line. Public trial requests now require profile registration first, the private operator surface at `https://admin.bolt.gives` tracks registered clients, assigned instances, and operator actions, and active managed instances are refreshed from the current release SHA by the runtime rollout controller. Live provisioning still requires operator-side Cloudflare credentials on the runtime service.

This document describes the **real implementation path** for an experimental bolt.gives managed-instance service on Cloudflare.

## Goal

Allow a client to request a single managed bolt.gives workspace that:

- runs on Cloudflare
- is isolated per client
- is automatically updated from the `main` branch
- cannot be duplicated by the same client

## Platform choice

There are two different platform paths:

### Free experimental path

This is the only technically honest **no-cost** path:

- shared Cloudflare Worker / Pages / Workers Builds control plane
- shared runtime capacity
- one client / one managed workspace record
- automatic updates from `main`

### Future dedicated Pro path

The correct Cloudflare product for a dedicated `6 GiB` Node runtime is **Cloudflare Containers**, not Pages alone.

Managed instance sizing:

- preferred preset: `standard-2`
- effective resources: `1 vCPU`, `6 GiB` memory, `12 GB` disk

Control plane:

- Cloudflare Worker / Workers Builds
- D1 for tenancy and rollout state
- Durable Objects for provisioning locks and serialized rollout work

Reality check:

- Cloudflare Workers Free is limited to `128 MB` runtime memory.
- Workers Builds Free provides `8 GB` build memory, but that is build-time only.
- Cloudflare Containers `standard-2` is billed and does not have a free tier.

That means:

- **Free experimental** cannot be a dedicated `6 GiB` container per client.
- A dedicated `6 GiB` container belongs to the future **Pro** path, or to a subsidized operator-funded rollout.

## Required guarantees

1. One client / one instance

- A client may hold only one active managed instance.
- If the same client requests another instance, the API must return the existing instance instead of provisioning a new one.

2. Automatic provisioning

- A spawn request must be idempotent.
- The system must create the instance, register its route, and persist its metadata without operator hand-editing.

3. Automatic updates from git

- `main` is the source of truth.
- A git push to `main` rebuilds the control plane and the managed instance image.
- The rollout controller updates all active managed workspaces/instances to the new release SHA.

4. Transparent status

- Users must be able to see:
  - provisioning
  - active
  - updating
  - failed
  - suspended

## Proposed architecture

### 1. Spawn API / Runtime control plane

Shipped public/product surfaces:

- `/managed-instances`
- `POST /api/managed-instances/spawn`
- `GET /api/managed-instances/session`
- `POST /api/managed-instances/:slug/refresh`
- `POST /api/managed-instances/:slug/suspend`

Runtime control endpoints:

- `GET /runtime/managed-instances/config`
- `GET /runtime/managed-instances/session`
- `POST /runtime/managed-instances/spawn`
- `POST /runtime/managed-instances/:slug/refresh`
- `POST /runtime/managed-instances/:slug/suspend`

Responsibilities:

- validate caller identity
- enforce one-client / one-instance policy
- return the existing instance if one already exists
- enqueue new provisioning if the client has no instance yet

### 2. D1 tenancy registry

Future hardened path:

Use D1 as the authoritative registry for:

- client identity
- instance slug
- container id
- current git SHA
- status
- rollout history
- audit trail

The schema lives in:

- `docs/cloudflare-managed-instances.sql`

### 3. Durable Object provisioning lock

Provisioning must be serialized per client.

Use a Durable Object keyed by client identity so that:

- duplicate spawn requests do not create duplicate instances
- concurrent retries collapse into a single in-flight job
- rollout work for one instance stays ordered

### 4. Runtime

Free experimental:

- shared runtime services on Workers / Pages
- no guaranteed dedicated `6 GiB` runtime per client

Future Pro:

- each dedicated instance runs as a Cloudflare Container:
- Node runtime
- `standard-2` instance type
- isolated workspace/storage mount strategy
- versioned image tag tied to git SHA

### 5. Routing

Each client instance receives a deterministic subdomain, for example:

- `client-slug.instances.bolt.gives`

The control plane keeps route assignment in D1 and only exposes healthy instances.

### 6. Git-driven rollout controller

On every push to `main`:

- Cloudflare Git integration / Workers Builds rebuilds the control plane
- the container image is rebuilt and tagged with the new git SHA
- a rollout job enumerates active instances
- each active instance is updated to the new SHA
- rollout status is written to D1

## Identity model

One client / one instance requires a stable client key.

Recommended options:

- GitHub identity
- email magic-link identity
- billing account identity

Persist a normalized `client_key` and enforce uniqueness in D1.

Do not use raw email addresses as public identifiers.
Store a normalized hash for uniqueness checks where possible.

## Pricing / commercial positioning

Initial positioning:

- **Free experimental service**
- limited availability
- one managed workspace per client
- shared Cloudflare runtime, no guaranteed dedicated `6 GiB` container

If stable:

- keep a Free plan
- add a **Pro plan from `$12/month`**
- unlock more tools, higher limits, stronger support, and the dedicated `6 GiB` container path

This pricing is a product intention, not a billing implementation yet.

## Rollout phases

### v3.0.2

- document the architecture
- add tenancy schema
- align README / roadmap / changelog
- keep `main` as the update source of truth
- separate the free experimental shared-runtime path from the future dedicated `6 GiB` Pro path

### v3.0.7

- implement the spawn API / runtime control plane
- implement server-local managed-instance registry and event history
- enforce one-client / one-instance on claimed identity plus browser session ownership
- implement the free experimental shared-runtime control plane first
- implement 15-day expiry metadata
- implement chosen subdomain handling
- implement current-build rollout synchronization logic

### v3.0.9+

- replace the server-local registry with D1 / durable locking for production scale
- live-enable Cloudflare provisioning everywhere operator credentials exist
- add operator dashboards and health checks
- add health-verified rollback and stronger rollout observability

## Risks to solve before public launch

1. Abuse control

- require a real client identity
- rate-limit spawn attempts
- reject duplicate active instances

2. Rollout safety

- updates must be health-checked before marking an instance current
- failed rollouts must support rollback to the previous SHA

3. Cost control

- free experimental instances must scale to zero when idle
- idle/suspended instance policy must be explicit

4. Observability

- every instance needs logs, rollout state, and health events
- operators need a single place to inspect failures

## Success criteria

- A client can request an instance and receive the same instance on retries.
- No client can hold more than one active managed instance.
- A push to `main` rolls out to all active instances automatically.
- Failed rollouts are visible and recoverable.
- The service remains operator-manageable without manual per-client hand work.
