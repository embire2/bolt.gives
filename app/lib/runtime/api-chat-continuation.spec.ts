import { describe, expect, it } from 'vitest';
import {
  buildRunContinuationPrompt,
  shouldAllowSynthesizedRunHandoff,
  shouldContinueAfterBlockedSynthesizedRunHandoff,
  shouldContinueHostedPreviewVerificationFailure,
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

  it('skips planner for architect recovery prompts', () => {
    expect(
      shouldSkipPlannerForRecoveryPrompt(
        '[Architect Auto-Heal] Attempt 1/2. Issue: Preview runtime exception (preview-runtime-exception).',
      ),
    ).toBe(true);
  });

  it('includes the latest execution failure details in the continuation prompt', () => {
    const prompt = buildRunContinuationPrompt({
      model: 'deepseek/deepseek-v3.2',
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
});
