import type { AgentCommentaryPhase } from '~/types/context';
import { getCommentaryPoolMessage } from '~/lib/runtime/commentary-pool.generated';

export const COMMENTARY_HEARTBEAT_INTERVAL_MS = 60_000;

const NEXT_STEP_BY_PHASE: Record<AgentCommentaryPhase, string> = {
  plan: 'I am narrowing the plan down to the next concrete action.',
  action: 'I am still executing the current step and will post the next visible result shortly.',
  verification: 'I am checking the latest output before I move on.',
  'next-step': 'I am packaging the next visible result for you now.',
  recovery: 'I am recovering from the latest issue and will confirm the outcome next.',
};

function formatElapsed(elapsedMs: number): string {
  const elapsedSeconds = Math.max(1, Math.floor(elapsedMs / 1000));
  const minutes = Math.max(1, Math.floor(elapsedSeconds / 60));

  return `${minutes} minute${minutes === 1 ? '' : 's'}`;
}

export function buildCommentaryHeartbeat(
  elapsedMs: number,
  lastPhase: AgentCommentaryPhase,
): {
  phase: AgentCommentaryPhase;
  message: string;
  detail: string;
} {
  const phase = lastPhase === 'recovery' ? 'recovery' : 'action';
  const elapsed = formatElapsed(elapsedMs);
  const heartbeatIndex = Math.max(1, Math.floor(elapsedMs / COMMENTARY_HEARTBEAT_INTERVAL_MS));
  const message = getCommentaryPoolMessage(
    phase,
    heartbeatIndex,
    'Still working on your request and checking each result.',
  );

  return {
    phase,
    message,
    detail: `Key changes: Work is still in progress after ${elapsed}; I am keeping the current run alive and checking each new result.
Next: ${NEXT_STEP_BY_PHASE[phase]}`,
  };
}
