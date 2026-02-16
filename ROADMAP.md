# Roadmap

Last updated: 2026-02-16

This roadmap tracks the plan to ship `v1.0.2` in 7 days.

## Steps towards v1.0.2 - ETA: 7 days

## Delivery Paths (P0)

1. Live Development Commentary Stream
- [ ] Stream concise step-by-step commentary while coding (`plan -> action -> verification -> next step`).
- [ ] Separate commentary from code/actions in protocol and UI.
- [ ] Keep commentary visible while work is in progress (not only at completion).

2. Agent Anti-Stall + Auto-Recovery
- [ ] Detect stuck states (repeated tool calls, no-progress loops, long inactivity/timeouts).
- [ ] Add recovery strategies (retry/backoff, summarize-and-continue, explicit recovery prompt).
- [ ] Surface recovery actions in the commentary timeline.

3. Execution Transparency Panel
- [ ] Show selected model, tool invocations, active step, elapsed time, and token/cost estimate.
- [ ] Show a short "why this action" reason for major agent steps.
- [ ] Persist per-run execution trace for review.

4. Safer Autonomy Modes
- [ ] Add explicit modes: `read-only`, `review-required`, `auto-apply-safe`, `full-auto`.
- [ ] Add per-tool approval policy controls.
- [ ] Display active autonomy mode in chat/workflow UI at all times.

5. Reliability Guardrails For Web/Tool Tasks
- [ ] Keep tool schemas compatible with strict providers (including Codex-style strict function validation).
- [ ] Add robust URL/tool input validation with clear fallback errors for users.
- [ ] Add regression tests for schema compatibility across major model families.

## Next Paths (P1)

6. Persistent Project Memory (Scoped)
- [ ] Store lightweight persistent project summaries/architecture notes between sessions.
- [ ] Use persisted memory to reduce repeated context rebuilding.

7. Sub-Agent Framework (Minimal)
- [ ] Introduce a manager/worker pattern for long-running tasks.
- [ ] Ship behind a feature flag.

## Acceptance Criteria

1. Commentary appears within 2 seconds of run start and updates at each meaningful step.
2. At least 90% of interrupted/stalled runs auto-recover or provide a clear recovery suggestion.
3. Users can switch autonomy mode before and during a run; mode is reflected in every tool action.
4. Tool/schema compatibility tests pass for strict OpenAI Codex-style models and standard chat-completions models.
5. Timeline view logs model, tools, approvals, and outcome per run.

## Success Metrics

- Reduce "agent got stuck" reports by at least 40%.
- Increase successful end-to-end task completion rate by at least 20%.
- Reduce average manual "continue" interventions per session.
- Increase user satisfaction on "I understand what the agent is doing."

## Research Sources (Playwright Browsed)

- https://forum.cursor.com/c/ideas
- https://forum.cursor.com/c/ideas/7
- https://codeium.canny.io/feature-requests
- https://news.ycombinator.com/item?id=44031432
- https://news.ycombinator.com/item?id=45534880
- https://github.com/openai/codex/issues
- https://github.com/features/copilot
- https://github.com/orgs/community/discussions/categories/copilot
- https://developers.openai.com/codex/
