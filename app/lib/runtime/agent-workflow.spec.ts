import { afterEach, describe, expect, it, vi } from 'vitest';
import { executeApprovedPlanSteps, generatePlanSteps, parsePlanSteps, type AgentPlanStep } from './agent-workflow';
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

describe('parsePlanSteps', () => {
  it('parses a numbered plan with command backticks', () => {
    const raw = [
      '1. install deps command: `pnpm install`',
      '2) run tests command:`pnpm test`',
      '3. describe outcome (no command)',
    ].join('\n');

    const steps = parsePlanSteps(raw);

    expect(steps.map((s) => s.id)).toEqual([1, 2, 3]);
    expect(steps[0]?.command).toEqual(['pnpm', 'install']);
    expect(steps[1]?.command).toEqual(['pnpm', 'test']);
    expect(steps[2]?.command).toEqual([]);
  });
});

describe('generatePlanSteps', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('posts to /api/llmcall and parses returned plan text', async () => {
    const fetchSpy = vi.fn(async (input: any, init?: any) => {
      expect(String(input)).toBe('/api/llmcall');
      expect(init?.method).toBe('POST');

      const body = JSON.parse(init?.body ?? '{}');
      expect(body.message).toContain('Return a clear, actionable numbered list.');
      expect(body.message).toContain('my goal');

      return new Response(
        JSON.stringify({
          text: '1. run tests command: `pnpm test`',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });

    vi.stubGlobal('fetch', fetchSpy as any);

    const steps = await generatePlanSteps({
      goal: 'my goal',
      model: 'test-model',
      provider: { name: 'test-provider' } as any,
    });

    expect(steps).toHaveLength(1);
    expect(steps[0]?.command).toEqual(['pnpm', 'test']);
  });

  it('throws when /api/llmcall fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('boom', { status: 500 })) as any);

    await expect(
      generatePlanSteps({
        goal: 'x',
        model: 'test-model',
        provider: { name: 'test-provider' } as any,
      }),
    ).rejects.toThrow(/boom/);
  });
});
