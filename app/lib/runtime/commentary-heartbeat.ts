import type { AgentCommentaryPhase } from '~/types/context';
export const COMMENTARY_HEARTBEAT_INTERVAL_MS = 60_000;

const NEXT_STEP_BY_PHASE: Record<AgentCommentaryPhase, string> = {
  plan: 'I will keep following the next planning event that the runtime emits.',
  action: 'I will keep following the next command or file event that the runtime emits.',
  verification: 'I will keep following the next verification event that the runtime emits.',
  'next-step': 'I will keep following the next completion event that the runtime emits.',
  recovery: 'I will keep following the next recovery event that the runtime emits.',
};

function formatElapsed(elapsedMs: number): string {
  const elapsedSeconds = Math.max(1, Math.floor(elapsedMs / 1000));
  const minutes = Math.max(1, Math.floor(elapsedSeconds / 60));

  return `${minutes} minute${minutes === 1 ? '' : 's'}`;
}

function summarizeGoal(goal: string | undefined): string | null {
  const normalized = String(goal || '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) {
    return null;
  }

  return normalized.length > 96 ? `${normalized.slice(0, 93).trimEnd()}...` : normalized;
}

function summarizeCommandStep(currentStep: string): string | null {
  const normalized = currentStep.replace(/\s+/g, ' ').trim();

  if (!normalized) {
    return null;
  }

  const quotedCommand =
    normalized.match(/(?:Run|Running|Command|Executing)\s+(?:shell\s+command:\s+)?(.+)$/i)?.[1]?.trim() ||
    normalized.match(/(?:pnpm|npm|vite|npx|node|yarn)\s+.+$/i)?.[0]?.trim() ||
    null;

  if (quotedCommand) {
    return `I am still running ${quotedCommand} and watching for the next visible output.`;
  }

  const fileMatch =
    normalized.match(/(?:writing|updating|editing|patching|saving)\s+([A-Za-z0-9_./-]+\.[A-Za-z0-9]+)/i)?.[1] ||
    normalized.match(/\b(src\/[A-Za-z0-9_./-]+\.[A-Za-z0-9]+|app\/[A-Za-z0-9_./-]+\.[A-Za-z0-9]+)\b/)?.[1] ||
    null;

  if (fileMatch) {
    return `I am updating ${fileMatch} now and checking the result before I move on.`;
  }

  return null;
}

function summarizeCurrentStep(currentStep: string, phase: AgentCommentaryPhase): string | null {
  const normalized = currentStep.replace(/\s+/g, ' ').trim();

  if (!normalized) {
    return null;
  }

  return phase === 'recovery'
    ? `I am processing the recovery step: ${normalized}.`
    : `I am processing the current runtime step: ${normalized}.`;
}

function summarizeLastVisibleResult(lastVisibleResult: string): string | null {
  const normalized = lastVisibleResult.replace(/\s+/g, ' ').trim();

  if (!normalized) {
    return null;
  }

  const commandResult =
    normalized.match(/(?:pnpm|npm|vite|npx|node|yarn)\s+.+?(?:exit\s+\d+|done|ready|failed)/i)?.[0] || null;

  if (commandResult) {
    return commandResult;
  }

  return normalized.length > 120 ? `${normalized.slice(0, 117).trimEnd()}...` : normalized;
}

export function buildCommentaryHeartbeat(
  elapsedMs: number,
  lastPhase: AgentCommentaryPhase,
  context?: {
    goal?: string;
    currentStep?: string;
    lastVisibleResult?: string;
  },
): {
  phase: AgentCommentaryPhase;
  message: string;
  detail: string;
} {
  const phase = lastPhase === 'recovery' ? 'recovery' : 'action';
  const elapsed = formatElapsed(elapsedMs);
  const goal = summarizeGoal(context?.goal);
  const currentStep = String(context?.currentStep || '')
    .replace(/\s+/g, ' ')
    .trim();
  const lastVisibleResult = String(context?.lastVisibleResult || '')
    .replace(/\s+/g, ' ')
    .trim();
  const summarizedLastVisibleResult = summarizeLastVisibleResult(lastVisibleResult);
  const message =
    summarizeCommandStep(currentStep) ||
    summarizeCurrentStep(currentStep, phase) ||
    (summarizedLastVisibleResult
      ? `The latest runtime output is: ${summarizedLastVisibleResult}.`
      : goal
        ? `No new runtime event has landed yet while I work on ${goal}.`
        : 'No new runtime event has landed yet; I am waiting for the next visible step.');
  const keyChanges = currentStep
    ? `Runtime is still active after ${elapsed}. Current step: ${currentStep}.`
    : summarizedLastVisibleResult
      ? `Runtime is still active after ${elapsed}. Latest visible result: ${summarizedLastVisibleResult}.`
      : goal
        ? `Runtime is still active after ${elapsed}. Current goal: ${goal}.`
        : `Runtime is still active after ${elapsed}. No new command or file event has landed yet.`;
  const nextStep = summarizedLastVisibleResult
    ? `${NEXT_STEP_BY_PHASE[phase]} Latest visible result: ${summarizedLastVisibleResult}.`
    : NEXT_STEP_BY_PHASE[phase];

  return {
    phase,
    message,
    detail: `Key changes: ${keyChanges}
Next: ${nextStep}`,
  };
}
