import type { JSONValue } from 'ai';
import { useEffect, useMemo, useState } from 'react';
import type { ProviderInfo } from '~/types/model';
import type {
  AgentCommentaryAnnotation,
  AgentRunMetricsDataEvent,
  ProgressAnnotation,
  SubAgentEvent,
  ToolCallDataEvent,
  UsageDataEvent,
} from '~/types/context';
import type { AutonomyMode } from '~/lib/runtime/autonomy';
import { getAutonomyModeLabel } from '~/lib/runtime/autonomy';
import { estimateCostUSD, formatCostUSD, normalizeUsageEvent } from '~/lib/runtime/cost-estimation';

function isProgress(value: JSONValue): value is ProgressAnnotation {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  return (value as Record<string, unknown>).type === 'progress';
}

function isCommentary(value: JSONValue): value is AgentCommentaryAnnotation {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  return (value as Record<string, unknown>).type === 'agent-commentary';
}

function isToolCall(value: JSONValue): value is ToolCallDataEvent {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  return (value as Record<string, unknown>).type === 'tool-call';
}

function isUsage(value: JSONValue): value is UsageDataEvent {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  return (value as Record<string, unknown>).type === 'usage';
}

function isRunMetrics(value: JSONValue): value is AgentRunMetricsDataEvent {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  return (value as Record<string, unknown>).type === 'run-metrics';
}

function isSubAgentEvent(value: JSONValue): value is SubAgentEvent {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  return (value as Record<string, unknown>).type === 'sub-agent';
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

interface ExecutionTransparencyPanelProps {
  data?: JSONValue[] | undefined;
  model?: string;
  provider?: ProviderInfo;
  isStreaming?: boolean;
  autonomyMode?: AutonomyMode;
  latestRunMetrics?: AgentRunMetricsDataEvent | null;
  latestUsage?: UsageDataEvent | null;
}

export function ExecutionTransparencyPanel(props: ExecutionTransparencyPanelProps) {
  const { data = [], model, provider, isStreaming, autonomyMode, latestUsage } = props;
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (isStreaming) {
      setStartedAt((prev) => prev ?? Date.now());
      return;
    }

    setStartedAt(null);
    setElapsedMs(0);
  }, [isStreaming]);

  useEffect(() => {
    if (!isStreaming || !startedAt) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setElapsedMs(Date.now() - startedAt);
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [isStreaming, startedAt]);

  const progressEvents = useMemo(() => data.filter(isProgress), [data]);
  const commentaryEvents = useMemo(() => data.filter(isCommentary), [data]);
  const toolCalls = useMemo(() => data.filter(isToolCall).slice(-5), [data]);
  const usageEvent = useMemo(() => {
    const inlineUsageEvent = data.filter(isUsage).slice(-1)[0];
    return normalizeUsageEvent(inlineUsageEvent || latestUsage || null) || undefined;
  }, [data, latestUsage]);
  const inlineRunMetrics = useMemo(() => data.filter(isRunMetrics).slice(-1)[0], [data]);
  const runMetrics = props.latestRunMetrics || inlineRunMetrics;
  const subAgentEvents = useMemo(() => data.filter(isSubAgentEvent), [data]);
  const costEstimate = estimateCostUSD({
    providerName: provider?.name,
    modelName: model,
    usage: usageEvent,
  });

  const currentStep = (() => {
    const inProgress = progressEvents.filter((event) => event.status === 'in-progress').slice(-1)[0];

    if (inProgress) {
      return inProgress.message;
    }

    return progressEvents.slice(-1)[0]?.message || 'Idle';
  })();

  const whyThisAction =
    commentaryEvents
      .filter((event) => event.phase === 'plan' || event.phase === 'action' || event.phase === 'next-step')
      .slice(-1)[0]?.message || 'Waiting for the next planning/action update.';

  if (!isStreaming && !usageEvent && toolCalls.length === 0 && progressEvents.length === 0) {
    return null;
  }

  return (
    <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2 text-xs text-bolt-elements-textSecondary">
      <div className="mb-2 font-medium text-bolt-elements-textPrimary">Execution Transparency</div>
      <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
        <div>
          Model: <span className="text-bolt-elements-textPrimary">{model || 'Unknown'}</span>
        </div>
        <div>
          Provider: <span className="text-bolt-elements-textPrimary">{provider?.name || 'Unknown'}</span>
        </div>
        <div>
          Autonomy:{' '}
          <span className="text-bolt-elements-textPrimary">
            {getAutonomyModeLabel(autonomyMode || 'auto-apply-safe')}
          </span>
        </div>
        <div>
          Elapsed: <span className="text-bolt-elements-textPrimary">{formatDuration(elapsedMs)}</span>
        </div>
        <div className="sm:col-span-2">
          Current step: <span className="text-bolt-elements-textPrimary">{currentStep}</span>
        </div>
        <div className="sm:col-span-2">
          Why this action: <span className="text-bolt-elements-textPrimary">{whyThisAction}</span>
        </div>
        <div>
          Tokens: <span className="text-bolt-elements-textPrimary">{usageEvent?.totalTokens ?? 0}</span>
        </div>
        <div>
          Cost estimate: <span className="text-bolt-elements-textPrimary">{formatCostUSD(costEstimate)}</span>
        </div>
        <div>
          Commentary first event:{' '}
          <span className="text-bolt-elements-textPrimary">
            {runMetrics?.commentaryFirstEventLatencyMs ?? 0}
            ms
          </span>
        </div>
        <div>
          Recovery success:{' '}
          <span className="text-bolt-elements-textPrimary">
            {runMetrics ? `${Math.round(runMetrics.aggregate.recoverySuccessRate * 100)}%` : '0%'}
          </span>
        </div>
        <div>
          Manual intervention:{' '}
          <span className="text-bolt-elements-textPrimary">
            {runMetrics ? `${Math.round(runMetrics.aggregate.manualInterventionRate * 100)}%` : '0%'}
          </span>
        </div>
      </div>
      {toolCalls.length > 0 && (
        <div className="mt-2">
          <div className="mb-1 text-bolt-elements-textPrimary">Recent tool calls</div>
          <div className="space-y-1 font-mono">
            {toolCalls.map((toolCall) => (
              <div key={`${toolCall.toolCallId}-${toolCall.timestamp}`}>
                <span className="text-bolt-elements-textPrimary">{toolCall.toolName}</span>{' '}
                <span className="text-bolt-elements-textTertiary">({toolCall.serverName})</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {subAgentEvents.length > 0 && (
        <div className="mt-2">
          <div className="mb-1 text-bolt-elements-textPrimary">Sub-agent Timeline</div>
          <div className="space-y-1">
            {subAgentEvents.map((event) => (
              <div
                key={event.agentId}
                className="rounded border border-bolt-elements-borderColor bg-bolt-elements-background-depth-3 p-2"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-bolt-elements-textPrimary">{event.agentType} Agent</span>
                  <span
                    className={`text-xs ${
                      event.state === 'completed'
                        ? 'text-green-400'
                        : event.state === 'failed'
                          ? 'text-red-400'
                          : event.state === 'in-progress'
                            ? 'text-yellow-400'
                            : 'text-bolt-elements-textSecondary'
                    }`}
                  >
                    {event.state}
                  </span>
                </div>
                {event.model && (
                  <div className="mt-1 text-xs text-bolt-elements-textSecondary">Model: {event.model}</div>
                )}
                {event.provider && (
                  <div className="mt-1 text-xs text-bolt-elements-textSecondary">Provider: {event.provider}</div>
                )}
                {event.tokenUsage && (
                  <div className="mt-1 text-xs text-bolt-elements-textSecondary">
                    Tokens: {event.tokenUsage.totalTokens} ({event.tokenUsage.promptTokens}+
                    {event.tokenUsage.completionTokens})
                  </div>
                )}
                {event.plan && (
                  <div className="mt-2 text-xs text-bolt-elements-textPrimary">
                    <div className="mb-1 font-medium">Plan:</div>
                    <div className="whitespace-pre-wrap opacity-90">
                      {event.plan.slice(0, 200)}
                      {event.plan.length > 200 ? '...' : ''}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
