import type { JSONValue } from 'ai';
import { useEffect, useMemo, useState } from 'react';
import type { ProviderInfo } from '~/types/model';
import type {
  AgentCommentaryAnnotation,
  CheckpointDataEvent,
  ProgressAnnotation,
  ToolCallDataEvent,
} from '~/types/context';

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

function isCheckpoint(value: JSONValue): value is CheckpointDataEvent {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  return (value as Record<string, unknown>).type === 'checkpoint';
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function mapPhase(phase?: AgentCommentaryAnnotation['phase']): string {
  if (!phase) {
    return 'idle';
  }

  if (phase === 'action') {
    return 'doing';
  }

  if (phase === 'verification') {
    return 'verifying';
  }

  if (phase === 'next-step') {
    return 'next';
  }

  return phase;
}

interface ExecutionStickyFooterProps {
  data?: JSONValue[] | undefined;
  model?: string;
  provider?: ProviderInfo;
  isStreaming?: boolean;
}

export function ExecutionStickyFooter(props: ExecutionStickyFooterProps) {
  const { data = [], model, provider, isStreaming } = props;
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (isStreaming) {
      setStartedAt((previous) => previous ?? Date.now());
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
  const checkpointEvents = useMemo(() => data.filter(isCheckpoint), [data]);
  const actionCount = useMemo(() => data.filter(isToolCall).length, [data]);
  const lastCommentary = commentaryEvents.slice(-1)[0];
  const currentStep =
    progressEvents.filter((event) => event.status === 'in-progress').slice(-1)[0]?.message ||
    progressEvents.slice(-1)[0]?.message ||
    'idle';
  const phase = mapPhase(lastCommentary?.phase);
  const failedCheckpoint = checkpointEvents
    .slice()
    .reverse()
    .find((event) => event.status === 'error');
  const recoveryState = failedCheckpoint
    ? `failed (${failedCheckpoint.checkpointType})`
    : lastCommentary?.phase === 'recovery'
      ? lastCommentary.status
      : 'stable';

  if (!isStreaming && progressEvents.length === 0 && commentaryEvents.length === 0 && checkpointEvents.length === 0) {
    return null;
  }

  return (
    <div className="sticky bottom-0 z-20 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2/95 px-3 py-2 text-xs backdrop-blur">
      <div className="flex flex-wrap items-center gap-2 text-bolt-elements-textSecondary">
        <span className="rounded border border-bolt-elements-borderColor px-2 py-0.5">
          Model: <span className="text-bolt-elements-textPrimary">{model || 'unknown'}</span>
        </span>
        <span className="rounded border border-bolt-elements-borderColor px-2 py-0.5">
          Provider: <span className="text-bolt-elements-textPrimary">{provider?.name || 'unknown'}</span>
        </span>
        <span className="rounded border border-bolt-elements-borderColor px-2 py-0.5">
          Phase: <span className="text-bolt-elements-textPrimary">{phase}</span>
        </span>
        <span className="rounded border border-bolt-elements-borderColor px-2 py-0.5">
          Step: <span className="text-bolt-elements-textPrimary">{currentStep}</span>
        </span>
        <span className="rounded border border-bolt-elements-borderColor px-2 py-0.5">
          Elapsed: <span className="text-bolt-elements-textPrimary">{formatDuration(elapsedMs)}</span>
        </span>
        <span className="rounded border border-bolt-elements-borderColor px-2 py-0.5">
          Actions: <span className="text-bolt-elements-textPrimary">{actionCount}</span>
        </span>
        <span className="rounded border border-bolt-elements-borderColor px-2 py-0.5">
          Recovery: <span className="text-bolt-elements-textPrimary">{recoveryState}</span>
        </span>
      </div>
    </div>
  );
}
