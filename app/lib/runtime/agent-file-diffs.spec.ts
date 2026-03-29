import { describe, expect, it } from 'vitest';
import {
  computeTextFileDelta,
  computeTextSnapshotRevertOps,
  formatCheckpointConfirmMessage,
  type TextFileSnapshot,
} from './agent-file-diffs';

describe('agent-file-diffs', () => {
  it('computes modified/created/deleted paths and unified diffs', () => {
    const before: TextFileSnapshot = {
      '/home/project/a.txt': 'one\n',
      '/home/project/c.txt': 'gone\n',
    };
    const after: TextFileSnapshot = {
      '/home/project/a.txt': 'two\n',
      '/home/project/b.txt': 'new\n',
    };

    const delta = computeTextFileDelta(before, after);

    expect(delta.modified).toEqual(['/home/project/a.txt']);
    expect(delta.created).toEqual(['/home/project/b.txt']);
    expect(delta.deleted).toEqual(['/home/project/c.txt']);

    expect(delta.diffs['a.txt']).toContain('-one');
    expect(delta.diffs['a.txt']).toContain('+two');
    expect(delta.diffs['b.txt']).toContain('+new');
    expect(delta.diffs['c.txt']).toContain('-gone');
  });

  it('computes revert ops to restore baseline and delete new files', () => {
    const baseline: TextFileSnapshot = {
      '/home/project/a.txt': 'baseline\n',
    };
    const current: TextFileSnapshot = {
      '/home/project/a.txt': 'changed\n',
      '/home/project/b.txt': 'new\n',
    };

    const ops = computeTextSnapshotRevertOps(baseline, current);

    expect(ops.writes).toEqual([{ path: '/home/project/a.txt', content: 'baseline\n' }]);
    expect(ops.deletes).toEqual(['/home/project/b.txt']);
  });

  it('formats a checkpoint confirm message that includes change summary', () => {
    const delta = computeTextFileDelta({ '/home/project/a.txt': 'one\n' }, { '/home/project/a.txt': 'two\n' });

    const message = formatCheckpointConfirmMessage({ stepDescription: 'update a', delta, maxDiffChars: 200 });

    expect(message).toContain('Checkpoint reached:');
    expect(message).toContain('update a');
    expect(message).toContain('Modified (1):');
    expect(message).toContain('- a.txt');
    expect(message).toContain('Diff preview');
    expect(message).toContain('+two');
    expect(message).toContain('Continue to next step?');
  });
});
