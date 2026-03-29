# work.md

## Current Verdict (2026-03-22)

`bolt.gives` is now working on the validated core path that matters most:

- local release gates pass
- live `alpha1.bolt.gives` passed a real browser E2E using OpenAI `gpt-5.4`
- live `ahmad.bolt.gives` passed a smoke run after deployment
- the app can now scaffold, continue past the starter, run the preview, and keep the requested app visible in the verified path

This file now tracks the **remaining work** needed so the platform is broadly reliable, lighter on the browser, and ready for the next release line.

---

## What Passed For v3.0.0

- `pnpm run typecheck`
- `pnpm run lint`
- `pnpm test`
- `pnpm run build`
- local dev smoke with occupied default ports
- live browser E2E on `https://alpha1.bolt.gives`
- live smoke on `https://ahmad.bolt.gives`

Validated live scenario:
- prompt: build a React doctor appointment scheduling site
- provider/model: OpenAI `gpt-5.4`
- result: preview reached the requested app instead of stopping at the fallback starter

---

## Remaining To-Dos

## P0: Next Reliability Work

- [ ] **Finish server-first execution offload.**
  - Current state:
    - the app works on the validated path, but runtime execution is still too browser-heavy.
  - Evidence:
    - `app/lib/webcontainer/index.ts`
    - `app/components/chat/Chat.client.tsx`
    - `app/components/workbench/Workbench.client.tsx`
  - Required result:
    - shell execution, preview orchestration, and long-running build work should move to the server wherever possible.

- [ ] **Reduce main client bundle weight.**
  - Current state:
    - the build passes, but several client chunks are still too large.
  - Evidence from the production build:
    - `build/client/assets/Chat.client-*.js` about 2.3 MB
    - `build/client/assets/markdown-*.js` about 1.4 MB
    - multiple language/runtime chunks well above the warning threshold
  - Required result:
    - split heavy chat/runtime/editor code and reduce what loads on first paint.

- [ ] **Expand live E2E coverage beyond the single validated OpenAI path.**
  - Current state:
    - OpenAI `gpt-5.4` is validated live.
  - Required result:
    - add repeatable live smoke coverage for:
      - OpenAI `gpt-5.2-codex`
      - OpenRouter-backed flows
      - one local-provider path where configured

- [ ] **Harden preview verification for more app types.**
  - Current state:
    - the current verification is strong enough for the validated appointment-site path.
  - Required result:
    - add stronger preview assertions for:
      - starter placeholder detection
      - route-based apps
      - apps with delayed hydration
      - multi-step install/start flows

- [ ] **Improve failure reporting in the UI feed.**
  - Current state:
    - failures are better surfaced than before, but some states are still too raw.
  - Required result:
    - every failed action should consistently show:
      - command
      - exit code
      - meaningful stderr
      - recovery decision

## P1: Performance And UX Follow-up

- [ ] **Virtualize and trim the technical feed further for long runs.**
  - Reduce repaint pressure during projects with many events.

- [ ] **Code-split large language/editor payloads.**
  - Avoid loading large code language packs until needed.

- [ ] **Keep commentary plain-English by default.**
  - The system should continue favoring concise English status updates instead of raw internal jargon.

- [ ] **Add release automation for live checks.**
  - Automate:
    - typecheck
    - lint
    - tests
    - build
    - version check on live domains
    - one real browser E2E against the release domain

## P2: Repo Hygiene

- [ ] **Clean temp artifacts and harden ignore rules.**
  - Current working tree still produces local debug artifacts such as Playwright output and temporary scripts.

- [ ] **Restore GitHub push automation for this shell environment.**
  - Current blocker:
    - the release commit is local, but this shell currently lacks valid GitHub push credentials.

---

## Honest Summary

The app is no longer in the state where I would say "it does not work at all."

The honest position now is:

- **The validated core path works.**
- **The product is still heavier than it should be on the client.**
- **Broader provider and workload coverage still needs more live verification.**

That makes `v3.0.0` a real runtime-reliability reset, not the end of the stabilization work.
