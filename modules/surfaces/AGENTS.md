# Surfaces Module

Own Remix route adapters, shared application chrome, Cloudflare integration, and desktop/mobile composition.

- Keep route modules thin; business behavior belongs in a feature module.
- Preserve public URLs, route IDs, build output paths, and lazy-loading boundaries.
- Do not expose imports from server-only feature subpaths to browser components.
- Run `pnpm --filter @bolt/surfaces typecheck`, `lint`, and `test` before integration checks.
