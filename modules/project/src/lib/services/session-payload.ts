import type { Message } from 'ai';

export interface SessionDiffRecord {
  path: string;
  diff: string;
}

export interface SessionPayload {
  title: string;
  conversation: Message[];
  prompts: Message[];
  responses: Message[];
  diffs: SessionDiffRecord[];
  metadata?: Record<string, unknown>;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function normalizeMessageArray(value: unknown): Message[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item) => isPlainObject(item) && typeof item.role === 'string')
    .map((item, index) => {
      const id = typeof item.id === 'string' && item.id.length > 0 ? item.id : `restored-${index}`;
      const content = typeof item.content === 'string' ? item.content : String(item.content ?? '');

      return {
        ...item,
        id,
        content,
      } as Message;
    });
}

function normalizeDiffs(value: unknown): SessionDiffRecord[] {
  if (Array.isArray(value)) {
    return value
      .filter((item) => isPlainObject(item) && typeof item.path === 'string')
      .map((item) => ({
        path: String(item.path),
        diff: typeof item.diff === 'string' ? item.diff : String(item.diff ?? ''),
      }));
  }

  if (isPlainObject(value)) {
    return Object.entries(value)
      .filter(([path]) => typeof path === 'string' && path.length > 0)
      .map(([path, diffValue]) => {
        if (typeof diffValue === 'string') {
          return { path, diff: diffValue };
        }

        if (isPlainObject(diffValue) && typeof diffValue.content === 'string') {
          return { path, diff: diffValue.content };
        }

        return { path, diff: String(diffValue ?? '') };
      });
  }

  return [];
}

/**
 * Normalize older/partial session payloads into the current shape so UI restore
 * and share-links never crash on missing fields.
 */
export function normalizeSessionPayload(input: unknown): SessionPayload {
  const obj = isPlainObject(input) ? input : {};

  const rawConversation = Array.isArray(obj.conversation)
    ? obj.conversation
    : Array.isArray(obj.messages)
      ? obj.messages
      : [];

  const conversation = normalizeMessageArray(rawConversation);

  let prompts = normalizeMessageArray(obj.prompts);
  let responses = normalizeMessageArray(obj.responses);

  // Backward-compat: derive prompts/responses from conversation when missing.
  if (prompts.length === 0 && conversation.length > 0) {
    prompts = conversation.filter((m) => m.role === 'user');
  }

  if (responses.length === 0 && conversation.length > 0) {
    responses = conversation.filter((m) => m.role === 'assistant');
  }

  const metadata = isPlainObject(obj.metadata) ? (obj.metadata as Record<string, unknown>) : undefined;
  const title =
    typeof obj.title === 'string' && obj.title.trim().length > 0
      ? obj.title.trim()
      : typeof metadata?.title === 'string' && metadata.title.trim().length > 0
        ? metadata.title.trim()
        : 'Untitled Session';

  return {
    title,
    conversation,
    prompts,
    responses,
    diffs: normalizeDiffs(obj.diffs),
    metadata,
  };
}

export function restoreConversationFromPayload(payload: SessionPayload): Message[] {
  if (payload.conversation.length > 0) {
    return payload.conversation;
  }

  if (payload.prompts.length > 0 || payload.responses.length > 0) {
    return [...payload.prompts, ...payload.responses];
  }

  return [];
}
