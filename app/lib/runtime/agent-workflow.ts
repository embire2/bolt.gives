import type { ProviderInfo } from '~/types/model';
import {
  InteractiveStepRunner,
  type InteractiveStep,
  type StepExecutor,
  type InteractiveStepRunnerEvent,
} from './interactive-step-runner';

export type AgentMode = 'chat' | 'plan' | 'act';

export interface AgentPlanStep extends InteractiveStep {
  id: number;
  approved: boolean;
}

export function parsePlanSteps(rawPlan: string): AgentPlanStep[] {
  const lines = rawPlan
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const steps: AgentPlanStep[] = [];

  lines.forEach((line) => {
    const numbered = line.match(/^(\d+)[.)]\s+(.*)$/);

    if (!numbered) {
      return;
    }

    const id = Number(numbered[1]);
    const remainder = numbered[2];
    const commandMatch = remainder.match(/command\s*:\s*`([^`]+)`/i);
    const commandString = commandMatch?.[1]?.trim() || '';
    const description = remainder.replace(/command\s*:\s*`[^`]+`/i, '').trim() || remainder.trim();

    steps.push({
      id,
      approved: true,
      description,
      command: commandString.length > 0 ? commandString.split(/\s+/).filter(Boolean) : [],
    });
  });

  return steps;
}

export async function generatePlanSteps(options: {
  goal: string;
  model: string;
  provider: ProviderInfo;
}): Promise<AgentPlanStep[]> {
  const prompt = [
    'Create an execution plan for this goal:',
    '',
    options.goal,
    '',
    'Return a clear, actionable numbered list.',
    'For steps that require a shell command, include: command: `...`',
    'Prefer one command per step, suitable for a pnpm-based Node project workspace.',
  ].join('\n');

  const response = await fetch('/api/llmcall', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      system:
        'You are an execution planner. Return concise steps as a numbered list. Prefer commands that can run in a Node project workspace.',
      message: prompt,
      model: options.model,
      provider: options.provider,
      streamOutput: false,
    }),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const data = (await response.json()) as { text?: string };

  return parsePlanSteps(data.text || '');
}

export async function executeApprovedPlanSteps(options: {
  steps: AgentPlanStep[];
  executor: StepExecutor;
  onEvent?: (event: InteractiveStepRunnerEvent) => void;
  onCheckpoint?: (step: AgentPlanStep) => Promise<'continue' | 'stop' | 'revert'>;
  socket?: Pick<WebSocket, 'readyState' | 'send'>;
}): Promise<'complete' | 'stopped' | 'reverted'> {
  const approvedSteps = options.steps.filter((step) => step.approved && step.command.length > 0);

  for (const step of approvedSteps) {
    const runner = new InteractiveStepRunner(options.executor, options.socket);

    runner.addEventListener('event', (event) => {
      options.onEvent?.((event as CustomEvent<InteractiveStepRunnerEvent>).detail);
    });

    const runResult = await runner.run([step]);

    if (runResult.status === 'error') {
      return 'stopped';
    }

    const decision = (await options.onCheckpoint?.(step)) || 'continue';

    if (decision === 'revert') {
      return 'reverted';
    }

    if (decision === 'stop') {
      return 'stopped';
    }
  }

  return 'complete';
}
