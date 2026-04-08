import { useStore } from '@nanostores/react';
import { useMemo, useRef } from 'react';
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

function isArchitectTimelineEvent(event: InteractiveStepRunnerEvent): boolean {
  return /architect/i.test(event.description || '');
}

function renderArchitectCard(event: InteractiveStepRunnerEvent, index: number) {
  const status = event.type === 'error' ? 'warning' : event.type === 'step-end' ? 'complete' : 'in-progress';
  const eventLabel =
    event.type === 'step-start'
      ? 'attempt'
      : event.type === 'step-end'
        ? 'outcome'
        : event.type === 'error'
          ? 'blocked'
          : 'diagnosis';

  return (
    <div
      key={`architect-${event.timestamp}-${event.type}-${index}`}
      className="rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-3 px-2 py-2"
    >
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wide text-bolt-elements-textSecondary">
          architect/{eventLabel}
        </span>
        <span className={`rounded border px-1.5 py-0.5 text-[10px] ${getStatusClasses(status)}`}>{status}</span>
      </div>
      <div className="whitespace-pre-wrap break-words text-bolt-elements-textPrimary">
        {event.description || 'Architect update'}
      </div>
      {event.output || event.error ? (
        <div className="mt-1 whitespace-pre-wrap break-words text-xs text-bolt-elements-textSecondary">
          {event.error || event.output}
        </div>
      ) : null}
      {event.command && event.command.length > 0 ? (
        <div className="mt-1 whitespace-pre-wrap break-words font-mono text-[11px] text-bolt-elements-textTertiary">
          {event.command.join(' ')}
        </div>
      ) : null}
    </div>
  );
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
      <div className="whitespace-pre-wrap break-words text-sm text-bolt-elements-textPrimary">{event.message}</div>
      {event.detail ? (
        <div className="mt-1 space-y-1 text-xs text-bolt-elements-textSecondary">
          {details.keyChanges ? (
            <div className="whitespace-pre-wrap break-words">
              <span className="text-bolt-elements-textPrimary">Key changes:</span> {details.keyChanges}
            </div>
          ) : null}
          {details.next ? (
            <div className="whitespace-pre-wrap break-words">
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
  includeCommentary?: boolean;
  title?: string;
}

function estimateCardHeight(textLength: number, baseHeight = 104) {
  return baseHeight + Math.min(280, Math.ceil(textLength / 120) * 22);
}

export function StepRunnerFeed(props: StepRunnerFeedProps) {
  const events = useStore(workbenchStore.stepRunnerEvents);
  const commentaryEvents =
    props.includeCommentary === false ? [] : (props.data || []).filter(isAgentCommentaryAnnotation).slice(-12);
  const checkpointEvents = (props.data || []).filter(isCheckpointDataEvent).slice(-12);
  const architectEvents = events.filter(isArchitectTimelineEvent).slice(-16);

  const recent = events.filter((event) => !isArchitectTimelineEvent(event)).slice(-96);
  const scrollRef = useRef<HTMLDivElement>(null);

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

  const feedItems = useMemo(() => {
    const items: Array<{ key: string; estimateSize: number; render: () => JSX.Element }> = [];

    commentaryEvents.forEach((event, index) => {
      const detailLength = `${event.message}\n${event.detail || ''}`.length;
      items.push({
        key: `commentary-${event.timestamp}-${event.phase}-${index}`,
        estimateSize: estimateCardHeight(detailLength, 128),
        render: () => renderCommentaryCard(event, index) as JSX.Element,
      });
    });

    architectEvents.forEach((event, index) => {
      const detailLength = `${event.description || ''}\n${event.output || ''}\n${event.error || ''}`.length;
      items.push({
        key: `architect-${event.timestamp}-${event.type}-${index}`,
        estimateSize: estimateCardHeight(detailLength, 120),
        render: () => renderArchitectCard(event, index) as JSX.Element,
      });
    });

    checkpointEvents.forEach((event, index) => {
      const detailLength = `${event.message}\n${event.command || ''}\n${event.stderr || ''}`.length;
      items.push({
        key: `checkpoint-${event.timestamp}-${event.checkpointType}-${index}`,
        estimateSize: estimateCardHeight(detailLength, 132),
        render: () => (
          <div className="rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-3 px-2 py-2">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wide text-bolt-elements-textSecondary">
                checkpoint/{event.checkpointType}
              </span>
              <span className={`rounded border px-1.5 py-0.5 text-[10px] ${getStatusClasses(event.status)}`}>
                {event.status}
              </span>
            </div>
            <div className="whitespace-pre-wrap break-words text-bolt-elements-textPrimary">{event.message}</div>
            {event.command || typeof event.exitCode === 'number' || event.stderr ? (
              <details className="mt-1">
                <summary className="cursor-pointer text-[11px] text-bolt-elements-textTertiary">
                  Technical details
                </summary>
                <div className="modern-scrollbar mt-1 max-h-40 space-y-1 overflow-y-auto font-mono text-[11px] text-bolt-elements-textTertiary">
                  {event.command ? <div>{event.command}</div> : null}
                  {typeof event.exitCode === 'number' ? <div>exit {event.exitCode}</div> : null}
                  {event.stderr ? <div>{event.stderr}</div> : null}
                </div>
              </details>
            ) : null}
          </div>
        ),
      });
    });

    recent.forEach((event, index) => {
      const primaryText = getPrimaryText(event);
      const detailLength = `${primaryText}\n${event.command?.join(' ') || ''}\n${event.error || ''}`.length;

      items.push({
        key: `event-${event.timestamp}-${event.type}-${index}`,
        estimateSize: estimateCardHeight(detailLength, 104),
        render: () => (
          <div className="rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-3 px-2 py-2">
            <div className="mb-1 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-wide text-bolt-elements-textSecondary">
              <span>[{event.type}]</span>
              {typeof event.stepIndex === 'number' ? <span>step {event.stepIndex + 1}</span> : null}
              {typeof event.exitCode === 'number' ? (
                <span className="rounded border border-bolt-elements-borderColor px-1 py-0">exit {event.exitCode}</span>
              ) : null}
            </div>
            <div className="whitespace-pre-wrap break-words font-mono text-[12px] text-bolt-elements-textPrimary">
              {primaryText}
            </div>
            {event.type === 'step-start' && event.command && event.command.length > 0 ? (
              <div className="mt-1 whitespace-pre-wrap break-words font-mono text-[11px] text-bolt-elements-textTertiary">
                {event.command.join(' ')}
              </div>
            ) : null}
            {event.type === 'error' ? (
              <div className="mt-1 whitespace-pre-wrap break-words text-xs text-bolt-elements-textTertiary">
                hint: {getSuggestedFix(event)}
              </div>
            ) : null}
          </div>
        ),
      });
    });

    return items;
  }, [architectEvents, checkpointEvents, commentaryEvents, recent]);

  if (feedItems.length === 0) {
    return null;
  }

  return (
    <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2 text-xs text-bolt-elements-textSecondary">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-medium text-bolt-elements-textPrimary">{props.title || 'Execution Timeline'}</span>
        <button
          className="bg-transparent text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary"
          onClick={() => workbenchStore.clearStepRunnerEvents()}
        >
          Clear
        </button>
      </div>
      <div
        ref={scrollRef}
        className="modern-scrollbar max-h-[44vh] overflow-x-hidden overflow-y-auto pr-1 sm:max-h-[30rem]"
      >
        <div className="space-y-2">
          {feedItems.map((item) => (
            <div key={item.key}>{item.render()}</div>
          ))}
        </div>
      </div>
    </div>
  );
}
