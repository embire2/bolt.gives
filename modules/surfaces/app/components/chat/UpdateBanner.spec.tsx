// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-toastify', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

class FakeEventSource {
  static instances: FakeEventSource[] = [];

  listeners = new Map<string, Array<(event: MessageEvent) => void>>();
  url: string;
  closed = false;

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  addEventListener(event: string, callback: (event: MessageEvent) => void) {
    this.listeners.set(event, [...(this.listeners.get(event) || []), callback]);
  }

  emit(event: string, payload: unknown) {
    for (const listener of this.listeners.get(event) || []) {
      listener({ data: JSON.stringify(payload) } as MessageEvent);
    }
  }

  close() {
    this.closed = true;
  }
}

let UpdateBanner: (typeof import('./UpdateBanner'))['UpdateBanner'];

describe('UpdateBanner', () => {
  beforeAll(async () => {
    if (typeof window !== 'undefined') {
      (window as { __vite_plugin_react_preamble_installed__?: boolean }).__vite_plugin_react_preamble_installed__ =
        true;
    }

    UpdateBanner = (await import('./UpdateBanner')).UpdateBanner;
  });

  beforeEach(() => {
    vi.restoreAllMocks();

    const storage = new Map<string, string>();
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: vi.fn((key: string) => storage.get(key) || null),
        setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
        removeItem: vi.fn((key: string) => storage.delete(key)),
        clear: vi.fn(() => storage.clear()),
      },
    });
    FakeEventSource.instances = [];
    vi.stubGlobal('EventSource', FakeEventSource as unknown as typeof EventSource);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('checks for updates when mounted and stays hidden when current', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          supported: true,
          available: false,
          policy: 'optional',
          mandatory: false,
          currentVersion: '1.0.2',
          latestVersion: '1.0.2',
          features: [],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    render(<UpdateBanner />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/update');
    });
    expect(screen.queryByText(/update available/i)).toBeNull();
  });

  it('shows optional updates and lets the user dismiss the banner', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          supported: true,
          available: true,
          policy: 'optional',
          mandatory: false,
          currentVersion: '1.0.2',
          latestVersion: '1.0.3',
          features: ['Compact updater banner'],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    render(<UpdateBanner />);

    await waitFor(() => {
      expect(screen.queryByText(/update available/i)).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));

    await waitFor(() => {
      expect(screen.queryByText(/update available/i)).toBeNull();
    });
  });

  it('opens a blocking modal for mandatory updates and shows new features', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          supported: true,
          available: true,
          policy: 'mandatory',
          mandatory: true,
          currentVersion: '1.0.2',
          latestVersion: '1.0.3',
          features: ['Security patch', 'Prompt-to-preview fix'],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    render(<UpdateBanner />);

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /mandatory update required/i })).toBeTruthy();
    });
    expect(screen.queryByText(/security patch/i)).toBeTruthy();
    expect(screen.queryByText(/prompt-to-preview fix/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /dismiss/i })).toBeNull();
  });

  it('starts an update and renders streamed progress', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            supported: true,
            available: true,
            policy: 'optional',
            mandatory: false,
            currentVersion: '1.0.2',
            latestVersion: '1.0.3',
            features: ['Streaming updater'],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            started: true,
            operationId: 'op-1',
            operation: {
              id: 'op-1',
              status: 'running',
              progress: 4,
              currentStep: 'Preparing update',
              targetVersion: '1.0.3',
              startedAt: '2026-06-28T00:00:00.000Z',
              logs: [],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    render(<UpdateBanner />);

    await waitFor(() => {
      expect(screen.queryByText(/update available/i)).toBeTruthy();
    });

    fireEvent.click(screen.getAllByRole('button', { name: /update now/i })[0]!);

    await waitFor(() => {
      expect(FakeEventSource.instances[0]?.url).toContain('/api/update?stream=1&operationId=op-1');
    });

    FakeEventSource.instances[0].emit('update', {
      id: 'op-1',
      status: 'running',
      progress: 62,
      currentStep: 'Install dependencies',
      targetVersion: '1.0.3',
      startedAt: '2026-06-28T00:00:00.000Z',
      logs: [{ step: 'Install dependencies', status: 'running', stdout: 'pnpm install' }],
    });

    await waitFor(() => {
      expect(screen.queryAllByText(/Install dependencies/i).length).toBeGreaterThan(0);
      expect(screen.queryAllByText(/62%/i).length).toBeGreaterThan(0);
    });
  });
});
