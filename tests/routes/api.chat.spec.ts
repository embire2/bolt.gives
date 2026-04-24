import { describe, expect, it } from 'vitest';
import {
  buildRunContinuationPrompt,
  resolveContinuationFiles,
  shouldReplayLocalRuntimeHandoff,
  shouldAttemptHostedPreviewVerification,
  shouldUseSynthesizedRunHandoff,
} from '~/routes/api.chat';
import { extractLatestUserGoal } from '~/lib/runtime/user-goal';

describe('resolveContinuationFiles', () => {
  it('prefers the hosted runtime snapshot when it exists', () => {
    const requestFiles = {
      'src/App.tsx': {
        type: 'file' as const,
        content: 'export default function App(){return <div>request-state</div>}',
        isBinary: false,
      },
    };
    const hostedRuntimeSnapshot = {
      '/home/project/src/App.tsx': {
        type: 'file' as const,
        content: 'export default function App(){return <div>runtime-state</div>}',
        isBinary: false,
      },
    };

    expect(
      resolveContinuationFiles({
        requestFiles,
        hostedRuntimeSnapshot,
      }),
    ).toEqual(hostedRuntimeSnapshot);
  });

  it('falls back to request files when no hosted snapshot is available', () => {
    const requestFiles = {
      'src/App.tsx': {
        type: 'file' as const,
        content: 'export default function App(){return <div>request-state</div>}',
        isBinary: false,
      },
    };

    expect(
      resolveContinuationFiles({
        requestFiles,
        hostedRuntimeSnapshot: null,
      }),
    ).toEqual(requestFiles);
  });
});

describe('shouldAttemptHostedPreviewVerification', () => {
  it('returns true for build runs with an active hosted session and no verified preview yet', () => {
    expect(
      shouldAttemptHostedPreviewVerification({
        chatMode: 'build',
        previewCheckpointObserved: false,
        hasExecutionFailures: false,
        hostedRuntimeSessionId: 'session-123',
      }),
    ).toBe(true);
  });

  it('returns false when the preview was already verified', () => {
    expect(
      shouldAttemptHostedPreviewVerification({
        chatMode: 'build',
        previewCheckpointObserved: true,
        hasExecutionFailures: false,
        hostedRuntimeSessionId: 'session-123',
      }),
    ).toBe(false);
  });

  it('returns false outside build mode or without a hosted session', () => {
    expect(
      shouldAttemptHostedPreviewVerification({
        chatMode: 'discuss',
        previewCheckpointObserved: false,
        hasExecutionFailures: false,
        hostedRuntimeSessionId: 'session-123',
      }),
    ).toBe(false);

    expect(
      shouldAttemptHostedPreviewVerification({
        chatMode: 'build',
        previewCheckpointObserved: false,
        hasExecutionFailures: false,
        hostedRuntimeSessionId: '   ',
      }),
    ).toBe(false);
  });
});

describe('shouldUseSynthesizedRunHandoff', () => {
  it('allows inferred runtime handoff for scaffolded projects that still lack a start action', () => {
    expect(shouldUseSynthesizedRunHandoff('scaffold-without-start')).toBe(true);
  });

  it('keeps inferred runtime handoff enabled for the existing recovery paths', () => {
    expect(shouldUseSynthesizedRunHandoff('run-intent-without-start')).toBe(true);
    expect(shouldUseSynthesizedRunHandoff('bootstrap-only-shell-actions')).toBe(true);
    expect(shouldUseSynthesizedRunHandoff('preview-not-verified')).toBe(true);
  });

  it('does not infer a runtime handoff for implementation-gapped starter repairs', () => {
    expect(shouldUseSynthesizedRunHandoff('starter-without-implementation')).toBe(false);
    expect(shouldUseSynthesizedRunHandoff('starter-entry-unchanged')).toBe(false);
  });
});

describe('shouldReplayLocalRuntimeHandoff', () => {
  it('replays inferred runtime commands for local build runs that still lack a verified preview', () => {
    expect(
      shouldReplayLocalRuntimeHandoff({
        chatMode: 'build',
        previewCheckpointObserved: false,
        hasExecutionFailures: false,
        hostedRuntimeSessionId: null,
        hasSynthesizedRunHandoff: true,
      }),
    ).toBe(true);
  });

  it('does not replay inferred runtime commands once a hosted session exists or preview is already verified', () => {
    expect(
      shouldReplayLocalRuntimeHandoff({
        chatMode: 'build',
        previewCheckpointObserved: false,
        hasExecutionFailures: false,
        hostedRuntimeSessionId: 'session-123',
        hasSynthesizedRunHandoff: true,
      }),
    ).toBe(false);

    expect(
      shouldReplayLocalRuntimeHandoff({
        chatMode: 'build',
        previewCheckpointObserved: true,
        hasExecutionFailures: false,
        hostedRuntimeSessionId: null,
        hasSynthesizedRunHandoff: true,
      }),
    ).toBe(false);
  });
});

describe('buildRunContinuationPrompt', () => {
  it('names the starter entry blocker and forbids shell-first verification when the starter file is unchanged', () => {
    const prompt = buildRunContinuationPrompt({
      model: 'deepseek/deepseek-v3.2',
      provider: 'FREE',
      originalRequest: 'Build a calendar app and run it.',
      starterEntryTarget: '/home/project/src/App.tsx',
      continuationReason: 'starter-entry-unchanged',
      shouldContinueForRunIntent: true,
    });

    expect(prompt).toContain('/home/project/src/App.tsx is still the active starter entry and must be replaced first.');
    expect(prompt).toContain('Do not spend the next turn on curl/sleep/background shell verification');
    expect(prompt).toContain('your FIRST executable action must be a <boltAction type="file">');
  });

  it('requires a real start action instead of a background shell start', () => {
    const prompt = buildRunContinuationPrompt({
      model: 'deepseek/deepseek-v3.2',
      provider: 'FREE',
      originalRequest: 'Build a calendar app and run it.',
      starterEntryTarget: '/home/project/src/App.tsx',
      continuationReason: 'scaffold-without-start',
      shouldContinueForRunIntent: true,
    });

    expect(prompt).toContain('You must launch the dev server with <boltAction type="start">...</boltAction>.');
    expect(prompt).toContain('Do not use background shell commands like npm run dev &');
  });
});

describe('extractLatestUserGoal', () => {
  it('ignores hidden auto-continuation messages when resolving the active user goal', () => {
    expect(
      extractLatestUserGoal([
        {
          id: 'visible-user',
          role: 'user',
          content: 'Build a calendar app for a clinic and keep the preview running.',
        },
        {
          id: 'hidden-user',
          role: 'user',
          content: '[Model: deepseek/deepseek-v3.2]\n\nContinue from the current workspace state.',
          annotations: ['hidden'],
        },
      ] as any),
    ).toBe('Build a calendar app for a clinic and keep the preview running.');
  });

  it('falls back to the latest user message when only hidden messages exist', () => {
    expect(
      extractLatestUserGoal([
        {
          id: 'hidden-user',
          role: 'user',
          content: '[Model: deepseek/deepseek-v3.2]\n\nContinue from the current workspace state.',
          annotations: ['hidden'],
        },
      ] as any),
    ).toBe('Continue from the current workspace state.');
  });
});
