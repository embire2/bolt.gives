// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-toastify', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

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
  });

  afterEach(() => {
    cleanup();
  });

  it('shows one-click update when update is available', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          available: true,
          currentVersion: '1.0.2',
          latestVersion: '1.0.3',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    render(<UpdateBanner />);

    await waitFor(() => {
      expect(screen.queryByText(/one-click update/i)).toBeTruthy();
    });
  });

  it('renders update logs after apply action', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            available: true,
            currentVersion: '1.0.2',
            latestVersion: '1.0.3',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            updated: true,
            rollbackApplied: false,
            currentVersion: '1.0.3',
            latestVersion: '1.0.3',
            logs: [{ step: 'pnpm run build', status: 'ok', stdout: 'built' }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    render(<UpdateBanner />);

    await waitFor(() => {
      expect(screen.queryByText(/one-click update/i)).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: /one-click update/i }));

    await waitFor(() => {
      expect(screen.queryByText(/Update logs/i)).toBeTruthy();
    });
  });
});
