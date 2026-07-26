# Project Module

Own generated-project state, files, persistence, history, Workbench, editor, actions, collaboration, and project integrations.

- Use public agent/runtime contracts rather than importing implementation internals.
- Preserve saved history, runtime identity, file snapshots, and database continuity.
- Keep editor, terminal, and heavy integration UI lazy-loaded.
- Run `pnpm --filter @bolt/project typecheck`, `lint`, and `test` before integration checks.
