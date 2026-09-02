import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActionCallbackData } from '@bolt/agent/lib/runtime/message-parser';
import { ActionRunner } from './action-runner';

const hostedRuntimeMocks = vi.hoisted(() => ({
  isHostedRuntimeEnabled: vi.fn(() => false),
}));

vi.mock('@bolt/runtime/lib/runtime/hosted-runtime-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@bolt/runtime/lib/runtime/hosted-runtime-client')>()),
  isHostedRuntimeEnabled: hostedRuntimeMocks.isHostedRuntimeEnabled,
}));

describe('ActionRunner ready Preview reuse', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    hostedRuntimeMocks.isHostedRuntimeEnabled.mockReturnValue(false);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('completes a duplicate local start without interrupting the healthy Preview process', async () => {
    const executeCommand = vi.fn();
    const onStepRunnerEvent = vi.fn();
    const shell = {
      ready: vi.fn().mockResolvedValue(undefined),
      terminal: {},
      process: {},
      executeCommand,
    };
    const runner = new ActionRunner(
      Promise.resolve({ workdir: '/home/project' }) as any,
      () => shell as any,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      onStepRunnerEvent,
      undefined,
      () => true,
    );
    const data: ActionCallbackData = {
      artifactId: 'artifact-ready',
      messageId: 'message-ready',
      actionId: 'start-ready',
      action: { type: 'start', content: 'pnpm run dev' },
    };

    await runner.addAction(data);
    await runner.runAction(data);

    expect(executeCommand).not.toHaveBeenCalled();
    expect(runner.actions.get()['start-ready']).toMatchObject({ status: 'complete', executed: true });
    expect(onStepRunnerEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'telemetry',
        description: 'Healthy Preview reused',
        output: 'Skipped duplicate local start: pnpm run dev',
      }),
    );
  });
});
