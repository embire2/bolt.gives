// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { Fragment, createElement } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { tokenUsageStore } from '~/lib/stores/performance';

let performanceMonitorComponent: (typeof import('./PerformanceMonitor'))['PerformanceMonitor'];
const localStorageData = new Map<string, string>();

const localStorageMock = {
  getItem: (key: string) => localStorageData.get(key) ?? null,
  setItem: (key: string, value: string) => {
    localStorageData.set(key, value);
  },
  removeItem: (key: string) => {
    localStorageData.delete(key);
  },
  clear: () => {
    localStorageData.clear();
  },
};

(globalThis as { __vite_plugin_react_preamble_installed__?: boolean }).__vite_plugin_react_preamble_installed__ = true;

if (typeof window !== 'undefined') {
  (window as { __vite_plugin_react_preamble_installed__?: boolean }).__vite_plugin_react_preamble_installed__ = true;
}

describe('PerformanceMonitor', () => {
  beforeAll(async () => {
    performanceMonitorComponent = (await import('./PerformanceMonitor')).PerformanceMonitor;
  });

  beforeEach(() => {
    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock,
      configurable: true,
      writable: true,
    });

    tokenUsageStore.set({
      completionTokens: 150,
      promptTokens: 150,
      totalTokens: 300,
    });

    window.localStorage.setItem(
      'bolt_performance_thresholds',
      JSON.stringify({
        memoryMb: 9000,
        cpuPercent: 95,
        tokenTotal: 100,
      }),
    );

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            available: true,
            timestamp: Date.now(),
            memory: {
              rss: 100 * 1024 * 1024,
              heapUsed: 50 * 1024 * 1024,
              heapTotal: 80 * 1024 * 1024,
              external: 5 * 1024 * 1024,
            },
            cpu: {
              user: 1000,
              system: 1000,
            },
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
            },
          },
        ),
      ),
    );
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    localStorageData.clear();
    tokenUsageStore.set({
      completionTokens: 0,
      promptTokens: 0,
      totalTokens: 0,
    });
  });

  it('shows a recommendation when token usage exceeds configured threshold', async () => {
    render(createElement(performanceMonitorComponent));

    await waitFor(() => {
      expect(screen.queryByText('Token usage is high. Consider local models for lightweight prompts.')).toBeTruthy();
    });
    expect(screen.queryByText(/Tokens 300/)).toBeTruthy();
  });

  it('refreshes the token count after the store updates', async () => {
    render(createElement(performanceMonitorComponent));

    await waitFor(() => {
      expect(screen.queryByText(/Tokens 300/)).toBeTruthy();
    });

    tokenUsageStore.set({
      completionTokens: 500,
      promptTokens: 200,
      totalTokens: 700,
    });

    await waitFor(() => {
      expect(screen.queryByText(/Tokens 700/)).toBeTruthy();
    });
  });

  it('shares a single performance poller across multiple mounts and stops after unmount', async () => {
    vi.useFakeTimers();

    const fetchMock = vi.mocked(fetch);
    const view = render(
      createElement(
        Fragment,
        null,
        createElement(performanceMonitorComponent),
        createElement(performanceMonitorComponent),
      ),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);

    view.unmount();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60000);
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not stack hidden performance pollers across remounts', async () => {
    vi.useFakeTimers();

    const fetchMock = vi.mocked(fetch);
    const firstView = render(createElement(performanceMonitorComponent));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    firstView.unmount();

    const secondView = render(
      createElement(
        Fragment,
        null,
        createElement(performanceMonitorComponent),
        createElement(performanceMonitorComponent),
      ),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    secondView.unmount();
  });
});
