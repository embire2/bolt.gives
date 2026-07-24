import { describe, expect, it } from 'vitest';
import type { InteractiveStepRunnerEvent } from '~/lib/runtime/interactive-step-runner';
import type { AgentCommentaryAnnotation, ProgressAnnotation } from '~/types/context';
import {
  deriveActionCount,
  deriveProgressMessage,
  deriveWhyThisAction,
  hasPreviewVerification,
  isCommentaryHeartbeatEvent,
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
