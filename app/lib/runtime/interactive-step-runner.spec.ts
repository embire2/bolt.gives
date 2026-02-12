import { describe, expect, it } from 'vitest';
import { InteractiveStepRunner, type InteractiveStep, type StepExecutor } from './interactive-step-runner';

function createRunner(executor: StepExecutor) {
  const runner = new InteractiveStepRunner(executor);
  const events: string[] = [];

  runner.addEventListener('event', (event) => {
    const detail = (event as CustomEvent<{ type: string }>).detail;
    events.push(detail.type);
  });

  return { runner, events };
}

describe('InteractiveStepRunner', () => {
  it('emits start/stream/end events and completes successfully', async () => {
    const steps: InteractiveStep[] = [
      { description: 'first step', command: ['echo', 'first'] },
      { description: 'second step', command: ['echo', 'second'] },
    ];

    const { runner, events } = createRunner({
      async executeStep(step, context) {
        context.onStdout(`stdout:${step.description}`);
        context.onStderr(`stderr:${step.description}`);

        return {
          exitCode: 0,
          stdout: 'ok',
          stderr: '',
        };
      },
    });

    const result = await runner.run(steps);

    expect(result.status).toBe('complete');
    expect(events.filter((type) => type === 'step-start')).toHaveLength(2);
    expect(events.filter((type) => type === 'stdout')).toHaveLength(2);
    expect(events.filter((type) => type === 'stderr')).toHaveLength(2);
    expect(events.filter((type) => type === 'step-end')).toHaveLength(2);
    expect(events.at(-1)).toBe('complete');
  });

  it('streams structured events over an open websocket connection', async () => {
    const sentEvents: Array<{ type: string }> = [];
    const socket = {
      readyState: 1,
      send(payload: string) {
        sentEvents.push(JSON.parse(payload) as { type: string });
      },
    };

    const runner = new InteractiveStepRunner(
      {
        async executeStep(_step, context) {
          context.onStdout('hello');
          context.onStderr('warn');

          return {
            exitCode: 0,
            stdout: 'ok',
            stderr: '',
          };
        },
      },
      socket,
    );

    const result = await runner.run([{ description: 'stream', command: ['echo', 'stream'] }]);

    expect(result.status).toBe('complete');
    expect(sentEvents.map((event) => event.type)).toEqual(['step-start', 'stdout', 'stderr', 'step-end', 'complete']);
  });

  it('stops immediately on non-zero exit code and emits error', async () => {
    let executions = 0;
    const { runner, events } = createRunner({
      async executeStep() {
        executions += 1;

        return {
          exitCode: 17,
          stdout: 'failed',
          stderr: 'failed',
        };
      },
    });

    const result = await runner.run([
      { description: 'fails', command: ['false'] },
      { description: 'should-not-run', command: ['echo', 'skip'] },
    ]);

    expect(executions).toBe(1);
    expect(result.status).toBe('error');
    expect(result.failedStepIndex).toBe(0);
    expect(result.exitCode).toBe(17);
    expect(events).toEqual(['step-start', 'step-end', 'error']);
  });

  it('stops immediately when executor throws', async () => {
    const { runner, events } = createRunner({
      async executeStep() {
        throw new Error('boom');
      },
    });

    const result = await runner.run([{ description: 'throws', command: ['explode'] }]);

    expect(result.status).toBe('error');
    expect(result.failedStepIndex).toBe(0);
    expect(result.error).toBe('boom');
    expect(events).toEqual(['step-start', 'error']);
  });
});
