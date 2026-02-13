import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { FilesStore } from './files';
import { addLockedFolder, clearCache, isPathInLockedFolder, LOCKED_FILES_KEY } from '~/lib/persistence/lockedFiles';

class MemoryStorage {
  #data = new Map<string, string>();

  clear() {
    this.#data.clear();
  }
  getItem(key: string) {
    return this.#data.has(key) ? this.#data.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.#data.set(key, String(value));
  }
  removeItem(key: string) {
    this.#data.delete(key);
  }
}

function makeWebcontainer(workdir: string) {
  return {
    workdir,
    fs: {
      writeFile: vi.fn(async () => undefined),
      mkdir: vi.fn(async () => undefined),
      rm: vi.fn(async () => undefined),
    },
    internal: {
      watchPaths: vi.fn(() => undefined),
    },
  } as any;
}

describe('FilesStore locking', () => {
  const hadLocalStorage = Object.prototype.hasOwnProperty.call(globalThis, 'localStorage');
  const originalLocalStorage = (globalThis as any).localStorage;

  beforeEach(() => {
    // Provide a deterministic localStorage for lock helpers.
    (globalThis as any).localStorage = new MemoryStorage();
    clearCache();
  });

  afterEach(() => {
    // Reset locks between tests.
    try {
      (globalThis as any).localStorage?.removeItem?.(LOCKED_FILES_KEY);
    } catch {
      // ignore
    }
    clearCache();

    // Restore the environment. If the original value wasn't a usable Storage, prefer removing it.
    const isUsable =
      originalLocalStorage &&
      typeof originalLocalStorage.getItem === 'function' &&
      typeof originalLocalStorage.setItem === 'function';

    if (hadLocalStorage && isUsable) {
      (globalThis as any).localStorage = originalLocalStorage;
    } else {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete (globalThis as any).localStorage;
    }
  });

  it('saveFile is a no-op when content is unchanged (no disk write)', async () => {
    const webcontainer = makeWebcontainer('/workspace');
    const store = new FilesStore(Promise.resolve(webcontainer));
    store.files.setKey('/workspace/a.txt', { type: 'file', content: 'same', isBinary: false, isLocked: false });

    await store.saveFile('/workspace/a.txt', 'same');

    expect(webcontainer.fs.writeFile).not.toHaveBeenCalled();
  });

  it('saveFile throws when the file is locked', async () => {
    const webcontainer = makeWebcontainer('/workspace');
    const store = new FilesStore(Promise.resolve(webcontainer));
    store.files.setKey('/workspace/locked.txt', { type: 'file', content: 'x', isBinary: false, isLocked: true });

    await expect(store.saveFile('/workspace/locked.txt', 'y')).rejects.toThrow(/locked/i);
    expect(webcontainer.fs.writeFile).not.toHaveBeenCalled();
  });

  it('createFile throws when path is inside a locked folder', async () => {
    const webcontainer = makeWebcontainer('/workspace');
    const store = new FilesStore(Promise.resolve(webcontainer));

    addLockedFolder('default', '/workspace/locked-dir');

    expect(isPathInLockedFolder('default', '/workspace/locked-dir/new.txt').locked).toBe(true);
    expect(store.isFileInLockedFolder('/workspace/locked-dir/new.txt', 'default').locked).toBe(true);

    await expect(store.createFile('/workspace/locked-dir/new.txt', 'content')).rejects.toThrow(/locked folder/i);
    expect(webcontainer.fs.writeFile).not.toHaveBeenCalled();
  });
});
