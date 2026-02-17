import { beforeEach, describe, expect, it } from 'vitest';
import {
  getAgentMetricsSummary,
  listRecentAgentRunMetrics,
  recordAgentRunMetrics,
  resetAgentRunMetricsForTests,
} from './run-metrics';

describe('run-metrics', () => {
  beforeEach(() => {
    resetAgentRunMetricsForTests();
  });

  it('records run metrics and computes aggregate rates', () => {
    recordAgentRunMetrics({
      runId: 'run-1',
      provider: 'OpenAI',
      model: 'gpt-5-codex',
      commentaryFirstEventLatencyMs: 420,
      recoveryTriggered: true,
      recoverySucceeded: true,
      manualIntervention: false,
      timestamp: new Date().toISOString(),
    });

    recordAgentRunMetrics({
      runId: 'run-2',
      provider: 'Anthropic',
      model: 'claude-3-5-sonnet-latest',
      commentaryFirstEventLatencyMs: 780,
      recoveryTriggered: true,
      recoverySucceeded: false,
      manualIntervention: true,
      timestamp: new Date().toISOString(),
    });

    const summary = getAgentMetricsSummary();
    expect(summary.totalRuns).toBe(2);
    expect(summary.recoveryTriggeredRuns).toBe(2);
    expect(summary.recoveredRuns).toBe(1);
    expect(summary.manualInterventionRuns).toBe(1);
    expect(summary.avgCommentaryFirstEventLatencyMs).toBe(600);
    expect(summary.recoverySuccessRate).toBe(0.5);
    expect(summary.manualInterventionRate).toBe(0.5);
  });

  it('keeps recent history entries', () => {
    recordAgentRunMetrics({
      runId: 'run-1',
      provider: 'OpenAI',
      model: 'gpt-4o',
      commentaryFirstEventLatencyMs: 220,
      recoveryTriggered: false,
      recoverySucceeded: false,
      manualIntervention: false,
      timestamp: new Date().toISOString(),
    });
    recordAgentRunMetrics({
      runId: 'run-2',
      provider: 'OpenAI',
      model: 'gpt-5-codex',
      commentaryFirstEventLatencyMs: 280,
      recoveryTriggered: false,
      recoverySucceeded: false,
      manualIntervention: true,
      timestamp: new Date().toISOString(),
    });

    const recent = listRecentAgentRunMetrics(1);
    expect(recent).toHaveLength(1);
    expect(recent[0].runId).toBe('run-2');
  });
});
