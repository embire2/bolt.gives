import { afterEach, describe, expect, it, vi } from 'vitest';
import { openDatabase } from './db';

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
});
