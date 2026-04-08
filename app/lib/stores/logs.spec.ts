// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const cookieApi = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  remove: vi.fn(),
}));

vi.mock('js-cookie', () => ({
  default: cookieApi,
}));

function createStorageMock(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));

  return {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value);
    }),
  };
}

describe('logStore persistence', () => {
  beforeEach(() => {
    vi.resetModules();
    cookieApi.get.mockReset();
    cookieApi.set.mockReset();
    cookieApi.remove.mockReset();
  });

  it('migrates legacy event logs out of cookies and into localStorage', async () => {
    const storage = createStorageMock();
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: storage,
    });
    cookieApi.get.mockReturnValue(
      JSON.stringify({
        legacy: {
          id: 'legacy',
          timestamp: new Date().toISOString(),
          level: 'info',
          category: 'system',
          message: 'legacy log',
        },
      }),
    );

    const { EVENT_LOG_STORAGE_KEY, logStore } = await import('./logs');

    expect(logStore.getLogs()).toHaveLength(1);
    expect(storage.setItem).toHaveBeenCalledWith(EVENT_LOG_STORAGE_KEY, expect.stringContaining('legacy log'));
    expect(cookieApi.remove).toHaveBeenCalledWith('eventLogs');
  });

  it('persists new log entries to localStorage instead of cookies', async () => {
    const storage = createStorageMock();
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: storage,
    });
    cookieApi.get.mockReturnValue(undefined);

    const { EVENT_LOG_STORAGE_KEY, logStore } = await import('./logs');
    logStore.clearLogs();
    logStore.logSystem('hello from local storage');

    expect(storage.setItem).toHaveBeenCalledWith(
      EVENT_LOG_STORAGE_KEY,
      expect.stringContaining('hello from local storage'),
    );
    expect(cookieApi.set).not.toHaveBeenCalled();
  });
});
