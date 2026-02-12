# Roadmap

This roadmap describes what we plan to ship next after `v1.0.0`.

## v1.0.1 (Next)

### Collaboration
- Presence UI: show connected collaborators per file and their cursor/selection.
- Server hardening: better disk persistence recovery and clearer health logs.
- File switching ergonomics: smoother binding teardown/rebind when changing files quickly.

### Plan/Act Workflows
- Plan UI: show steps as a first-class list in the chat panel with per-step approval.
- Checkpoints with diffs: show a diff summary at each checkpoint and allow revert/continue with one click.
- Better step streaming: render stdout/stderr incrementally with timestamps and step duration.

### Sessions (Supabase)
- Session list modal: searchable history with preview and restore.
- Share link UX: show a share preview and add safer error handling for missing/partial payload fields.
- Backward compatibility: migrate missing fields and tolerate older payload shapes.

### Test And Security
- "Test & Scan" button: run lint + tests and surface results in the UI.
- Vulnerability scanning: integrate a scanner (Snyk or CodeQL) with actionable output.
- Jest stubs: improve stub generation heuristics and ensure stubs are created only when appropriate.

### Performance
- More accurate token accounting per provider response shape.
- Configurable thresholds in UI with clearer recommendations.
- Lower overhead polling and better behavior when metrics are unavailable.

### Deployment
- Deploy trigger flow from UI with status feedback.
- Provider auth UX improvements (clear validation and error states).
- Rollback flows with safer prompts and provider-specific guidance.

### Plugin Marketplace
- Safer install story: signature/trust indicators and update/uninstall UX.
- Versioning: detect updates and allow upgrade/downgrade.
- Better error reporting for malformed registries/manifests.

## Beyond v1.0.1 (Draft)

- Multi-user session collaboration (shared sessions with comments).
- Built-in plugin authoring SDK and docs.
- Richer multi-modal: improved sketch-to-component generation and voice editing tools.

