import { describe, expect, it } from 'vitest';
import { filterWorkspaceSource, isWorkspaceSourcePath } from './workspace-source.mjs';

describe('source path policy', () => {
  it.each(['.cache/a', 'src/.local/a', '/home/project/packages/a/node_modules/pkg/a', 'x/../secret', 'x\\dist\\asset'])(
    'excludes %s',
    (file) => {
      expect(isWorkspaceSourcePath(file)).toBe(false);
    },
  );
  it('keeps real hidden source and removes caches from persisted maps', () => {
    expect(filterWorkspaceSource({ '.github/workflow.yml': 1, '.cache/large.json': 2, 'src/main.tsx': 3 })).toEqual({
      '.github/workflow.yml': 1,
      'src/main.tsx': 3,
    });
  });

  it('excludes atomic runtime write files but retains unrelated user source', () => {
    expect(isWorkspaceSourcePath('src/App.tsx.bolt-sync-123-1789247810000-a2b3c.tmp')).toBe(false);
    expect(isWorkspaceSourcePath('src/App.tsx')).toBe(true);
    expect(isWorkspaceSourcePath('docs/.bolt-sync-notes.tmp')).toBe(true);
  });
});
