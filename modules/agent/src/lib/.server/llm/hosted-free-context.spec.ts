import { describe, expect, it } from 'vitest';
import { buildDeterministicHostedFreeSummary, shouldUseDeterministicHostedFreeContext } from './hosted-free-context';

describe('hosted FREE deterministic context', () => {
  it('uses deterministic compact context only for hosted FREE build requests', () => {
    expect(
      shouldUseDeterministicHostedFreeContext({
        provider: 'FREE',
        contextOptimization: true,
        chatMode: 'build',
      }),
    ).toBe(true);
    expect(
      shouldUseDeterministicHostedFreeContext({
        provider: 'OpenRouter',
        contextOptimization: true,
        chatMode: 'build',
      }),
    ).toBe(false);
  });

  it('builds bounded history from project memory without runtime error transcripts', () => {
    const summary = buildDeterministicHostedFreeSummary({
      latestUserGoal: 'Add a visible calendar agenda.',
      projectMemory: {
        latestGoal: 'Build the calendar.',
        summary: `Working calendar. ${'x'.repeat(4000)}`,
        architecture: 'React and Vite.',
      },
    });

    expect(summary).toContain('Current request: Add a visible calendar agenda.');
    expect(summary).toContain('Previous project goal: Build the calendar.');
    expect(summary).toContain('Persisted architecture: React and Vite.');
    expect(summary.length).toBeLessThan(3500);
  });
});
