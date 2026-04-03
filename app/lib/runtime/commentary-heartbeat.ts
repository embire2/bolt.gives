import type { AgentCommentaryPhase } from '~/types/context';
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

function summarizeGoal(goal: string | undefined): string | null {
  const normalized = String(goal || '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) {
    return null;
  }

  return normalized.length > 96 ? `${normalized.slice(0, 93).trimEnd()}...` : normalized;
}

function buildContextualHeartbeatMessage(options: {
  goal: string | null;
  currentStep: string;
  phase: AgentCommentaryPhase;
  heartbeatIndex: number;
}): string | null {
  const { goal, currentStep, phase, heartbeatIndex } = options;
  const currentStepSummary = currentStep || (goal ? `moving ${goal} forward` : '');

  if (!goal && !currentStepSummary) {
    return null;
  }

  const variantsByPhase: Record<AgentCommentaryPhase, string[]> = {
    plan: [
      goal
        ? `I am mapping ${goal} into concrete implementation steps.`
        : 'I am mapping the request into concrete implementation steps.',
      currentStepSummary
        ? `I am focusing the plan around ${currentStepSummary}.`
        : goal
          ? `I am choosing the safest sequence for ${goal}.`
          : 'I am choosing the safest execution sequence.',
      goal
        ? `I am tightening the plan for ${goal} so the next action is unambiguous.`
        : 'I am tightening the plan so the next action is unambiguous.',
    ],
    action: [
      currentStepSummary
        ? `I am executing ${currentStepSummary} now and checking the output as it arrives.`
        : goal
          ? `I am implementing ${goal} now and checking the output as it arrives.`
          : 'I am implementing the current step now and checking the output as it arrives.',
      currentStepSummary
        ? `I am still working through ${currentStepSummary}; I will post the next visible result as soon as it lands.`
        : goal
          ? `I am still working through ${goal}; I will post the next visible result as soon as it lands.`
          : 'I am still working through the current step; I will post the next visible result as soon as it lands.',
      currentStepSummary
        ? `I am keeping ${currentStepSummary} moving and validating each change before I advance.`
        : goal
          ? `I am keeping ${goal} moving and validating each change before I advance.`
          : 'I am keeping the current task moving and validating each change before I advance.',
    ],
    verification: [
      currentStepSummary
        ? `I am verifying ${currentStepSummary} against the current output.`
        : 'I am verifying the latest output before I move on.',
      goal
        ? `I am checking that the latest result still matches ${goal}.`
        : 'I am checking that the latest result still matches the request.',
      'I am running a verification pass before I move to the next step.',
    ],
    'next-step': [
      goal ? `I am packaging the latest result for ${goal}.` : 'I am packaging the latest result now.',
      currentStepSummary
        ? `I am wrapping up ${currentStepSummary} and preparing the next visible step.`
        : 'I am wrapping up the current step and preparing the next visible step.',
      'I am preparing the next visible update now.',
    ],
    recovery: [
      currentStepSummary
        ? `I am recovering ${currentStepSummary} after the last issue.`
        : 'I am recovering from the last issue.',
      goal
        ? `I am restoring forward progress on ${goal} after the latest failure.`
        : 'I am restoring forward progress after the latest failure.',
      'I am applying a recovery step and will confirm the outcome next.',
    ],
  };

  const variants = variantsByPhase[phase] || variantsByPhase.action;

  return variants[(heartbeatIndex - 1) % variants.length] || variants[0];
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
  const heartbeatIndex = Math.max(1, Math.floor(elapsedMs / COMMENTARY_HEARTBEAT_INTERVAL_MS));
  const goal = summarizeGoal(context?.goal);
  const currentStep = String(context?.currentStep || '')
    .replace(/\s+/g, ' ')
    .trim();
  const lastVisibleResult = String(context?.lastVisibleResult || '')
    .replace(/\s+/g, ' ')
    .trim();
  const message =
    summarizeCommandStep(currentStep) ||
    buildContextualHeartbeatMessage({
      goal,
      currentStep,
      phase,
      heartbeatIndex,
    }) ||
    (goal
      ? `I am still moving ${goal} forward and checking each visible result as it lands.`
      : 'I am still moving the request forward and checking each visible result as it lands.');
  const keyChanges = currentStep
    ? `Work is still in progress after ${elapsed}. Current focus: ${currentStep}.`
    : `Work is still in progress after ${elapsed}.`;
  const summarizedLastVisibleResult = summarizeLastVisibleResult(lastVisibleResult);
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
