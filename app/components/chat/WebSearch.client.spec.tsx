// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { securedFetch } from '~/lib/hooks/useCsrf';

vi.mock('~/components/ui/IconButton', () => ({
  IconButton: ({ children, title, disabled, onClick }: any) => (
    <button type="button" title={title} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  ),
}));

vi.mock('~/lib/hooks/useCsrf', () => ({
  securedFetch: vi.fn(),
}));

vi.mock('react-toastify', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('WebSearch', () => {
  let WebSearch: typeof import('./WebSearch.client').WebSearch;

  beforeAll(async () => {
    (window as any).__vite_plugin_react_preamble_installed__ = true;
    WebSearch = (await import('./WebSearch.client')).WebSearch;
  });

  beforeEach(() => {
    vi.mocked(securedFetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          title: 'Example',
          description: 'Example description',
          content: 'Example page content',
          sourceUrl: 'https://example.com/',
        },
      }),
    } as Response);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('uses the CSRF-secured fetch helper when fetching URL content', async () => {
    const onSearchResult = vi.fn();
    render(<WebSearch onSearchResult={onSearchResult} />);

    fireEvent.click(screen.getByTitle('Fetch URL content'));
    fireEvent.change(screen.getByPlaceholderText('https://example.com'), {
      target: { value: 'https://example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Fetch' }));

    await waitFor(() => expect(securedFetch).toHaveBeenCalledTimes(1));
    expect(securedFetch).toHaveBeenCalledWith(
      '/api/web-search',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ url: 'https://example.com' }),
      }),
    );
    expect(onSearchResult).toHaveBeenCalledWith(expect.stringContaining('Example page content'));
  });
});
