# Browser Failure Recovery: 15 September 2026

## Reproduction and Fix

An owned, real FREE-generated Calendar on alpha was modified with a top-level
React `useState` call. Chromium raised `Cannot read properties of null (reading
'useState')` in the generated application. Four concurrent successful document
requests reproduced a platform defect: runtime state became Ready, queued repair
was cancelled, and the broken source remained on disk.

`recordPreviewResponse` protected errors only in the `error` state, not while
`repairing`. A late HTTP 200 is not evidence that browser JavaScript succeeded.
The diagnostics transition now preserves outstanding browser/compiler failures
across document responses, queued probes and autostart completions. Explicit
verified source restoration still clears the failure. Transient lifecycle noise
can still resolve normally.

Five regression tests cover both error states, late probes, late autostart and
valid lifecycle recovery. The identical isolated Chromium reproduction now
restores the exact original source, reports recovery as restored and then Ready.

The full Agent Mode acceptance test also passed normal onboarding, real FREE/Luna
generation, first Preview, the injected hook error with late document responses,
automatic source restoration and visible Preview with the composer retained.
Its chat stream completed normally; the injected error was the only browser
exception. This is injected-failure evidence using a real generated application,
not an assertion that the provider naturally generated this invalid hook.

## Historical Evidence Boundary

The original 13 September event did not retain its stack/frame. Its precise
model-generated cause cannot be reconstructed. A separate import-identity probe
found no duplicate React instance, so no speculative React deduplication change
was made. The same error class and the platform's false-success recovery race
are now deterministically reproduced and covered. Ordinary generation,
follow-up, saved history and publishing remain separate acceptance checks.
