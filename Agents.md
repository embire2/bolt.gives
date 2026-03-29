# Agents.md

## Mission

Ship `v1.0.3` as a commentary-first release where agent work is continuously visible, understandable, and verifiable in real time.

Secondary objective: lay architecture foundations for `v1.0.4` client-hosted private instances with Teams collaboration.

## Active Release Line

- Stable: `v1.0.3`
- In progress: `v1.0.4`
- Next: `v1.0.4` (client-hosted + Teams)

## Operating Principles

- No hidden behavior: if the agent acts, users must see it.
- No false success: completion messaging must match real execution results.
- Keep fixes minimal, explicit, and test-backed.
- Prefer clarity over cleverness in protocol and UI contracts.

## Branching and Deployment

- Primary branch: `main`
- Optional soak branch: `alpha`
- Live validation target: `https://alpha1.bolt.gives`

If changes are risky:
1. Land on `alpha`
2. Validate E2E on `alpha1`
3. Fast-forward/merge into `main`

## v1.0.3 Execution Priorities

### P0 (Must ship)
- [x] Commentary phase model and dedicated commentary cards
- [x] Strict formatting contract for live updates (`Key changes`, `Next`)
- [x] Sticky execution footer with model/step/elapsed/actions/recovery state
- [x] First-class checkpoint events in timeline
- [x] Honesty guardrails to prevent optimistic success reporting

### P1 (Ship if stable)
- [ ] Commentary verbosity controls by autonomy mode
- [ ] Export commentary transcript with phases
- [ ] Timeline expand/collapse for dense runs

## Delivery Workflow (Mandatory)

1. Reproduce and document current behavior.
2. Implement smallest safe change.
3. Add regression tests near changed code.
4. Run local validation:
   - `pnpm run typecheck`
   - `pnpm run lint`
   - `pnpm test`
5. Run targeted E2E smoke for core-path changes.
6. Commit with Conventional Commits and push.

## E2E Requirements for Core Flow Changes

When touching chat streaming, tool execution, action runner, or timeline:
- Test with at least one strict provider path (OpenAI Codex class model).
- Test with at least one standard provider path.
- Verify:
  - commentary-first-event latency
  - checkpoint visibility
  - truthful success/failure narration
  - preview/app outcome for real coding tasks

## Documentation Rules

For behavior changes, update in same change set:
- `CHANGELOG.md`
- `README.md` (if setup/usage changed)
- `v1.0.3.md` (status + checkboxes + commit refs)

Checkbox status format:
- `[x]` complete
- `[~]` in progress
- `[ ]` not started

## Security and Data Handling

- Never commit secrets, keys, session tokens, cookies, or sensitive logs.
- Keep secrets in environment variables or `.env.local` only.
- Redact sensitive values from screenshots, logs, and commit text.

## v1.0.4 Foundation Backlog (Do Not Skip)

- [ ] Instance isolation model (compute + storage + config boundaries)
- [ ] Client-hosted deployment bundle and runbook
- [ ] Teams RBAC model (owner/admin/dev/viewer)
- [ ] Shared workspace concurrency and conflict handling
- [ ] Audit/event log model for compliance-grade traceability

## Definition of Done

A task is complete only when:
- behavior is correct and test-covered,
- local checks pass,
- required E2E passes,
- docs are updated,
- and no adjacent critical path regression is introduced.
