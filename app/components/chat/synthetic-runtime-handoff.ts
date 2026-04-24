import type { Message } from 'ai';
import type { SyntheticRunHandoffDataEvent } from '~/types/context';

export function selectSyntheticRuntimeHandoffCandidate(options: {
  latestEvent: SyntheticRunHandoffDataEvent | null | undefined;
  pendingEvent: SyntheticRunHandoffDataEvent | null | undefined;
}) {
  return options.latestEvent || options.pendingEvent || null;
}

export function shouldApplySyntheticRuntimeHandoff(options: {
  event: SyntheticRunHandoffDataEvent | null | undefined;
  appliedHandoffIds: ReadonlySet<string>;
  messages: Pick<Message, 'id'>[];
  isLoading: boolean;
  fakeLoading: boolean;
}) {
  const { event, appliedHandoffIds, messages, isLoading, fakeLoading } = options;

  if (!event) {
    return false;
  }

  if (isLoading || fakeLoading) {
    return false;
  }

  if (appliedHandoffIds.has(event.handoffId)) {
    return false;
  }

  return !messages.some((message) => message.id === event.messageId);
}
