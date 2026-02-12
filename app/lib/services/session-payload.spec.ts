import { describe, expect, it } from 'vitest';
import { normalizeSessionPayload, restoreConversationFromPayload } from './session-payload';

describe('session-payload', () => {
  it('normalizes missing/partial payload fields safely', () => {
    const normalized = normalizeSessionPayload({ title: 'T' });

    expect(normalized.title).toBe('T');
    expect(normalized.conversation).toEqual([]);
    expect(normalized.prompts).toEqual([]);
    expect(normalized.responses).toEqual([]);
    expect(normalized.diffs).toEqual([]);
  });

  it('derives prompts/responses from conversation when missing', () => {
    const normalized = normalizeSessionPayload({
      title: 'T',
      conversation: [
        { id: 'u1', role: 'user', content: 'hi' },
        { id: 'a1', role: 'assistant', content: 'hello' },
      ],
    });

    expect(normalized.prompts.map((m) => m.id)).toEqual(['u1']);
    expect(normalized.responses.map((m) => m.id)).toEqual(['a1']);
  });

  it('accepts legacy `messages` alias for conversation', () => {
    const normalized = normalizeSessionPayload({
      title: 'T',
      messages: [{ id: 'u1', role: 'user', content: 'hi' }],
    });

    expect(normalized.conversation.length).toBe(1);
    expect(normalized.conversation[0]?.id).toBe('u1');
  });

  it('normalizes diffs from either array or object maps', () => {
    const normalized = normalizeSessionPayload({
      title: 'T',
      diffs: {
        '/home/project/a.ts': { type: 'diff', content: '@@ -1 +1 @@' },
        '/home/project/b.ts': 'diff text',
      },
    });

    expect(normalized.diffs).toEqual([
      { path: '/home/project/a.ts', diff: '@@ -1 +1 @@' },
      { path: '/home/project/b.ts', diff: 'diff text' },
    ]);
  });

  it('restores a usable conversation even when `conversation` is missing', () => {
    const restored = restoreConversationFromPayload(
      normalizeSessionPayload({
        title: 'T',
        prompts: [{ role: 'user', content: 'hi' }],
        responses: [{ role: 'assistant', content: 'hello' }],
      }),
    );

    expect(restored.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(restored.map((m) => m.content)).toEqual(['hi', 'hello']);
  });
});
