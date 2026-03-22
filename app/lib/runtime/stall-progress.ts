import type { InteractiveStepRunnerEvent } from './interactive-step-runner';

const NON_PROGRESS_ERROR_DESCRIPTIONS = new Set([
  'Potential stall detected',
  'Starter bootstrap stalled; forcing continuation',
  'Auto-recovery triggered for stalled stream',
]);

export function isProgressBearingStepEvent(event: InteractiveStepRunnerEvent): boolean {
  if (event.type === 'telemetry') {
    return false;
  }

  if (event.type === 'error') {
    const normalizedDescription = (event.description || '').trim();

    return !NON_PROGRESS_ERROR_DESCRIPTIONS.has(normalizedDescription);
  }

  return true;
}

export function getLastMeaningfulProgressTimestamp(
  events: InteractiveStepRunnerEvent[],
  fallbackTimestamp: number,
  additionalTimestamps: number[] = [],
): number {
  const latestProgressEvent = [...events].reverse().find((event) => isProgressBearingStepEvent(event));
  const candidateTimestamps = [
    latestProgressEvent ? new Date(latestProgressEvent.timestamp).getTime() : fallbackTimestamp,
    fallbackTimestamp,
    ...additionalTimestamps,
  ].filter((timestamp) => Number.isFinite(timestamp));

  const rawTimestamp = candidateTimestamps.length > 0 ? Math.max(...candidateTimestamps) : fallbackTimestamp;

  if (!Number.isFinite(rawTimestamp)) {
    return fallbackTimestamp;
  }

  return rawTimestamp;
}
