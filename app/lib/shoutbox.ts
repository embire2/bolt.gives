export type ShoutMessage = {
  id: string;
  author: string;
  content: string;
  createdAt: string;
};

export const SHOUTBOX_LAST_READ_AT_KEY = 'bolt_shoutbox_last_read_at';

export function normalizeShoutMessages(messages: unknown): ShoutMessage[] {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages
    .filter((message) => message && typeof message === 'object')
    .map((message) => ({
      id: String((message as any).id || ''),
      author: String((message as any).author || 'Anonymous'),
      content: String((message as any).content || ''),
      createdAt: String((message as any).createdAt || ''),
    }))
    .filter((message) => message.id && message.content && message.createdAt)
    .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));
}

export function countUnreadShoutMessages(messages: ShoutMessage[], lastReadAt: string | null | undefined) {
  const lastReadTimestamp = lastReadAt ? Date.parse(lastReadAt) : 0;

  return messages.filter((message) => Date.parse(message.createdAt) > lastReadTimestamp).length;
}
