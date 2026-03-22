import type { InteractiveStepRunnerEvent } from '~/lib/runtime/interactive-step-runner';
import type { AgentCommentaryAnnotation, ProgressAnnotation } from '~/types/context';

export function isPreviewReadyStepEvent(event: InteractiveStepRunnerEvent): boolean {
  if (event.type !== 'telemetry') {
    return false;
  }

  const description = event.description?.toLowerCase() || '';
  const output = event.output?.toLowerCase() || '';

  return description.includes('preview ready') || output.includes('(port ');
}

export function hasPreviewVerification(stepRunnerEvents: InteractiveStepRunnerEvent[]): boolean {
  return stepRunnerEvents.some(isPreviewReadyStepEvent);
}

export function deriveProgressMessage(
  progressEvents: ProgressAnnotation[],
  stepRunnerEvents: InteractiveStepRunnerEvent[],
): string {
  const current =
    progressEvents.filter((event) => event.status === 'in-progress').slice(-1)[0] || progressEvents.slice(-1)[0];

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

export function deriveActionCount(toolCallCount: number, stepRunnerEvents: InteractiveStepRunnerEvent[]): number {
  const shellActionCount = stepRunnerEvents.filter((event) => event.type === 'step-start').length;
  return toolCallCount + shellActionCount;
}
