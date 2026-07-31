import { afterEach, describe, expect, it, vi } from 'vitest';
import { chatBelongsToOwner, openDatabase } from './db';

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
});
