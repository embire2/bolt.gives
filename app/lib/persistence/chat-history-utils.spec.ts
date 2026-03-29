import { describe, expect, it } from 'vitest';
import type { Message } from 'ai';
import type { Snapshot } from './types';
import {
  hasRestorableSnapshotFiles,
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
});
