// @vitest-environment jsdom

import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('remix-utils/client-only', () => ({
  ClientOnly: ({ fallback }: { fallback: React.ReactNode }) => <>{fallback}</>,
}));

vi.mock('~/components/header/Header', () => ({ Header: () => <div>Header</div> }));
vi.mock('~/components/ui/BackgroundRays', () => ({ default: () => <div>Background</div> }));
vi.mock('~/components/chat/Chat.client', () => ({ Chat: () => <div>Chat Client</div> }));

describe('index route fallback shell', () => {
  beforeAll(() => {
    (window as any).__vite_plugin_react_preamble_installed__ = true;
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined,
      clear: () => undefined,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the public project website on the root route', async () => {
    const { default: Index } = await import('../../app/routes/_index');

    render(<Index />);

    expect(screen.getByText(/The transparent AI coding workspace/i)).toBeTruthy();
    expect(screen.getByText(/From prompt to production preview/i)).toBeTruthy();
    expect(screen.getByText(/Questions people ask before building with bolt\.gives/i)).toBeTruthy();
    expect(screen.getAllByText('Contribute to Project').length).toBeGreaterThan(0);
    expect(screen.getByText('Create managed instance')).toBeTruthy();
    expect(screen.getByText('Real screenshots')).toBeTruthy();
    expect(screen.getByAltText(/Generated bolt\.gives SEO image/i)).toBeTruthy();
    expect(
      screen.queryByText(
        'Preparing the coding workspace. The prompt box will become interactive as soon as the chat shell is ready.',
      ),
    ).toBeNull();
  });

  it('keeps the chat workspace loading shell available away from the homepage', async () => {
    const { ChatWorkspace } = await import('../../app/routes/_index');

    render(<ChatWorkspace />);

    expect(
      screen.getByText(
        'Preparing the coding workspace. The prompt box will become interactive as soon as the chat shell is ready.',
      ),
    ).toBeTruthy();
    expect(screen.getAllByText('FREE').length).toBeGreaterThan(0);
    expect(screen.getByText(/DeepSeek V3\.2/i)).toBeTruthy();
    expect(screen.queryByPlaceholderText(/How can Bolt help you today\?/i)).toBeNull();
  });
});
