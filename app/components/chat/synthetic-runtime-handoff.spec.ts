import type { Message } from 'ai';
import { describe, expect, it } from 'vitest';
import type { SyntheticRunHandoffDataEvent } from '~/types/context';
import {
  selectSyntheticRuntimeHandoffCandidate,
  shouldApplySyntheticRuntimeHandoff,
} from './synthetic-runtime-handoff';

function buildEvent(overrides: Partial<SyntheticRunHandoffDataEvent> = {}): SyntheticRunHandoffDataEvent {
  return {
    type: 'synthetic-run-handoff',
    handoffId: 'handoff-1',
    messageId: 'message-1',
    reason: 'run-intent-without-start',
    startCommand: 'pnpm run dev',
    assistantContent: '<boltArtifact id="runtime-handoff" title="Runtime Handoff"></boltArtifact>',
    timestamp: '2026-04-23T00:00:00.000Z',
    ...overrides,
  };
}

describe('shouldApplySyntheticRuntimeHandoff', () => {
  it('retains a pending handoff when the latest chat data has already been cleared', () => {
    const pendingEvent = buildEvent({ handoffId: 'handoff-pending' });

    expect(
      selectSyntheticRuntimeHandoffCandidate({
        latestEvent: null,
        pendingEvent,
      }),
    ).toBe(pendingEvent);
  });

  it('waits until chat streaming has finished before applying the handoff', () => {
    expect(
      shouldApplySyntheticRuntimeHandoff({
        event: buildEvent(),
        appliedHandoffIds: new Set(),
        messages: [],
        isLoading: true,
        fakeLoading: true,
      }),
    ).toBe(false);
  });

  it('skips already applied handoffs', () => {
    expect(
      shouldApplySyntheticRuntimeHandoff({
        event: buildEvent(),
        appliedHandoffIds: new Set(['handoff-1']),
        messages: [],
        isLoading: false,
        fakeLoading: false,
      }),
    ).toBe(false);
  });

  it('skips handoffs whose synthetic assistant message already exists', () => {
    const messages: Pick<Message, 'id'>[] = [{ id: 'message-1' }];

    expect(
      shouldApplySyntheticRuntimeHandoff({
        event: buildEvent(),
        appliedHandoffIds: new Set(),
        messages,
        isLoading: false,
        fakeLoading: false,
      }),
    ).toBe(false);
  });
});
