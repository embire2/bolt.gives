import type { Message } from 'ai';
import { MODEL_REGEX, PROVIDER_REGEX } from '~/utils/constants';

function extractMessageTextContent(message: Omit<Message, 'id'>) {
  const textContent = Array.isArray(message.content)
    ? message.content.find((item) => item.type === 'text')?.text || ''
    : message.content;

  return textContent.replace(MODEL_REGEX, '').replace(PROVIDER_REGEX, '');
}

export function hasMessageAnnotation(message: Pick<Message, 'annotations'>, annotation: string) {
  return Array.isArray(message.annotations) && message.annotations.includes(annotation);
}

export function findLatestUserMessage(messages: Message[], options?: { includeHidden?: boolean }) {
  const includeHidden = options?.includeHidden ?? true;

  return [...messages].reverse().find((message) => {
    if (message.role !== 'user') {
      return false;
    }

    if (includeHidden) {
      return true;
    }

    return !hasMessageAnnotation(message, 'hidden') && !hasMessageAnnotation(message, 'no-store');
  });
}

export function extractLatestUserGoal(messages: Message[]): string {
  const lastUser = findLatestUserMessage(messages, { includeHidden: false }) || findLatestUserMessage(messages);

  if (!lastUser) {
    return '';
  }

  return extractMessageTextContent(lastUser) || '';
}
