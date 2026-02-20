import type { AgentCommentaryPhase } from '~/types/context';

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

  return {
    phase,
    message: 'Still working on your request and checking each result.',
    detail: `Key changes: Work is still in progress (${elapsed} elapsed).
Next: I will share the next visible update within 60 seconds.`,
  };
}
