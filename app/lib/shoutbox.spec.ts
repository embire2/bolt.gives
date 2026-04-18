import { describe, expect, it } from 'vitest';
import { countUnreadShoutMessages, normalizeShoutMessages } from './shoutbox';

describe('shoutbox helpers', () => {
  it('normalizes and sorts shout-out messages', () => {
    const messages = normalizeShoutMessages([
      { id: '2', author: 'B', content: 'Later', createdAt: '2026-04-18T10:05:00.000Z' },
      { id: '1', author: 'A', content: 'Sooner', createdAt: '2026-04-18T10:00:00.000Z' },
    ]);

    expect(messages.map((message) => message.id)).toEqual(['1', '2']);
  });

  it('counts unread shout-out messages using the last-read timestamp', () => {
    const messages = normalizeShoutMessages([
      { id: '1', author: 'A', content: 'One', createdAt: '2026-04-18T10:00:00.000Z' },
      { id: '2', author: 'B', content: 'Two', createdAt: '2026-04-18T10:10:00.000Z' },
    ]);

    expect(countUnreadShoutMessages(messages, '2026-04-18T10:05:00.000Z')).toBe(1);
    expect(countUnreadShoutMessages(messages, null)).toBe(2);
  });
});
