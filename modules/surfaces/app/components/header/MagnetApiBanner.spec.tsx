// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

let MagnetApiBanner: (typeof import('./MagnetApiBanner'))['MagnetApiBanner'];
let dismissedStorageKey: string;

describe('MagnetApiBanner', () => {
  beforeAll(async () => {
    (window as { __vite_plugin_react_preamble_installed__?: boolean }).__vite_plugin_react_preamble_installed__ = true;

    const bannerModule = await import('./MagnetApiBanner');
    MagnetApiBanner = bannerModule.MagnetApiBanner;
    dismissedStorageKey = bannerModule.MAGNET_API_BANNER_DISMISSED_KEY;
  });

  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it('links to MagnetAPI and permanently honors dismissal in this browser', async () => {
    const firstRender = render(<MagnetApiBanner />);

    expect(await screen.findByRole('complementary', { name: 'MagnetAPI provider notice' })).toHaveTextContent(
      '90% less',
    );
    expect(screen.getByRole('link', { name: 'Visit MagnetAPI' })).toHaveAttribute('href', 'https://magnetapi.org');

    fireEvent.click(screen.getByRole('button', { name: /do not show it again/i }));
    expect(window.localStorage.getItem(dismissedStorageKey)).toBe('1');
    expect(screen.queryByRole('complementary', { name: 'MagnetAPI provider notice' })).not.toBeInTheDocument();

    firstRender.unmount();
    render(<MagnetApiBanner />);

    await waitFor(() => {
      expect(screen.queryByRole('complementary', { name: 'MagnetAPI provider notice' })).not.toBeInTheDocument();
    });
  });
});
