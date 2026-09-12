import type { AgentCommentaryPhase } from '@bolt/core/types/context';
export const COMMENTARY_HEARTBEAT_INTERVAL_MS = 10_000;

export function createCommentaryHeartbeatReporter() {
  let lastResult = '';

  return (...args: Parameters<typeof buildCommentaryHeartbeat>) => {
    const result = args[2]?.lastVisibleResult || '';

    if (result === lastResult) {
      return null;
    }

    const heartbeat = buildCommentaryHeartbeat(...args);

    if (heartbeat) {
      lastResult = result;
    }

    return heartbeat;
  };
}

export function buildCommentaryHeartbeat(
  _elapsedMs: number,
  phase: AgentCommentaryPhase,
  context?: { goal?: string; currentStep?: string; lastVisibleResult?: string },
): { phase: AgentCommentaryPhase; message: string; detail: string } | null {
  const result = String(context?.lastVisibleResult || '')
    .replace(/\s+/g, ' ')
    .trim();
  const step = String(context?.currentStep || '')
    .replace(/\s+/g, ' ')
    .trim();

  // A timer is not evidence that a command is still running or that a repair began.
  if (!result || phase === 'next-step') {
    return null;
  }

  return {
    phase,
    message: `Latest reported result: ${result}`,
    detail: `Key changes: Latest visible result: ${result}\nNext: ${step || 'Awaiting a new runtime event.'}`,
  };
}
