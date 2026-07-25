import { describe, expect, it } from 'vitest';
import type { Message } from 'ai';
import type { Snapshot } from './types';
import {
  hasRestorableSnapshotFiles,
  resolvePersistedChatMessages,
  shouldNavigateAfterPersistedMessage,
  shouldPersistSnapshot,
} from './chat-history-utils';

describe('chat-history-utils', () => {
  it('does not treat empty snapshots as restorable workspaces', () => {
    const snapshot: Snapshot = {
      chatIndex: 'msg-1',
      files: {},
    };

    expect(hasRestorableSnapshotFiles(snapshot)).toBe(false);
  });

  it('treats populated snapshots as restorable workspaces', () => {
    const snapshot: Snapshot = {
      chatIndex: 'msg-2',
      files: {
        'src/App.tsx': {
          type: 'file',
          content: 'export default function App() { return null; }',
          isBinary: false,
        },
      },
    };

    expect(hasRestorableSnapshotFiles(snapshot)).toBe(true);
  });

  it('skips empty snapshot persistence until there is workspace state or summary', () => {
    expect(shouldPersistSnapshot({}, undefined)).toBe(false);
    expect(shouldPersistSnapshot({}, 'Summary exists')).toBe(true);
    expect(
      shouldPersistSnapshot({
        'package.json': {
          type: 'file',
          content: '{"name":"app"}',
          isBinary: false,
        },
      }),
    ).toBe(true);
  });

  it('delays navigation until there is assistant output or a workbench artifact', () => {
    const userOnlyMessages: Message[] = [
      {
        id: 'u1',
        role: 'user',
        content: 'Build me an app',
      },
    ];
    const withAssistant: Message[] = [
      ...userOnlyMessages,
      {
        id: 'a1',
        role: 'assistant',
        content: 'Working on it',
      },
    ];

    expect(shouldNavigateAfterPersistedMessage(userOnlyMessages, false, false)).toBe(false);
    expect(shouldNavigateAfterPersistedMessage(userOnlyMessages, true, false)).toBe(false);
    expect(shouldNavigateAfterPersistedMessage(withAssistant, false, false)).toBe(true);
    expect(shouldNavigateAfterPersistedMessage(userOnlyMessages, false, true)).toBe(true);
  });

  it('keeps the complete visible conversation when restoring the latest workspace snapshot', () => {
    const messages: Message[] = [
      { id: 'u1', role: 'user', content: 'Build a calendar' },
      { id: 'a1', role: 'assistant', content: 'Creating the calendar app.' },
      { id: 'u2', role: 'user', content: 'Add reminders' },
      { id: 'a2', role: 'assistant', content: 'Reminders added.' },
    ];
    const snapshot: Snapshot = {
      chatIndex: 'a2',
      files: {
        'src/App.tsx': {
          type: 'file',
          content: 'export default function App() { return <main>Calendar</main>; }',
          isBinary: false,
        },
      },
    };

    expect(resolvePersistedChatMessages(messages, snapshot)).toEqual({
      visibleMessages: messages,
      shouldRestoreSnapshot: true,
    });
  });

  it('rewinds visible history without applying a newer snapshot', () => {
    const messages: Message[] = [
      { id: 'u1', role: 'user', content: 'Build a calendar' },
      { id: 'a1', role: 'assistant', content: 'First pass.' },
      { id: 'u2', role: 'user', content: 'Add reminders' },
      { id: 'a2', role: 'assistant', content: 'Second pass.' },
    ];
    const snapshot: Snapshot = {
      chatIndex: 'a2',
      files: {
        'src/App.tsx': {
          type: 'file',
          content: 'export default function App() { return <main>Calendar</main>; }',
          isBinary: false,
        },
      },
    };

    expect(resolvePersistedChatMessages(messages, snapshot, 'a1')).toEqual({
      visibleMessages: messages.slice(0, 2),
      shouldRestoreSnapshot: false,
    });
  });
});
