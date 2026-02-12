# bolt.gives v1.0.0

bolt.gives is a collaborative, open-source AI coding workspace based on `stackblitz-labs/bolt.diy`.

It combines:
- A browser-based Node.js dev environment (StackBlitz WebContainer)
- An AI-assisted editor + terminal
- Real-time collaborative editing
- Agent-style workflows (Plan/Act with checkpointed execution)

## Screenshots

Home:
![bolt.gives home](docs/screenshots/home.png)

Chat:
![bolt.gives chat](docs/screenshots/chat.png)

Plan prompt example:
![bolt.gives plan prompt](docs/screenshots/chat-plan.png)

## What The App Does

bolt.gives is a single workspace where you can:
- Chat with an LLM and apply changes as diffs/files inside the project
- Run commands in an integrated terminal with incremental progress events
- Collaborate with multiple people on the same file (live cursors/edits)
- Save/resume/share sessions (optional Supabase-backed storage)
- Deploy generated apps (wizard-driven configuration)

## Key Features

- Multi-provider LLM support (cloud + local)
- Real-time collaborative editing (Yjs + `y-websocket`)
- Interactive step runner with structured events (`step-start`, `stdout`, `stderr`, `step-end`, `complete`)
- Plan/Act workflow with checkpoints (continue/stop/revert)
- Session save/resume/share (Supabase REST API)
- Model orchestrator (auto-selects an efficient model and surfaces the decision in chat metadata)
- Performance monitor (CPU/RAM sampling + token usage counter)
- Deployment wizard (generates provider workflows/config)
- Plugin manager + marketplace registry support

## Quickstart (Local Development)

Prereqs:
- Node.js `>= 18.18.0`
- `pnpm`

Setup:
```bash
pnpm install
cp .env.example .env.local
```

Run dev (starts the app and the collaboration server):
```bash
pnpm run dev
```

Defaults:
- App: `http://localhost:5173`
- Collaboration server: `ws://localhost:1234`

## Real-Time Collaboration

The editor uses Yjs and connects to a local `y-websocket` compatible server.

- Server script: `scripts/collaboration-server.mjs`
- Default WS URL: `ws://localhost:1234`
- Default persistence directory: `.collab-docs` (override with `COLLAB_PERSIST_DIR`)

Client settings (stored in browser localStorage):
- `bolt_collab_enabled` (defaults to enabled when unset)
- `bolt_collab_server_url` (defaults to `ws://localhost:1234`)

## Screenshots (Reproducible)

To refresh the screenshots used in this README:
```bash
./scripts/capture-screenshots.sh
```

Outputs:
- `docs/screenshots/home.png`
- `docs/screenshots/chat.png`
- `docs/screenshots/chat-plan.png`

## Validation Gate

Before pushing changes:
```bash
pnpm run typecheck
pnpm run lint
pnpm test
```

## Roadmap

See `ROADMAP.md`.

## Contributing (Fork + PR Workflow)

We follow the standard GitHub workflow used by bolt.diy and similar StackBlitz OSS projects.

1. Fork this repository on GitHub.
2. Clone your fork locally:
   ```bash
   git clone https://github.com/<your-username>/bolt.gives.git
   cd bolt.gives
   ```
3. Add the upstream remote:
   ```bash
   git remote add upstream https://github.com/embire2/bolt.gives.git
   git fetch upstream
   ```
4. Create a branch off `main`:
   ```bash
   git checkout -b feat/my-change
   ```
5. Make changes and run the validation gate:
   - `pnpm run typecheck`
   - `pnpm run lint`
   - `pnpm test`
6. Push your branch to your fork and open a Pull Request targeting `embire2/bolt.gives:main`.

PR expectations:
- Keep PRs focused (one feature/bugfix per PR).
- Explain what changed, why, and how reviewers can verify it.
- Do not commit secrets. Put keys in `.env.local` (gitignored).

## License

MIT

