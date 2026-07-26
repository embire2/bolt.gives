# Core Module

Own shared contracts, low-level utilities, security primitives, configuration, logging, and version metadata.

- Do not import another `@bolt/*` module.
- Keep browser/server-neutral contracts free of runtime side effects.
- Put cross-module wire types here only when at least two feature modules use them.
- Run `pnpm --filter @bolt/core typecheck`, `lint`, and `test` before integration checks.
