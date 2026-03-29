import { describe, expect, it } from 'vitest';
import { AgentRecoveryController } from './agent-recovery';

describe('AgentRecoveryController', () => {
  it('detects repeated tool loops and requests forced finalize recovery', () => {
    const controller = new AgentRecoveryController({
      repeatToolThreshold: 2,
      baseBackoffMs: 100,
      maxBackoffMs: 800,
    });

    expect(controller.analyzeStep([{ toolName: 'web_search', args: { query: 'x' } }], 0)).toBeUndefined();

    const signal = controller.analyzeStep([{ toolName: 'web_search', args: { query: 'x' } }], 0);

    expect(signal?.reason).toBe('repeated-tool-loop');
    expect(signal?.forceFinalize).toBe(true);
    expect(signal?.backoffMs).toBe(100);
  });

  it('detects no-progress streaks and emits recovery signals', () => {
    const controller = new AgentRecoveryController({
      noProgressThreshold: 2,
      baseBackoffMs: 50,
      maxBackoffMs: 400,
    });

    expect(controller.analyzeStep([], 0)).toBeUndefined();

    const signal = controller.analyzeStep([], 0);

    expect(signal?.reason).toBe('no-progress');
    expect(signal?.forceFinalize).toBe(true);
    expect(signal?.backoffMs).toBe(50);
  });

  it('escalates timeout recovery and forces finalize after threshold', () => {
    const controller = new AgentRecoveryController({
      timeoutThreshold: 2,
      baseBackoffMs: 100,
      maxBackoffMs: 1000,
    });

    const first = controller.registerTimeout();
    const second = controller.registerTimeout();

    expect(first.reason).toBe('stream-timeout');
    expect(first.forceFinalize).toBe(false);
    expect(first.backoffMs).toBe(100);

    expect(second.reason).toBe('stream-timeout');
    expect(second.forceFinalize).toBe(true);
    expect(second.backoffMs).toBe(200);
  });
});
