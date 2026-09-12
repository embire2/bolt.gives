import { describe, expect, it, vi } from 'vitest';
import type { FileMap } from '@bolt/core/types/files';
import { reconcileRuntimeSnapshot } from './reconcile-runtime-snapshot';

describe('runtime snapshot reconciliation', () => {
  it('uses a read-only restore after fetching the current session', async () => {
    const baseline = {};
    const target = { files: { get: () => baseline }, hostedRuntimeSessionId: 'one', restoreSnapshot: vi.fn() };
    const snapshot: FileMap = { '/home/project/App.tsx': { type: 'file', content: 'current', isBinary: false } };
    expect(await reconcileRuntimeSnapshot(target, 'one', async () => snapshot)).toBe(true);
    expect(target.restoreSnapshot).toHaveBeenCalledWith(snapshot, true);
  });

  it('discards a slow snapshot when source changed during the request', async () => {
    let current: FileMap = {};
    const target = { files: { get: () => current }, hostedRuntimeSessionId: 'one', restoreSnapshot: vi.fn() };
    expect(
      await reconcileRuntimeSnapshot(target, 'one', async () => {
        current = { '/home/project/App.tsx': { type: 'file', content: 'new app', isBinary: false } };
        return {};
      }),
    ).toBe(false);
    expect(target.restoreSnapshot).not.toHaveBeenCalled();
  });

  it('discards a response after switching projects and preserves unsaved edits', async () => {
    const baseline = {};
    const target = {
      files: { get: () => baseline },
      hostedRuntimeSessionId: 'one',
      restoreSnapshot: vi.fn(),
      unsavedFiles: { get: () => new Set<string>() },
    };
    expect(
      await reconcileRuntimeSnapshot(target, 'one', async () => {
        target.hostedRuntimeSessionId = 'two';
        return {};
      }),
    ).toBe(false);
    target.unsavedFiles.get = () => new Set(['App.tsx']);

    const fetchSnapshot = vi.fn();
    expect(await reconcileRuntimeSnapshot(target, 'two', fetchSnapshot)).toBe(false);
    expect(fetchSnapshot).not.toHaveBeenCalled();
    expect(target.restoreSnapshot).not.toHaveBeenCalled();
  });

  it('does not replace a file action that is still streaming', async () => {
    const target = {
      files: { get: () => ({}) },
      hostedRuntimeSessionId: 'one',
      restoreSnapshot: vi.fn(),
      artifacts: {
        get: () => ({ a: { runner: { actions: { get: () => ({ b: { type: 'file', status: 'running' } }) } } } }),
      },
    };
    const fetchSnapshot = vi.fn();
    expect(await reconcileRuntimeSnapshot(target, 'one', fetchSnapshot)).toBe(false);
    expect(fetchSnapshot).not.toHaveBeenCalled();
  });
});
