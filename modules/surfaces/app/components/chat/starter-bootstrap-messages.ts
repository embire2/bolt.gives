import type { Attachment } from '@ai-sdk/ui-utils';
import type { Message } from 'ai';
import { DEFER_CHAT_NAVIGATION_ANNOTATION } from '@bolt/project/lib/persistence/chat-history-utils';

type BuildStarterBootstrapMessagesOptions = {
  userMessageId: string;
  assistantMessageId: string;
  userMessageText: string;
  starterAssistantMessage: string;
  continuationMessageText?: string | null;
  hideContinuationMessage?: boolean;
  userParts?: Message['parts'];
  attachments?: Attachment[];
};

export function buildStarterBootstrapMessages(options: BuildStarterBootstrapMessagesOptions): Message[] {
  const {
    userMessageId,
    assistantMessageId,
    userMessageText,
    starterAssistantMessage,
    continuationMessageText,
    hideContinuationMessage = false,
    userParts,
    attachments,
  } = options;
  const messages: Message[] = [
    {
      id: userMessageId,
      role: 'user',
      content: userMessageText,
      ...(userParts ? { parts: userParts } : {}),
      ...(attachments ? { experimental_attachments: attachments } : {}),
    },
    {
      id: assistantMessageId,
      role: 'assistant',
      content: starterAssistantMessage,
      annotations: [DEFER_CHAT_NAVIGATION_ANNOTATION],
    },
  ];

  const normalizedContinuationMessage = continuationMessageText?.trim();

  if (normalizedContinuationMessage) {
    messages.push({
      id: `${assistantMessageId}-continue`,
      role: 'user',
      content: normalizedContinuationMessage,
      ...(hideContinuationMessage ? { annotations: ['hidden'] } : {}),
    });
  }

  return messages;
}

export function findPendingStarterRequest(messages: Message[]): string | null {
  const latestAssistantIndex = messages.findLastIndex((message) => message.role === 'assistant');
  const latestAssistant = messages[latestAssistantIndex];

  if (!latestAssistant?.annotations?.includes(DEFER_CHAT_NAVIGATION_ANNOTATION)) {
    return null;
  }

  for (let index = latestAssistantIndex - 1; index >= 0; index--) {
    const candidate = messages[index];

    if (candidate.role === 'user' && typeof candidate.content === 'string' && candidate.content.trim()) {
      return candidate.content.trim();
    }
  }

  return null;
}
