import { afterEach, describe, expect, it, vi } from 'vitest';
import { chatBelongsToOwner, openDatabase, setSnapshot } from './db';

describe('persistence db', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('does not emit a server-side console error when IndexedDB is unavailable', async () => {
    vi.stubGlobal('indexedDB', undefined);

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(openDatabase()).resolves.toBeUndefined();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('keeps authenticated chat history isolated by profile owner', () => {
    expect(chatBelongsToOwner({ ownerId: 'profile-a' }, 'profile-a')).toBe(true);
    expect(chatBelongsToOwner({ ownerId: 'profile-b' }, 'profile-a')).toBe(false);
    expect(chatBelongsToOwner({}, 'profile-a')).toBe(false);
    expect(chatBelongsToOwner({}, null)).toBe(true);
    expect(chatBelongsToOwner({ ownerId: 'profile-a' }, null)).toBe(false);
  });

  it('reports a saved source snapshot only after the IndexedDB transaction commits', async () => {
    const request: any = {};
    const put = vi.fn((_value: any) => request);
    const transaction: any = { objectStore: () => ({ put }) };
    const db = { transaction: () => transaction } as unknown as IDBDatabase;
    const done = vi.fn();
    const pending = setSnapshot(db, 'project', {
      files: { '/src/App.tsx': { type: 'file', content: 'latest' }, '/.cache/file': { type: 'file', content: 'skip' } },
    } as any).then(done);
    request.onsuccess?.();
    await Promise.resolve();
    expect(done).not.toHaveBeenCalled();
    expect(Object.keys(put.mock.calls[0][0].snapshot.files)).toEqual(['/src/App.tsx']);
    transaction.oncomplete();
    await pending;
    expect(done).toHaveBeenCalledOnce();
  });

  it('rejects an aborted snapshot transaction even if the put succeeded', async () => {
    const request: any = {};
    const transaction: any = { objectStore: () => ({ put: () => request }) };
    const pending = setSnapshot({ transaction: () => transaction } as unknown as IDBDatabase, 'project', {
      files: {},
    } as any);
    const assertion = expect(pending).rejects.toThrow('Snapshot transaction aborted');
    request.onsuccess?.();
    transaction.onabort();
    await assertion;
  });
});
