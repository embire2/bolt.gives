import type { Attachment } from '@ai-sdk/ui-utils';
import type { Message } from 'ai';

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
