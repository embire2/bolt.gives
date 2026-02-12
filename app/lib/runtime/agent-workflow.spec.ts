import { describe, expect, it, vi } from 'vitest';
import { executeApprovedPlanSteps, type AgentPlanStep } from './agent-workflow';
import type { StepExecutionContext } from './interactive-step-runner';

function createStep(id: number, description: string, command: string[]): AgentPlanStep {
  return {
    id,
    description,
    command,
    approved: true,
  };
}

describe('executeApprovedPlanSteps', () => {
  it('stops immediately when a step fails and does not run later steps', async () => {
    const executed: string[] = [];
    const checkpoint = vi.fn();

    const result = await executeApprovedPlanSteps({
      steps: [createStep(1, 'fails', ['bad']), createStep(2, 'skip', ['echo', 'ok'])],
      executor: {
        async executeStep(step, _context: StepExecutionContext) {
          executed.push(step.description);

          return {
            exitCode: 1,
            stdout: '',
            stderr: 'command failed',
          };
        },
      },
      onCheckpoint: checkpoint,
    });

    expect(result).toBe('stopped');
    expect(executed).toEqual(['fails']);
    expect(checkpoint).not.toHaveBeenCalled();
  });

  it('supports stop decision at checkpoint after successful step', async () => {
    const executed: string[] = [];

    const result = await executeApprovedPlanSteps({
      steps: [createStep(1, 'first', ['echo', 'first']), createStep(2, 'second', ['echo', 'second'])],
      executor: {
        async executeStep(step) {
          executed.push(step.description);

          return {
            exitCode: 0,
            stdout: 'ok',
            stderr: '',
          };
        },
      },
      onCheckpoint: async () => 'stop',
    });

    expect(result).toBe('stopped');
    expect(executed).toEqual(['first']);
  });

  it('supports revert decision at checkpoint', async () => {
    const result = await executeApprovedPlanSteps({
      steps: [createStep(1, 'first', ['echo', 'first'])],
      executor: {
        async executeStep() {
          return {
            exitCode: 0,
            stdout: 'ok',
            stderr: '',
          };
        },
      },
      onCheckpoint: async () => 'revert',
    });

    expect(result).toBe('reverted');
  });
});
