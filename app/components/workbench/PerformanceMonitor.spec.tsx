// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { tokenUsageStore } from '~/lib/stores/performance';

let PerformanceMonitor: (typeof import('./PerformanceMonitor'))['PerformanceMonitor'];
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

describe('PerformanceMonitor', () => {
  beforeAll(async () => {
    if (typeof window !== 'undefined') {
      (window as { __vite_plugin_react_preamble_installed__?: boolean }).__vite_plugin_react_preamble_installed__ =
        true;
    }

    PerformanceMonitor = (await import('./PerformanceMonitor')).PerformanceMonitor;
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
    vi.unstubAllGlobals();
    localStorageData.clear();
    tokenUsageStore.set({
      completionTokens: 0,
      promptTokens: 0,
      totalTokens: 0,
    });
  });

  it('shows a recommendation when token usage exceeds configured threshold', async () => {
    render(<PerformanceMonitor />);

    await waitFor(() => {
      expect(screen.queryByText('Token usage is high. Consider local models for lightweight prompts.')).toBeTruthy();
    });
    expect(screen.queryByText(/Tokens 300/)).toBeTruthy();
  });
});
