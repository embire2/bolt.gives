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

    const keyA = deriveProjectMemoryKey(files);
    const keyB = deriveProjectMemoryKey(files);

    expect(keyA).toBe(keyB);
    expect(keyA.startsWith('pm_')).toBe(true);
  });

  it('stores and increments project memory revisions', () => {
    const files: FileMap = {
      '/app/routes/index.tsx': { type: 'file', content: '', isBinary: false },
      '/app/components/chat/Chat.client.tsx': { type: 'file', content: '', isBinary: false },
    };

    const projectKey = deriveProjectMemoryKey(files);
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
});
