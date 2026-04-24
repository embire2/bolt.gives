import { beforeEach, describe, expect, it } from 'vitest';
import {
  deriveProjectMemoryKey,
  getProjectMemory,
  resetProjectMemoryForTests,
  upsertProjectMemory,
} from './project-memory';
import type { FileMap } from './constants';

describe('project-memory', () => {
  beforeEach(() => {
    resetProjectMemoryForTests();
  });

  it('derives a stable key from file paths', () => {
    const files: FileMap = {
      '/app/routes/index.tsx': { type: 'file', content: '', isBinary: false },
      '/vite.config.ts': { type: 'file', content: '', isBinary: false },
    };

    const keyA = deriveProjectMemoryKey({ files });
    const keyB = deriveProjectMemoryKey({ files });

    expect(keyA).toBe(keyB);
    expect(keyA.startsWith('pm_')).toBe(true);
  });

  it('prefers an explicit project context id so fresh chats do not collide on empty files', () => {
    const keyA = deriveProjectMemoryKey({ projectContextId: 'chat-context-a' });
    const keyB = deriveProjectMemoryKey({ projectContextId: 'chat-context-a' });
    const keyC = deriveProjectMemoryKey({ projectContextId: 'chat-context-b' });

    expect(keyA).toBe(keyB);
    expect(keyA).not.toBe(keyC);
  });

  it('stores and increments project memory revisions', () => {
    const files: FileMap = {
      '/app/routes/index.tsx': { type: 'file', content: '', isBinary: false },
      '/app/components/chat/Chat.client.tsx': { type: 'file', content: '', isBinary: false },
    };

    const projectKey = deriveProjectMemoryKey({ files });
    const first = upsertProjectMemory({
      projectKey,
      files,
      latestGoal: 'Implement telemetry panel',
      summary: 'Added execution transparency and autonomy mode controls.',
    });

    expect(first.runCount).toBe(1);
    expect(first.summary).toContain('execution transparency');

    const second = upsertProjectMemory({
      projectKey,
      files,
      latestGoal: 'Finalize v1.0.2 release checks',
    });

    expect(second.runCount).toBe(2);
    expect(second.latestGoal).toContain('Finalize v1.0.2 release checks');
    expect(second.architecture).toContain('Chat-centric UI workflow');
    expect(getProjectMemory(projectKey)?.runCount).toBe(2);
  });

  it('preserves the last known architecture when a later run has no file snapshot', () => {
    const files: FileMap = {
      '/app/routes/index.tsx': { type: 'file', content: '', isBinary: false },
      '/app/components/chat/Chat.client.tsx': { type: 'file', content: '', isBinary: false },
    };
    const projectKey = deriveProjectMemoryKey({ projectContextId: 'chat-context-preserve' });
    const first = upsertProjectMemory({
      projectKey,
      files,
      latestGoal: 'Create a chat workspace',
      summary: 'Built the initial chat workspace shell.',
    });
    const second = upsertProjectMemory({
      projectKey,
      latestGoal: 'Tighten the follow-up prompt behavior',
      summary: 'Improved prompt continuity.',
    });

    expect(second.architecture).toBe(first.architecture);
  });
});
