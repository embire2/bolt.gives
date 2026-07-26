import { describe, expect, it } from 'vitest';
import { extractCheckpointEvents, extractExecutionFailure } from './checkpoint-events';

describe('extractCheckpointEvents', () => {
  it('emits install checkpoint from install commands', () => {
    const events = extractCheckpointEvents({
      toolCalls: [
        {
          toolName: 'shell',
          toolCallId: '1',
          args: { command: 'pnpm install' },
        },
      ],
      toolResults: [
        {
          toolName: 'shell',
          toolCallId: '1',
          result: { exitCode: 0, output: 'Done in 12s' },
        },
      ],
    });

    expect(events.some((event) => event.checkpointType === 'install-done')).toBe(true);
    expect(events.some((event) => event.checkpointType === 'checkpoint')).toBe(true);
  });

  it('marks checkpoint as error when command exits non-zero', () => {
    const events = extractCheckpointEvents({
      toolCalls: [
        {
          toolName: 'deploy',
          toolCallId: '2',
          args: { command: 'pnpm exec wrangler pages deploy' },
        },
      ],
      toolResults: [
        {
          toolName: 'deploy',
          toolCallId: '2',
          result: { exitCode: 1, stderr: 'Authentication error' },
        },
      ],
    });

    const deployEvent = events.find((event) => event.checkpointType === 'deploy-result');
    expect(deployEvent?.status).toBe('error');
    expect(deployEvent?.exitCode).toBe(1);
  });
});

describe('extractExecutionFailure', () => {
  it('returns command + exit code + stderr for the first failing result', () => {
    const failure = extractExecutionFailure({
      toolCalls: [
        {
          toolName: 'shell',
          toolCallId: '3',
          args: { command: 'pnpm run test' },
        },
      ],
      toolResults: [
        {
          toolName: 'shell',
          toolCallId: '3',
          result: { exitCode: 2, stderr: 'test failed' },
        },
      ],
    });

    expect(failure).toEqual({
      toolName: 'shell',
      command: 'pnpm run test',
      exitCode: 2,
      stderr: 'test failed',
    });
  });
});
