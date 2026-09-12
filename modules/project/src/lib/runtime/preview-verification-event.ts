import type { InteractiveStepRunnerEvent } from '@bolt/agent/lib/runtime/interactive-step-runner';
import type { HostedRuntimePreviewSummary } from '@bolt/runtime/lib/runtime/hosted-runtime-client';

/** Display-only health. Never emit an agent-completion signal from background polling. */
export function recordPreviewVerification(
  status: Pick<HostedRuntimePreviewSummary, 'healthy' | 'status' | 'preview' | 'alert' | 'recovery'>,
  store: { get(): InteractiveStepRunnerEvent[]; set(events: InteractiveStepRunnerEvent[]): void },
  hasBrowserAlert: boolean,
) {
  const events = store.get();

  const latestCommand = [...events].reverse().find((event) => ['step-start', 'step-end', 'error'].includes(event.type));

  if (latestCommand?.type === 'step-start' || latestCommand?.type === 'error') {
    return;
  }

  const healthy =
    status.status === 'ready' &&
    status.healthy &&
    status.preview &&
    !status.alert &&
    !hasBrowserAlert &&
    status.recovery?.state !== 'running';
  const description = healthy ? 'Preview health confirmed' : 'Preview health unavailable';
  const output = `port=${status.preview?.port || 0} revision=${status.preview?.revision || 0}`;
  const previous = events.at(-1);

  if (previous?.description === description && previous.output === output) {
    return;
  }

  store.set([...events.slice(-199), { type: 'telemetry', timestamp: new Date().toISOString(), description, output }]);
}
