# Control Plane Module

Own tenant/admin policy, managed Cloudflare instances, updates, publishing, domains, billing, mail, and audit state.

- Keep operator credentials and provider-funded secrets server-side.
- Preserve tenant, fleet, publishing, and updater HTTP contracts.
- Runtime operations must use the public runtime control contract.
- Run `pnpm --filter @bolt/control-plane typecheck`, `lint`, and `test` before integration checks.
