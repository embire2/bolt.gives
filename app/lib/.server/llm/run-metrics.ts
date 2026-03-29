import type { AgentRunMetricsSummary } from '~/types/context';

export type AgentRunMetricRecord = {
  runId: string;
  provider: string;
  model: string;
  commentaryFirstEventLatencyMs: number | null;
  recoveryTriggered: boolean;
  recoverySucceeded: boolean;
  manualIntervention: boolean;
  timestamp: string;
};

type AgentRunMetricsState = {
  history: AgentRunMetricRecord[];
  totalRuns: number;
  recoveryTriggeredRuns: number;
  recoveredRuns: number;
  manualInterventionRuns: number;
  totalCommentaryLatencyMs: number;
  commentaryLatencySamples: number;
};

const GLOBAL_STATE_KEY = '__bolt_agent_run_metrics_v1';
const MAX_HISTORY = 200;

function createInitialState(): AgentRunMetricsState {
  return {
    history: [],
    totalRuns: 0,
    recoveryTriggeredRuns: 0,
    recoveredRuns: 0,
    manualInterventionRuns: 0,
    totalCommentaryLatencyMs: 0,
    commentaryLatencySamples: 0,
  };
}

function getState(): AgentRunMetricsState {
  const g = globalThis as typeof globalThis & {
    [GLOBAL_STATE_KEY]?: AgentRunMetricsState;
  };

  if (!g[GLOBAL_STATE_KEY]) {
    g[GLOBAL_STATE_KEY] = createInitialState();
  }

  return g[GLOBAL_STATE_KEY] as AgentRunMetricsState;
}

function roundRate(value: number): number {
  return Number(value.toFixed(4));
}

export function getAgentMetricsSummary(): AgentRunMetricsSummary {
  const state = getState();
  const avgLatency =
    state.commentaryLatencySamples > 0 ? state.totalCommentaryLatencyMs / state.commentaryLatencySamples : 0;
  const recoverySuccessRate = state.recoveryTriggeredRuns > 0 ? state.recoveredRuns / state.recoveryTriggeredRuns : 0;
  const manualInterventionRate = state.totalRuns > 0 ? state.manualInterventionRuns / state.totalRuns : 0;

  return {
    totalRuns: state.totalRuns,
    recoveryTriggeredRuns: state.recoveryTriggeredRuns,
    recoveredRuns: state.recoveredRuns,
    manualInterventionRuns: state.manualInterventionRuns,
    avgCommentaryFirstEventLatencyMs: Math.round(avgLatency),
    recoverySuccessRate: roundRate(recoverySuccessRate),
    manualInterventionRate: roundRate(manualInterventionRate),
  };
}

export function recordAgentRunMetrics(record: AgentRunMetricRecord): AgentRunMetricsSummary {
  const state = getState();
  state.totalRuns += 1;

  if (record.recoveryTriggered) {
    state.recoveryTriggeredRuns += 1;
  }

  if (record.recoverySucceeded) {
    state.recoveredRuns += 1;
  }

  if (record.manualIntervention) {
    state.manualInterventionRuns += 1;
  }

  if (typeof record.commentaryFirstEventLatencyMs === 'number' && record.commentaryFirstEventLatencyMs >= 0) {
    state.totalCommentaryLatencyMs += record.commentaryFirstEventLatencyMs;
    state.commentaryLatencySamples += 1;
  }

  state.history.push(record);

  if (state.history.length > MAX_HISTORY) {
    state.history.splice(0, state.history.length - MAX_HISTORY);
  }

  return getAgentMetricsSummary();
}

export function listRecentAgentRunMetrics(limit = 20): AgentRunMetricRecord[] {
  const state = getState();
  const safeLimit = Math.max(1, Math.min(200, Math.floor(limit)));

  return state.history.slice(-safeLimit);
}

export function resetAgentRunMetricsForTests() {
  const g = globalThis as typeof globalThis & {
    [GLOBAL_STATE_KEY]?: AgentRunMetricsState;
  };
  g[GLOBAL_STATE_KEY] = createInitialState();
}
