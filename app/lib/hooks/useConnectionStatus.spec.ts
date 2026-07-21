// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useConnectionStatus } from './useConnectionStatus';

const { checkConnectionSpy } = vi.hoisted(() => ({
  checkConnectionSpy: vi.fn(),
}));

vi.mock('~/lib/api/connection', () => ({
  checkConnection: checkConnectionSpy,
}));

describe('useConnectionStatus', () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value),
    });
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    checkConnectionSpy.mockReset();
    vi.unstubAllGlobals();
  });

  it('persists and clears acknowledged connection issues', async () => {
    checkConnectionSpy.mockResolvedValue({ connected: false, latency: 0, lastChecked: new Date().toISOString() });

    const { result } = renderHook(() => useConnectionStatus());

    await waitFor(() => expect(result.current.currentIssue).toBe('disconnected'));

    act(() => result.current.acknowledgeIssue());
    expect(localStorage.getItem('bolt_acknowledged_connection_issue')).toBe('disconnected');

    act(() => result.current.resetAcknowledgment());
    expect(localStorage.getItem('bolt_acknowledged_connection_issue')).toBeNull();
  });
});
