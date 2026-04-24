import { describe, expect, it } from 'vitest';
import {
  buildHostedPreviewRecoveryPrompt,
  shouldContinueHostedPreviewRecovery,
  summarizeHostedPreviewFailure,
} from './hosted-preview-recovery';

describe('hosted-preview-recovery', () => {
  it('prefers alert descriptions when summarizing hosted preview failures', () => {
    expect(
      summarizeHostedPreviewFailure({
        alert: {
          description: 'Unexpected token in /src/App.tsx:32:17',
        },
        recentLogs: ['[vite] some longer stack trace'],
      }),
    ).toBe('Unexpected token in /src/App.tsx:32:17');
  });

  it('continues recovery for preview errors while attempts remain', () => {
    expect(
      shouldContinueHostedPreviewRecovery({
        outcome: 'error',
        attempts: 1,
        maxAttempts: 5,
      }),
    ).toBe(true);
  });

  it('stops recovery after attempts are exhausted', () => {
    expect(
      shouldContinueHostedPreviewRecovery({
        outcome: 'timeout',
        attempts: 5,
        maxAttempts: 5,
      }),
    ).toBe(false);
  });

  it('builds a continuation prompt that forbids false success and re-scaffolding', () => {
    const prompt = buildHostedPreviewRecoveryPrompt({
      model: 'deepseek/deepseek-v3.2',
      provider: 'FREE',
      originalRequest: 'Build a React todo app.',
      failureSummary: 'Unexpected token in /src/App.tsx:32:17',
      attempt: 2,
      maxAttempts: 5,
    });

    expect(prompt).toContain('Do not re-scaffold');
    expect(prompt).toContain('Do not claim success until the preview is genuinely running.');
    expect(prompt).toContain('Unexpected token in /src/App.tsx:32:17');
  });
});
