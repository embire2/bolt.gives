import { describe, expect, it } from 'vitest';
import {
  buildRunContinuationPrompt,
  detectRestoredHostedRuntimeHandoffMismatch,
  extractRequiredVisibleTextLiterals,
  findMissingRequiredVisibleTextLiterals,
  shouldAllowSynthesizedRunHandoff,
  shouldApplyHostedRuntimeHandoffBeforePreviewVerification,
  shouldContinueAfterBlockedSynthesizedRunHandoff,
  shouldContinueForMissingRequiredVisibleText,
  shouldContinueHostedPreviewVerificationFailure,
  shouldContinueRunIntentAfterHostedPreviewReady,
  shouldWaitForHostedPreviewRecoverySettle,
  shouldReplayLocalRuntimeHandoff,
  shouldSkipPlannerForRecoveryPrompt,
} from '~/routes/api.chat';

describe('api.chat continuation helpers', () => {
  it('does not replay a synthesized local runtime handoff when recovery returned no Bolt actions', () => {
    expect(
      shouldReplayLocalRuntimeHandoff({
        chatMode: 'build',
        previewCheckpointObserved: false,
        hasExecutionFailures: false,
        hostedRuntimeSessionId: null,
        hasSynthesizedRunHandoff: true,
        continuationReason: 'no-bolt-actions',
      }),
    ).toBe(false);
  });

  it('still replays a synthesized local runtime handoff for preview verification gaps', () => {
    expect(
      shouldReplayLocalRuntimeHandoff({
        chatMode: 'build',
        previewCheckpointObserved: false,
        hasExecutionFailures: false,
        hostedRuntimeSessionId: null,
        hasSynthesizedRunHandoff: true,
        continuationReason: 'preview-not-verified',
      }),
    ).toBe(true);
  });

  it('does not allow synthesized handoff after an execution failure without file repairs', () => {
    expect(
      shouldAllowSynthesizedRunHandoff({
        assistantContent:
          '<boltArtifact id="runtime"><boltAction type="start">pnpm run dev</boltAction></boltArtifact>',
        latestExecutionFailure: {
          toolName: 'preview',
          command: 'pnpm run dev',
          exitCode: 1,
          stderr: 'Unexpected token',
        } as any,
      }),
    ).toBe(false);
  });

  it('allows synthesized handoff after an execution failure when the response repairs files', () => {
    expect(
      shouldAllowSynthesizedRunHandoff({
        assistantContent:
          '<boltArtifact id="repair"><boltAction type="file" filePath="src/App.jsx">export default function App(){return null}</boltAction><boltAction type="start">pnpm run dev</boltAction></boltArtifact>',
        latestExecutionFailure: {
          toolName: 'preview',
          command: 'pnpm run dev',
          exitCode: 1,
          stderr: 'Unexpected token',
        } as any,
      }),
    ).toBe(true);
  });

  it('does not allow synthesized handoff for plan-only preview recovery output', () => {
    expect(
      shouldAllowSynthesizedRunHandoff({
        assistantContent: `## Implementation Plan

1. Inspect App.jsx.
2. Add the missing default export.
3. Restart Vite.`,
        continuationReason: 'preview-not-verified',
      }),
    ).toBe(false);
  });

  it('continues instead of completing when a synthesized handoff is blocked', () => {
    expect(
      shouldContinueAfterBlockedSynthesizedRunHandoff({
        chatMode: 'build',
        previewCheckpointObserved: false,
        hasExecutionFailures: false,
        hasSynthesizedRunHandoff: true,
        allowSynthesizedRunHandoff: false,
        attempts: 1,
        maxAttempts: 5,
      }),
    ).toBe(true);
  });

  it('continues after direct hosted preview verification reports an unhealthy preview', () => {
    expect(
      shouldContinueHostedPreviewVerificationFailure({
        chatMode: 'build',
        outcome: 'error',
        attempts: 0,
        maxAttempts: 5,
      }),
    ).toBe(true);
  });

  it('does not keep a hosted chat stream open for inspection-only continuation after preview is verified', () => {
    expect(
      shouldContinueRunIntentAfterHostedPreviewReady({
        shouldContinueForRunIntent: true,
        continuationReason: 'inspection-only-shell-actions',
        previewCheckpointObserved: true,
        hostedRuntimeSessionId: 'session-123',
      }),
    ).toBe(false);
  });

  it('keeps continuing mutating follow-ups even when the existing hosted preview is verified', () => {
    expect(
      shouldContinueRunIntentAfterHostedPreviewReady({
        shouldContinueForRunIntent: true,
        continuationReason: 'no-bolt-actions',
        previewCheckpointObserved: true,
        hostedRuntimeSessionId: 'session-123',
        lastUserContent:
          'Improve the existing calendar project and add a visible agenda sidebar label without restarting from scratch.',
      }),
    ).toBe(true);
  });

  it('detects missing exact visible text requirements in follow-up workspace files', () => {
    const request =
      'Improve the existing calendar project without restarting from scratch. Add a visible agenda sidebar label containing the exact text "CAL_FUP_123".';
    const files = {
      '/home/project/src/components/Calendar.tsx': {
        type: 'file',
        content: 'export function Calendar(){ return <h1>Calendar</h1>; }',
        isBinary: false,
      },
    } as const;

    expect(extractRequiredVisibleTextLiterals(request)).toEqual(['CAL_FUP_123']);
    expect(findMissingRequiredVisibleTextLiterals({ request, files })).toEqual(['CAL_FUP_123']);
    expect(shouldContinueForMissingRequiredVisibleText({ lastUserContent: request, currentFiles: files })).toBe(true);
  });

  it('accepts exact visible text requirements once they are present in UI source files', () => {
    const request =
      'Improve the existing calendar project and add a visible agenda sidebar label containing the exact text "CAL_FUP_123".';
    const files = {
      '/home/project/src/components/Calendar.tsx': {
        type: 'file',
        content: 'export function Calendar(){ return <aside>CAL_FUP_123</aside>; }',
        isBinary: false,
      },
    } as const;

    expect(findMissingRequiredVisibleTextLiterals({ request, files })).toEqual([]);
    expect(shouldContinueForMissingRequiredVisibleText({ lastUserContent: request, currentFiles: files })).toBe(false);
  });

  it('still allows inspection-only continuation before hosted preview verification succeeds', () => {
    expect(
      shouldContinueRunIntentAfterHostedPreviewReady({
        shouldContinueForRunIntent: true,
        continuationReason: 'inspection-only-shell-actions',
        previewCheckpointObserved: false,
        hostedRuntimeSessionId: 'session-123',
      }),
    ).toBe(true);
  });

  it('applies hosted runtime handoff before verification when generated actions are runnable', () => {
    expect(
      shouldApplyHostedRuntimeHandoffBeforePreviewVerification({
        chatMode: 'build',
        previewCheckpointObserved: false,
        hasExecutionFailures: false,
        hostedRuntimeSessionId: 'session-1',
        hasSynthesizedRunHandoff: true,
        allowSynthesizedRunHandoff: true,
      }),
    ).toBe(true);
  });

  it('does not apply hosted runtime handoff before verification without a safe synthesized handoff', () => {
    expect(
      shouldApplyHostedRuntimeHandoffBeforePreviewVerification({
        chatMode: 'build',
        previewCheckpointObserved: false,
        hasExecutionFailures: false,
        hostedRuntimeSessionId: 'session-1',
        hasSynthesizedRunHandoff: true,
        allowSynthesizedRunHandoff: false,
      }),
    ).toBe(false);
    expect(
      shouldApplyHostedRuntimeHandoffBeforePreviewVerification({
        chatMode: 'build',
        previewCheckpointObserved: false,
        hasExecutionFailures: false,
        hostedRuntimeSessionId: '',
        hasSynthesizedRunHandoff: true,
        allowSynthesizedRunHandoff: true,
      }),
    ).toBe(false);
  });

  it('does not continue direct hosted preview verification after success or budget exhaustion', () => {
    expect(
      shouldContinueHostedPreviewVerificationFailure({
        chatMode: 'build',
        outcome: 'ready',
        attempts: 0,
        maxAttempts: 5,
      }),
    ).toBe(false);
    expect(
      shouldContinueHostedPreviewVerificationFailure({
        chatMode: 'build',
        outcome: 'error',
        attempts: 5,
        maxAttempts: 5,
      }),
    ).toBe(false);
  });

  it('waits for recovered hosted previews to settle before forcing another continuation pass', () => {
    expect(
      shouldWaitForHostedPreviewRecoverySettle({
        chatMode: 'build',
        previewCheckpointObserved: false,
        hasExecutionFailures: false,
        hostedRuntimeSessionId: 'session-123',
        outcome: 'timeout',
        status: {
          recovery: { state: 'restored' },
        } as any,
      }),
    ).toBe(true);
  });

  it('does not wait for recovery settling after a hosted preview is already verified', () => {
    expect(
      shouldWaitForHostedPreviewRecoverySettle({
        chatMode: 'build',
        previewCheckpointObserved: true,
        hasExecutionFailures: false,
        hostedRuntimeSessionId: 'session-123',
        outcome: 'ready',
        status: {
          recovery: { state: 'restored' },
        } as any,
      }),
    ).toBe(false);
  });

  it('treats restored previews as unhealthy when the latest handoff files were rolled back', () => {
    const mismatch = detectRestoredHostedRuntimeHandoffMismatch({
      status: {
        recovery: { state: 'restored' },
      } as any,
      snapshot: {
        '/home/project/src/App.tsx': {
          type: 'file',
          content: 'export default function App(){return <h1>old</h1>}\n',
          isBinary: false,
        } as any,
      },
      appliedFiles: [
        {
          path: '/home/project/src/App.tsx',
          content: 'export default function App(){return <h1>new</h1>}\n',
        },
      ],
    });

    expect(mismatch).toContain('latest generated update to src/App.tsx was not retained');
  });

  it('accepts restored previews when the runtime snapshot still contains the latest handoff files', () => {
    const mismatch = detectRestoredHostedRuntimeHandoffMismatch({
      status: {
        recovery: { state: 'restored' },
      } as any,
      snapshot: {
        '/home/project/src/App.tsx': {
          type: 'file',
          content: 'export default function App(){return <h1>new</h1>}\n',
          isBinary: false,
        } as any,
      },
      appliedFiles: [
        {
          path: '/home/project/src/App.tsx',
          content: 'export default function App(){return <h1>new</h1>}\n',
        },
      ],
    });

    expect(mismatch).toBeNull();
  });

  it('skips planner for architect recovery prompts', () => {
    expect(
      shouldSkipPlannerForRecoveryPrompt(
        '[Architect Auto-Heal] Attempt 1/2. Issue: Preview runtime exception (preview-runtime-exception).',
      ),
    ).toBe(true);
  });

  it('includes the latest execution failure details in the continuation prompt', () => {
    const prompt = buildRunContinuationPrompt({
      model: 'deepseek/deepseek-v4-pro',
      provider: 'FREE',
      originalRequest: 'Build a calendar app.',
      starterEntryTarget: 'src/App.tsx',
      continuationReason: 'no-bolt-actions',
      shouldContinueForRunIntent: true,
      latestExecutionFailure: {
        toolName: 'preview',
        command: 'pnpm run dev',
        exitCode: 1,
        stderr: 'Unexpected token in /src/App.tsx',
      } as any,
    });

    expect(prompt).toContain('Latest concrete failure to fix first');
    expect(prompt).toContain('pnpm run dev');
    expect(prompt).toContain('Unexpected token in /src/App.tsx');
  });

  it('includes missing exact visible text requirements in continuation prompts', () => {
    const prompt = buildRunContinuationPrompt({
      model: 'deepseek/deepseek-v4-pro',
      provider: 'FREE',
      originalRequest:
        'Improve the existing calendar project and add a visible agenda sidebar label containing the exact text "CAL_FUP_123".',
      starterEntryTarget: 'src/App.tsx',
      continuationReason: 'no-bolt-actions',
      shouldContinueForRunIntent: true,
      missingRequiredVisibleText: ['CAL_FUP_123'],
    });

    expect(prompt).toContain('Missing exact visible text requirements');
    expect(prompt).toContain('"CAL_FUP_123"');
    expect(prompt).toContain('Add these literal strings to the rendered UI');
  });
});
