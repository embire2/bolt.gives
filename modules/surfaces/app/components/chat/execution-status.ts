import type { JSONValue } from 'ai';
import type { InteractiveStepRunnerEvent } from '@bolt/agent/lib/runtime/interactive-step-runner';
import type { AgentCommentaryAnnotation, ProgressAnnotation } from '@bolt/core/types/context';
import type { FileMap } from '@bolt/core/types/files';
import { hasFallbackStarterPlaceholder } from '@bolt/agent/lib/runtime/starter-placeholder';

export function hasGeneratedWorkspaceChanges(current: FileMap, baseline: FileMap): boolean {
  if (current === baseline || hasFallbackStarterPlaceholder(current)) {
    return false;
  }

  const paths = new Set([...Object.keys(current), ...Object.keys(baseline)]);

  for (const path of paths) {
    const next = current[path];
    const previous = baseline[path];

    if (next?.type !== 'file' && previous?.type !== 'file') {
      continue;
    }

    if (
      next?.type !== 'file' ||
      previous?.type !== 'file' ||
      next.content !== previous.content ||
      next.isBinary !== previous.isBinary
    ) {
      return true;
    }
  }

  return false;
}

export function findMergeableStreamIndex(
  events: InteractiveStepRunnerEvent[],
  incoming: InteractiveStepRunnerEvent,
): number {
  if (incoming.type !== 'stdout' && incoming.type !== 'stderr') {
    return -1;
  }

  for (let index = events.length - 1; index >= 0; index--) {
    const candidate = events[index];

    if (candidate.stepIndex !== incoming.stepIndex) {
      continue;
    }

    if (candidate.type === 'step-end' || candidate.type === 'error' || candidate.type === 'complete') {
      break;
    }

    if (candidate.type === incoming.type) {
      return index;
    }
  }

  return -1;
}

export function isCommentaryHeartbeatEvent(value: JSONValue | undefined): boolean {
  return Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (value as Record<string, unknown>).type === 'agent-commentary' &&
    (value as Record<string, unknown>).heartbeat === true,
  );
}

export function isPreviewReadyStepEvent(event: InteractiveStepRunnerEvent): boolean {
  if (event.type !== 'telemetry') {
    return false;
  }

  const description = event.description?.toLowerCase() || '';

  return description.includes('preview verified');
}

export function hasPreviewVerification(stepRunnerEvents: InteractiveStepRunnerEvent[]): boolean {
  for (let index = stepRunnerEvents.length - 1; index >= 0; index--) {
    const event = stepRunnerEvents[index];

    if (isPreviewReadyStepEvent(event)) {
      return true;
    }

    if (event.type === 'step-start' || event.type === 'error') {
      return false;
    }
  }
  return false;
}

function getLatestStepEventTimestamp(
  stepRunnerEvents: InteractiveStepRunnerEvent[],
  predicate: (event: InteractiveStepRunnerEvent) => boolean,
): number {
  for (let index = stepRunnerEvents.length - 1; index >= 0; index -= 1) {
    const event = stepRunnerEvents[index];

    if (!predicate(event)) {
      continue;
    }

    const timestamp = Date.parse(event.timestamp);

    if (Number.isFinite(timestamp)) {
      return timestamp;
    }
  }

  return Number.NEGATIVE_INFINITY;
}

export function hasSettledVerifiedExecution(
  stepRunnerEvents: InteractiveStepRunnerEvent[],
  isStreaming: boolean,
): boolean {
  if (isStreaming || !hasPreviewVerification(stepRunnerEvents)) {
    return false;
  }

  const latestCompletionAt = getLatestStepEventTimestamp(stepRunnerEvents, (event) => event.type === 'complete');
  const latestStartedAt = getLatestStepEventTimestamp(stepRunnerEvents, (event) => event.type === 'step-start');
  const latestErrorAt = getLatestStepEventTimestamp(stepRunnerEvents, (event) => event.type === 'error');

  return (
    Number.isFinite(latestCompletionAt) && latestCompletionAt >= latestStartedAt && latestCompletionAt >= latestErrorAt
  );
}

export function shouldUnlockPromptAfterPreviewReady(
  stepRunnerEvents: InteractiveStepRunnerEvent[],
  meaningfulStallMs: number,
  thresholdMs: number,
  requestStartedAt: number = 0,
): boolean {
  const hasCurrentRequestPreviewVerification = stepRunnerEvents.some((event) => {
    if (!isPreviewReadyStepEvent(event)) {
      return false;
    }

    const eventTimestamp = Date.parse(event.timestamp);

    return Number.isFinite(eventTimestamp) && eventTimestamp >= requestStartedAt;
  });

  return hasCurrentRequestPreviewVerification && meaningfulStallMs >= thresholdMs;
}

export function shouldFinalizeVerifiedPreviewAtDeadline(
  lastPreviewReadyAt: number | null,
  requestStartedAt: number,
  deadlineExceeded: boolean,
): boolean {
  return Boolean(
    deadlineExceeded &&
    lastPreviewReadyAt &&
    Number.isFinite(lastPreviewReadyAt) &&
    lastPreviewReadyAt >= requestStartedAt,
  );
}

export function hasHealthyRuntimePreviewForCurrentObjective(
  workspaceChanged: boolean,
  status:
    | {
        status?: string;
        healthy?: boolean;
        alert?: unknown;
        recovery?: { state?: string } | null;
      }
    | null
    | undefined,
): boolean {
  return Boolean(
    workspaceChanged &&
    status?.status === 'ready' &&
    status.healthy === true &&
    !status.alert &&
    status.recovery?.state !== 'running',
  );
}

export function deriveProgressMessage(
  progressEvents: ProgressAnnotation[],
  stepRunnerEvents: InteractiveStepRunnerEvent[],
): string {
  const current = progressEvents.at(-1);

  if (!current) {
    return 'Idle';
  }

  if (
    current.status === 'complete' &&
    /preview not yet verified/i.test(current.message) &&
    hasPreviewVerification(stepRunnerEvents)
  ) {
    return current.message.replace(/\(preview not yet verified\)/i, '(preview verified)');
  }

  return current.message;
}

export function deriveWhyThisAction(
  commentaryEvents: AgentCommentaryAnnotation[],
  progressEvents: ProgressAnnotation[],
  stepRunnerEvents: InteractiveStepRunnerEvent[],
): string {
  const fallback =
    commentaryEvents
      .filter((event) => event.phase === 'plan' || event.phase === 'action' || event.phase === 'next-step')
      .slice(-1)[0]?.message || 'Waiting for the next planning/action update.';

  const latestProgress = progressEvents.slice(-1)[0];

  if (latestProgress?.status === 'complete' && hasPreviewVerification(stepRunnerEvents)) {
    return 'The preview is live and ready for inspection.';
  }

  return fallback;
}

export function deriveActionCount(
  toolCallCount: number,
  stepRunnerEvents: InteractiveStepRunnerEvent[],
  artifactActionCount: number = 0,
): number {
  const shellActionCount = stepRunnerEvents.filter((event) => event.type === 'step-start').length;
  return Math.max(artifactActionCount, toolCallCount + shellActionCount);
}
