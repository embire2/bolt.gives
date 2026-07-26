# Runtime Module

Own hosted execution, workspace synchronization, commands, Preview lifecycle, runtime-node isolation, and browser fallback execution.

- Depend only on `@bolt/core`; accept control-plane handlers through route plugins.
- Never expose runtime-node administration credentials to browser code.
- Preserve `/runtime/*` wire formats and Preview isolation headers.
- Run `pnpm --filter @bolt/runtime typecheck`, `lint`, and `test` before integration checks.
