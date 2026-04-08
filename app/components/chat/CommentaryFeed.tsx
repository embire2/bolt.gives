import type { JSONValue } from 'ai';
import { useStore } from '@nanostores/react';
import { useEffect, useMemo, useRef, type Ref } from 'react';
import { workbenchStore } from '~/lib/stores/workbench';
import type { AgentCommentaryAnnotation, CheckpointDataEvent, ProgressAnnotation } from '~/types/context';
import { deriveProgressMessage, hasPreviewVerification } from './execution-status';

function isAgentCommentaryAnnotation(value: JSONValue): value is AgentCommentaryAnnotation {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return candidate.type === 'agent-commentary' && typeof candidate.message === 'string';
}

function isProgressAnnotation(value: JSONValue): value is ProgressAnnotation {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return candidate.type === 'progress' && typeof candidate.message === 'string';
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

function getStatusClasses(status: AgentCommentaryAnnotation['status']): string {
  if (status === 'complete' || status === 'recovered') {
    return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
  }

  if (status === 'warning') {
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

function normalizeStepDescription(value: string | undefined): string | null {
  const normalized = String(value || '')
    .replace(/\s+/g, ' ')
    .trim();

  return normalized ? normalized : null;
}

function summarizeStepRunnerState(stepRunnerEvents: ReturnType<typeof workbenchStore.stepRunnerEvents.get>) {
  const latestEvent = stepRunnerEvents.at(-1);
  const latestError = [...stepRunnerEvents].reverse().find((event) => event.type === 'error');
  const latestCompletedStep = [...stepRunnerEvents].reverse().find((event) => event.type === 'step-end');
  const latestStartedStep = [...stepRunnerEvents].reverse().find((event) => event.type === 'step-start');

  if (!latestEvent) {
    return null;
  }

  if (latestEvent.type === 'error') {
    return {
      status: 'warning' as const,
      phaseLabel: 'Recovery',
      now: normalizeStepDescription(
        `The last command failed: ${latestEvent.description || latestEvent.error || 'execution step'}.`,
      ),
      last:
        normalizeStepDescription(latestEvent.error) ||
        normalizeStepDescription(latestCompletedStep?.output) ||
        'The latest command failed before the preview could recover.',
      next: 'Architect is preparing the smallest safe fix and will rerun the failing step.',
    };
  }

  if (latestEvent.type === 'complete') {
    return {
      status: 'complete' as const,
      phaseLabel: 'Ready',
      now: 'The current run completed and the workspace is ready for inspection.',
      last:
        normalizeStepDescription(latestCompletedStep?.output) ||
        normalizeStepDescription(latestCompletedStep?.description) ||
        'All planned execution steps completed.',
      next: 'Inspect the files and preview, or continue with the next change request.',
    };
  }

  if (latestStartedStep) {
    return {
      status: 'in-progress' as const,
      phaseLabel: 'Doing',
      now:
        normalizeStepDescription(
          latestEvent.type === 'step-start'
            ? `Running ${latestStartedStep.description || 'the next command'} now.`
            : latestStartedStep.description || latestEvent.description,
        ) || 'Running the next command now.',
      last:
        normalizeStepDescription(latestCompletedStep?.output) ||
        normalizeStepDescription(latestCompletedStep?.description) ||
        'Execution has started and the workspace is updating.',
      next: 'The current command output will stream here, then the next file or preview step will follow.',
    };
  }

  return {
    status: 'in-progress' as const,
    phaseLabel: 'Active',
    now: normalizeStepDescription(latestEvent.description) || 'The workspace is processing the current task.',
    last:
      normalizeStepDescription(latestCompletedStep?.output) ||
      normalizeStepDescription(latestError?.error) ||
      'Waiting for the next visible execution checkpoint.',
    next: 'I will surface the next concrete result here as soon as the runtime produces it.',
  };
}

function getSummaryTone(status: AgentCommentaryAnnotation['status'] | 'idle') {
  if (status === 'warning') {
    return 'border-amber-500/30 bg-amber-500/10 text-amber-200';
  }

  if (status === 'complete' || status === 'recovered') {
    return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200';
  }

  if (status === 'idle') {
    return 'border-bolt-elements-borderColor bg-bolt-elements-background-depth-3 text-bolt-elements-textSecondary';
  }

  return 'border-sky-500/30 bg-sky-500/10 text-sky-200';
}

interface CommentaryFeedProps {
  data?: JSONValue[] | undefined;
  scrollRef?: Ref<HTMLDivElement>;
}

export function CommentaryFeed(props: CommentaryFeedProps) {
  const stepRunnerEvents = useStore(workbenchStore.stepRunnerEvents);
  const feedRef = useRef<HTMLDivElement | null>(null);
  const commentaryEvents = useMemo(
    () => (props.data || []).filter(isAgentCommentaryAnnotation).slice(-12),
    [props.data],
  );
  const progressEvents = useMemo(() => (props.data || []).filter(isProgressAnnotation), [props.data]);
  const checkpointEvents = useMemo(() => (props.data || []).filter(isCheckpointDataEvent).slice(-12), [props.data]);

  const latestCommentary = commentaryEvents.at(-1);
  const latestCommentaryDetail = parseContractDetail(latestCommentary?.detail);
  const currentProgress =
    progressEvents.filter((event) => event.status === 'in-progress').at(-1) || progressEvents.at(-1);
  const lastCompletedProgress = progressEvents.filter((event) => event.status === 'complete').at(-1);
  const lastCompletedCheckpoint = checkpointEvents.filter((event) => event.status === 'complete').at(-1);
  const latestStepEvent = stepRunnerEvents.at(-1);
  const stepRunnerSummary = summarizeStepRunnerState(stepRunnerEvents);
  const latestCommentaryTimestamp = latestCommentary?.timestamp ? Date.parse(latestCommentary.timestamp) : 0;
  const latestStepTimestamp = latestStepEvent?.timestamp ? Date.parse(latestStepEvent.timestamp) : 0;
  const stepRunnerTakesPriority =
    Boolean(stepRunnerSummary) &&
    (stepRunnerSummary?.status === 'warning' ||
      (Number.isFinite(latestStepTimestamp) && latestStepTimestamp > latestCommentaryTimestamp));
  const previewVerified = hasPreviewVerification(stepRunnerEvents);
  const currentStep = deriveProgressMessage(progressEvents, stepRunnerEvents);
  const hasSignals =
    commentaryEvents.length > 0 ||
    progressEvents.length > 0 ||
    checkpointEvents.length > 0 ||
    stepRunnerEvents.length > 0;

  useEffect(() => {
    if (!feedRef.current) {
      return;
    }

    feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [commentaryEvents.length, checkpointEvents.length, progressEvents.length, stepRunnerEvents.length]);

  if (!hasSignals) {
    return null;
  }

  const summaryStatus =
    latestCommentary?.status || stepRunnerSummary?.status || (currentProgress ? 'in-progress' : 'idle');
  const summaryTone = getSummaryTone(summaryStatus);
  const nowMessage =
    (stepRunnerTakesPriority ? stepRunnerSummary?.now : latestCommentary?.message) ||
    (stepRunnerTakesPriority ? latestCommentary?.message : stepRunnerSummary?.now) ||
    currentStep ||
    normalizeStepDescription(latestStepEvent?.description) ||
    'Waiting for the next visible action.';
  const lastVisibleResult =
    (stepRunnerTakesPriority ? stepRunnerSummary?.last : latestCommentaryDetail.keyChanges) ||
    (stepRunnerTakesPriority ? latestCommentaryDetail.keyChanges : stepRunnerSummary?.last) ||
    lastCompletedCheckpoint?.message ||
    lastCompletedProgress?.message ||
    normalizeStepDescription(latestStepEvent?.type === 'step-end' ? latestStepEvent.description : undefined) ||
    (previewVerified ? 'Preview verified and ready for inspection.' : 'No completed checkpoint yet.');
  const nextMessage =
    (stepRunnerTakesPriority ? stepRunnerSummary?.next : latestCommentaryDetail.next) ||
    (stepRunnerTakesPriority ? latestCommentaryDetail.next : stepRunnerSummary?.next) ||
    (summaryStatus === 'warning'
      ? 'I am applying a recovery step and will confirm the outcome next.'
      : previewVerified
        ? 'You can inspect the preview while I finish the remaining checks.'
        : 'I am moving to the next file, command, or verification step.');

  return (
    <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2 text-xs text-bolt-elements-textSecondary">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-medium text-bolt-elements-textPrimary">Live Commentary</span>
        <span className="text-[11px] text-bolt-elements-textTertiary">
          {commentaryEvents.length > 0 ? `${commentaryEvents.length} updates` : 'status summary'}
        </span>
      </div>
      <div className={`mb-3 rounded-md border px-3 py-2 ${summaryTone}`}>
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wide">Current status</span>
          <span className="rounded border border-current/30 px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
            {latestCommentary
              ? stepRunnerTakesPriority
                ? stepRunnerSummary?.phaseLabel || getPhaseLabel(latestCommentary.phase)
                : getPhaseLabel(latestCommentary.phase)
              : stepRunnerSummary?.phaseLabel || (previewVerified ? 'Ready' : 'Active')}
          </span>
        </div>
        <div className="space-y-2 text-sm">
          <div className="whitespace-pre-wrap break-words">
            <span className="font-semibold text-bolt-elements-textPrimary">Now:</span>{' '}
            <span className="text-bolt-elements-textPrimary">{nowMessage}</span>
          </div>
          <div className="whitespace-pre-wrap break-words">
            <span className="font-semibold text-bolt-elements-textPrimary">Last:</span>{' '}
            <span className="text-bolt-elements-textPrimary">{lastVisibleResult}</span>
          </div>
          <div className="whitespace-pre-wrap break-words">
            <span className="font-semibold text-bolt-elements-textPrimary">Next:</span>{' '}
            <span className="text-bolt-elements-textPrimary">{nextMessage}</span>
          </div>
        </div>
      </div>
      {commentaryEvents.length > 0 ? (
        <div
          ref={feedRef}
          className="modern-scrollbar max-h-[24vh] space-y-2 overflow-x-hidden overflow-y-auto pr-1 sm:max-h-[18rem]"
        >
          {commentaryEvents.map((event, index) => {
            const details = parseContractDetail(event.detail);

            return (
              <div
                key={`${event.timestamp}-${event.phase}-${index}`}
                className="rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-3 px-3 py-2"
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-bolt-elements-textSecondary">
                    {getPhaseLabel(event.phase)}
                  </span>
                  <span className={`rounded border px-1.5 py-0.5 text-[10px] ${getStatusClasses(event.status)}`}>
                    {event.status}
                  </span>
                </div>
                <div className="whitespace-pre-wrap break-words text-sm text-bolt-elements-textPrimary">
                  {event.message}
                </div>
                {event.detail ? (
                  <div className="mt-2 space-y-1 text-xs text-bolt-elements-textSecondary">
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
          })}
        </div>
      ) : (
        <div
          ref={feedRef}
          className="rounded-md border border-dashed border-bolt-elements-borderColor bg-bolt-elements-background-depth-3 px-3 py-3 text-xs text-bolt-elements-textSecondary"
        >
          Waiting for the first concrete runtime step.
          <br />
          If the provider fails before generation starts, the exact failure reason will appear here.
        </div>
      )}
    </div>
  );
}
