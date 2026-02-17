import { beforeEach, describe, expect, it } from 'vitest';
import { loader } from '~/routes/api.system.agent-metrics';
import { recordAgentRunMetrics, resetAgentRunMetricsForTests } from '~/lib/.server/llm/run-metrics';

describe('api.system.agent-metrics loader', () => {
  beforeEach(() => {
    resetAgentRunMetricsForTests();
  });

  it('returns aggregate and recent run metrics', async () => {
    recordAgentRunMetrics({
      runId: 'run-1',
      provider: 'OpenAI',
      model: 'gpt-5-codex',
      commentaryFirstEventLatencyMs: 330,
      recoveryTriggered: true,
      recoverySucceeded: true,
      manualIntervention: false,
      timestamp: new Date().toISOString(),
    });

    const request = new Request('http://localhost/api/system/agent-metrics?limit=5');
    const response = await loader({ request });
    const payload = (await response.json()) as any;

    expect(payload.available).toBe(true);
    expect(payload.summary.totalRuns).toBe(1);
    expect(payload.summary.recoverySuccessRate).toBe(1);
    expect(payload.recentRuns).toHaveLength(1);
    expect(payload.recentRuns[0].provider).toBe('OpenAI');
  });
});
