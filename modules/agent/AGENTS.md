# Agent Module

Own model providers, prompts, context selection, project memory, streaming, tools, continuation, and recovery.

- Depend only on `@bolt/core`; use injected ports for project and runtime access.
- Keep provider-funded credentials in server-only code.
- Preserve strict tool schemas and the existing SSE event contract.
- Run `pnpm --filter @bolt/agent typecheck`, `lint`, and `test` before integration checks.
