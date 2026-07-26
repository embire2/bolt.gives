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

  it('coalesces repeated stdout/stderr chunks before emitting', async () => {
    const runner = new InteractiveStepRunner({
      async executeStep(_step, context) {
        context.onStdout('hello');
        context.onStdout(' world');
        context.onStderr('warn');
        context.onStderr(': details');

        return {
          exitCode: 0,
          stdout: 'ok',
          stderr: '',
        };
      },
    });
    const streamedEvents: Array<{ type: string; output?: string }> = [];

    runner.addEventListener('event', (event) => {
      const detail = (event as CustomEvent<{ type: string; output?: string }>).detail;

      if (detail.type === 'stdout' || detail.type === 'stderr') {
        streamedEvents.push(detail);
      }
    });

    const result = await runner.run([{ description: 'stream', command: ['echo', 'stream'] }]);
    const stdoutEvents = streamedEvents.filter((event) => event.type === 'stdout');
    const stderrEvents = streamedEvents.filter((event) => event.type === 'stderr');

    expect(result.status).toBe('complete');
    expect(stdoutEvents).toHaveLength(1);
    expect(stderrEvents).toHaveLength(1);
    expect(stdoutEvents[0]?.output).toBe('hello world');
    expect(stderrEvents[0]?.output).toBe('warn: details');
  });

  it('suppresses noisy install progress chatter in streamed stdout events', async () => {
    const runner = new InteractiveStepRunner({
      async executeStep(_step, context) {
        context.onStdout('\u001b[1AProgress: resolved 109, reused 0, downloaded 61, added 0\\r\\n');
        context.onStdout('\u001b[1AProgress: resolved 112, reused 0, downloaded 65, added 0\\r\\n');
        context.onStdout('Done in 11.5s\\r\\n');

        return {
          exitCode: 0,
          stdout: 'Progress: resolved 112, reused 0, downloaded 65, added 0\\nDone in 11.5s',
          stderr: '',
        };
      },
    });
    const stdoutEvents: Array<{ type: string; output?: string }> = [];
    const stepEndEvents: Array<{ type: string; output?: string }> = [];

    runner.addEventListener('event', (event) => {
      const detail = (event as CustomEvent<{ type: string; output?: string }>).detail;

      if (detail.type === 'stdout') {
        stdoutEvents.push(detail);
      }

      if (detail.type === 'step-end') {
        stepEndEvents.push(detail);
      }
    });

    const result = await runner.run([{ description: 'install', command: ['pnpm', 'install'] }]);

    expect(result.status).toBe('complete');
    expect(stdoutEvents).toHaveLength(1);
    expect(stdoutEvents[0]?.output).toContain('[progress] Progress: resolved 112');
    expect(stepEndEvents[0]?.output).toContain('Done in 11.5s');
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

  it('turns an undefined executor result into a normal failed step', async () => {
    const { runner, events } = createRunner({
      async executeStep() {
        return undefined as any;
      },
    });

    const result = await runner.run([{ description: 'missing-result', command: ['echo', 'oops'] }]);

    expect(result.status).toBe('error');
    expect(result.failedStepIndex).toBe(0);
    expect(result.error).toBe('Step executor returned no result.');
    expect(events).toEqual(['step-start', 'error']);
  });
});
