import { useStore } from '@nanostores/react';
import { workbenchStore } from '~/lib/stores/workbench';
import type { InteractiveStepRunnerEvent } from '~/lib/runtime/interactive-step-runner';
import type { JSONValue } from 'ai';
import type { AgentCommentaryAnnotation, CheckpointDataEvent } from '~/types/context';

function getSuggestedFix(event: InteractiveStepRunnerEvent): string | undefined {
  if (event.type !== 'error') {
    return undefined;
  }

  const description = event.description || '';

  if (/eslint/i.test(description)) {
    return 'Try `pnpm run lint -- --fix` and re-run `pnpm test`.';
  }

  if (/security scan/i.test(description)) {
    return 'Install Snyk (`npm i -g snyk`) or run `pnpm audit` and address reported vulnerabilities.';
  }

  if (/test suite/i.test(description) || /\bpnpm test\b/i.test(description)) {
    return 'Re-run `pnpm test` and inspect the first failing test output.';
  }

  return 'Review the step output above and re-run after applying the fix.';
}

function isAgentCommentaryAnnotation(value: JSONValue): value is AgentCommentaryAnnotation {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return candidate.type === 'agent-commentary' && typeof candidate.message === 'string';
}

function isCheckpointDataEvent(value: JSONValue): value is CheckpointDataEvent {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return candidate.type === 'checkpoint' && typeof candidate.message === 'string';
}

function getPhaseLabel(phase: AgentCommentaryAnnotation['phase']): string {
  switch (phase) {
    case 'plan':
      return 'Plan';
    case 'action':
      return 'Doing';
    case 'verification':
      return 'Verifying';
    case 'next-step':
      return 'Next';
    case 'recovery':
      return 'Recovery';
    default:
      return 'Update';
  }
}

function getStatusClasses(status: AgentCommentaryAnnotation['status'] | CheckpointDataEvent['status']): string {
  if (status === 'complete' || status === 'recovered') {
    return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
  }

  if (status === 'warning' || status === 'error') {
    return 'text-amber-400 bg-amber-500/10 border-amber-500/30';
  }

  return 'text-sky-400 bg-sky-500/10 border-sky-500/30';
}

function parseContractDetail(detail: string | undefined): { keyChanges?: string; next?: string } {
  if (!detail) {
    return {};
  }

  const keyChangesMatch = detail.match(/Key changes:\s*([\s\S]*?)(?=\nNext:|$)/i);
  const nextMatch = detail.match(/Next:\s*([\s\S]*?)$/i);

  return {
    keyChanges: keyChangesMatch?.[1]?.trim(),
    next: nextMatch?.[1]?.trim(),
  };
}

function renderCommentaryCard(event: AgentCommentaryAnnotation, index: number) {
  const details = parseContractDetail(event.detail);

  return (
    <div
      key={`${event.timestamp}-${event.phase}-${index}`}
      className="rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-3 px-2 py-2"
    >
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-bolt-elements-textSecondary">
          {getPhaseLabel(event.phase)}
        </span>
        <span className={`rounded border px-1.5 py-0.5 text-[10px] ${getStatusClasses(event.status)}`}>
          {event.status}
        </span>
      </div>
      <div className="text-sm text-bolt-elements-textPrimary">{event.message}</div>
      {event.detail ? (
        <div className="mt-1 space-y-1 text-xs text-bolt-elements-textSecondary">
          {details.keyChanges ? (
            <div>
              <span className="text-bolt-elements-textPrimary">Key changes:</span> {details.keyChanges}
            </div>
          ) : null}
          {details.next ? (
            <div>
              <span className="text-bolt-elements-textPrimary">Next:</span> {details.next}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

interface StepRunnerFeedProps {
  data?: JSONValue[] | undefined;
}

export function StepRunnerFeed(props: StepRunnerFeedProps) {
  const events = useStore(workbenchStore.stepRunnerEvents);
  const commentaryEvents = (props.data || []).filter(isAgentCommentaryAnnotation).slice(-10);
  const checkpointEvents = (props.data || []).filter(isCheckpointDataEvent).slice(-10);

  if (events.length === 0 && commentaryEvents.length === 0 && checkpointEvents.length === 0) {
    return null;
  }

  const recent = events.slice(-10);

  const getPrimaryText = (event: InteractiveStepRunnerEvent): string => {
    switch (event.type) {
      case 'stdout':
      case 'stderr': {
        return event.output || '';
      }
      case 'error': {
        return event.error || event.output || event.description || 'error';
      }
      case 'step-end': {
        const exit = typeof event.exitCode === 'number' ? ` (exit ${event.exitCode})` : '';
        return `${event.description || 'step finished'}${exit}`;
      }
      case 'complete': {
        return 'all steps complete';
      }
      case 'telemetry': {
        return event.output || event.description || 'runtime telemetry sample';
      }
      case 'step-start':
      default: {
        return event.description || event.output || '';
      }
    }
  };

  return (
    <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2 text-xs text-bolt-elements-textSecondary">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-medium text-bolt-elements-textPrimary">Execution Timeline</span>
        <button
          className="bg-transparent text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary"
          onClick={() => workbenchStore.clearStepRunnerEvents()}
        >
          Clear
        </button>
      </div>
      <div className="max-h-52 space-y-2 overflow-y-auto">
        {commentaryEvents.map(renderCommentaryCard)}
        {checkpointEvents.map((event, index) => (
          <div
            key={`${event.timestamp}-${event.checkpointType}-${index}`}
            className="rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-3 px-2 py-2 font-mono"
          >
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wide text-bolt-elements-textSecondary">
                checkpoint/{event.checkpointType}
              </span>
              <span className={`rounded border px-1.5 py-0.5 text-[10px] ${getStatusClasses(event.status)}`}>
                {event.status}
              </span>
            </div>
            <div className="text-bolt-elements-textPrimary">{event.message}</div>
            {event.command ? <div className="mt-1 text-bolt-elements-textTertiary">{event.command}</div> : null}
            {typeof event.exitCode === 'number' ? (
              <div className="text-bolt-elements-textTertiary">exit {event.exitCode}</div>
            ) : null}
            {event.stderr ? <div className="text-bolt-elements-textTertiary">{event.stderr}</div> : null}
          </div>
        ))}
        {recent.map((event, index) => (
          <div key={`${event.timestamp}-${event.type}-${index}`} className="font-mono">
            <span className="mr-2 text-bolt-elements-textTertiary">[{event.type}]</span>
            <span className="text-bolt-elements-textPrimary">{getPrimaryText(event)}</span>
            {event.type === 'step-start' && event.command && event.command.length > 0 ? (
              <div className="ml-10 text-bolt-elements-textTertiary">{event.command.join(' ')}</div>
            ) : null}
            {event.type === 'error' && (
              <div className="ml-10 text-bolt-elements-textTertiary">hint: {getSuggestedFix(event)}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
