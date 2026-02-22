import type { AgentCommentaryPhase } from '~/types/context';
import { getCommentaryPoolMessage } from '~/lib/runtime/commentary-pool.generated';

export const COMMENTARY_HEARTBEAT_INTERVAL_MS = 60_000;

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
    detail: `Key changes: Work is still in progress (${elapsed} elapsed).
Next: I will share the next visible update within 60 seconds.`,
  };
}
