import { describe, expect, it } from 'vitest';
import type { InteractiveStepRunnerEvent } from '@bolt/agent/lib/runtime/interactive-step-runner';
import type { AgentCommentaryAnnotation, ProgressAnnotation } from '@bolt/core/types/context';
import {
  deriveActionCount,
  deriveProgressMessage,
  deriveWhyThisAction,
  hasHealthyRuntimePreviewForCurrentObjective,
  hasPreviewVerification,
  hasSettledVerifiedExecution,
  isCommentaryHeartbeatEvent,
  shouldFinalizeVerifiedPreviewAtDeadline,
  shouldUnlockPromptAfterPreviewReady,
} from './execution-status';

function createTelemetryEvent(output: string, description = 'runtime telemetry'): InteractiveStepRunnerEvent {
  return {
    type: 'telemetry',
    timestamp: new Date().toISOString(),
    description,
    output,
  };
}

describe('execution-status helpers', () => {
  it('detects preview verification from preview-ready telemetry', () => {
    expect(
      hasPreviewVerification([createTelemetryEvent('url=https://localhost:5173 port=5173', 'Preview verified')]),
    ).toBe(true);
  });

  it('settles stale recovery UI only after the latest command completes with a verified preview', () => {
    const startedAt = new Date(Date.now() - 3_000).toISOString();
    const completedAt = new Date(Date.now() - 2_000).toISOString();
    const verifiedAt = new Date(Date.now() - 1_000).toISOString();
    const events: InteractiveStepRunnerEvent[] = [
      {
        type: 'step-start',
        timestamp: startedAt,
        description: 'Start application',
      },
      {
        type: 'step-end',
        timestamp: completedAt,
        description: 'Start application',
        exitCode: 0,
      },
      {
        type: 'complete',
        timestamp: completedAt,
        description: 'All steps complete',
      },
      {
        ...createTelemetryEvent('url=https://localhost:5173 port=5173', 'Preview verified'),
        timestamp: verifiedAt,
      },
    ];

    expect(hasSettledVerifiedExecution(events, false)).toBe(true);
    expect(hasSettledVerifiedExecution(events, true)).toBe(false);
    expect(
      hasSettledVerifiedExecution(
        [
          ...events,
          {
            type: 'error',
            timestamp: new Date().toISOString(),
            description: 'Preview failed after completion',
            error: 'connection refused',
          },
        ],
        false,
      ),
    ).toBe(false);
  });

  it('unlocks the prompt after preview verification once the quiet threshold is reached', () => {
    expect(
      shouldUnlockPromptAfterPreviewReady(
        [createTelemetryEvent('url=https://localhost:5173 port=5173', 'Preview verified')],
        20_000,
        20_000,
      ),
    ).toBe(true);
  });

  it('does not unlock the prompt before preview verification', () => {
    expect(shouldUnlockPromptAfterPreviewReady([], 20_000, 20_000)).toBe(false);
  });

  it('does not abort a follow-up because an earlier request verified its preview', () => {
    const previousPreview = createTelemetryEvent('url=https://localhost:5173 port=5173', 'Preview verified');
    const followUpStartedAt = Date.parse(previousPreview.timestamp) + 1;

    expect(shouldUnlockPromptAfterPreviewReady([previousPreview], 20_000, 20_000, followUpStartedAt)).toBe(false);
  });

  it('finalizes a FREE deadline only when the current request already verified its preview', () => {
    expect(shouldFinalizeVerifiedPreviewAtDeadline(2_000, 1_000, true)).toBe(true);
    expect(shouldFinalizeVerifiedPreviewAtDeadline(900, 1_000, true)).toBe(false);
    expect(shouldFinalizeVerifiedPreviewAtDeadline(2_000, 1_000, false)).toBe(false);
  });

  it('accepts runtime health only after the current user objective changed the workspace', () => {
    const healthyStatus = {
      status: 'ready',
      healthy: true,
      alert: null,
      recovery: { state: 'idle' },
    };

    expect(hasHealthyRuntimePreviewForCurrentObjective(true, healthyStatus)).toBe(true);
    expect(hasHealthyRuntimePreviewForCurrentObjective(false, healthyStatus)).toBe(false);
    expect(
      hasHealthyRuntimePreviewForCurrentObjective(true, {
        ...healthyStatus,
        status: 'repairing',
        recovery: { state: 'running' },
      }),
    ).toBe(false);
  });

  it('upgrades preview pending progress once preview is verified', () => {
    const progressEvents: ProgressAnnotation[] = [
      {
        type: 'progress',
        label: 'response',
        status: 'complete',
        order: 1,
        message: 'Response Generated (preview not yet verified)',
      },
    ];

    expect(
      deriveProgressMessage(progressEvents, [
        createTelemetryEvent('url=https://localhost:5173 port=5173', 'Preview verified'),
      ]),
    ).toBe('Response Generated (preview verified)');
  });

  it('uses the newest progress event instead of a stale in-progress event', () => {
    const progressEvents: ProgressAnnotation[] = [
      {
        type: 'progress',
        label: 'response',
        status: 'in-progress',
        order: 1,
        message: 'Generating Response',
      },
      {
        type: 'progress',
        label: 'response',
        status: 'complete',
        order: 2,
        message: 'Response Generated',
      },
    ];

    expect(deriveProgressMessage(progressEvents, [])).toBe('Response Generated');
  });

  it('identifies commentary heartbeats so they do not hide a stalled runtime', () => {
    expect(
      isCommentaryHeartbeatEvent({
        type: 'agent-commentary',
        heartbeat: true,
        phase: 'action',
        status: 'in-progress',
        order: 2,
        message: 'I am still running pnpm install.',
        timestamp: new Date().toISOString(),
      }),
    ).toBe(true);
    expect(isCommentaryHeartbeatEvent({ type: 'progress', message: 'Generating Response' })).toBe(false);
  });

  it('keeps the original progress text when preview is still pending', () => {
    const progressEvents: ProgressAnnotation[] = [
      {
        type: 'progress',
        label: 'response',
        status: 'complete',
        order: 1,
        message: 'Response Generated (preview not yet verified)',
      },
    ];

    expect(deriveProgressMessage(progressEvents, [])).toBe('Response Generated (preview not yet verified)');
  });

  it('reports preview-ready rationale once the preview is verified', () => {
    const commentaryEvents: AgentCommentaryAnnotation[] = [
      {
        type: 'agent-commentary',
        phase: 'next-step',
        status: 'warning',
        order: 3,
        message: 'Execution finished, but preview verification is still pending.',
        timestamp: new Date().toISOString(),
      },
    ];
    const progressEvents: ProgressAnnotation[] = [
      {
        type: 'progress',
        label: 'response',
        status: 'complete',
        order: 1,
        message: 'Response Generated (preview not yet verified)',
      },
    ];

    expect(
      deriveWhyThisAction(commentaryEvents, progressEvents, [
        createTelemetryEvent('url=https://localhost:5173 port=5173', 'Preview verified'),
      ]),
    ).toBe('The preview is live and ready for inspection.');
  });

  it('does not treat preview session detection as preview verification', () => {
    expect(
      hasPreviewVerification([
        createTelemetryEvent('url=https://localhost:5173 port=5173', 'Preview session available'),
      ]),
    ).toBe(false);
  });

  it('counts shell steps alongside tool calls', () => {
    expect(
      deriveActionCount(1, [
        {
          type: 'step-start',
          timestamp: new Date().toISOString(),
          description: 'Install dependencies',
          command: ['npm', 'install'],
        },
        {
          type: 'step-start',
          timestamp: new Date().toISOString(),
          description: 'Start app',
          command: ['npm', 'run', 'dev'],
        },
      ]),
    ).toBe(3);
  });
});
