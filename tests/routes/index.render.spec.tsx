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
vi.mock('~/components/profile/ProfileOnboarding', () => ({ ProfileOnboarding: () => null }));

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
    const { default: Index } = await import('~/routes/_index');

    render(<Index />);

    expect(screen.getByText(/The transparent AI coding workspace/i)).toBeTruthy();
    expect(screen.getByText(/From prompt to production preview/i)).toBeTruthy();
    expect(screen.getByText(/Questions people ask before building with bolt\.gives/i)).toBeTruthy();
    expect(screen.getAllByText('Contribute on GitHub').length).toBeGreaterThan(0);
    expect(screen.getByText('Create managed instance')).toBeTruthy();
    expect(screen.getByText('Real screenshots')).toBeTruthy();
    expect(screen.getByAltText('Personal workspace profile screenshot')).toBeTruthy();
    expect(screen.getByAltText('GLM prompt to working Preview screenshot').getAttribute('src')).toBe(
      '/screenshots/agent-mode-glm-v4.1.2.png',
    );
    expect(screen.getByAltText('Visible FREE boundary screenshot')).toBeTruthy();
    expect(screen.getByAltText('Custom Domain pricing screenshot')).toBeTruthy();
    expect(screen.getByAltText(/Generated bolt\.gives SEO image/i)).toBeTruthy();
    expect(
      screen.queryByText(
        'Preparing the coding workspace. The prompt box will become interactive as soon as the chat shell is ready.',
      ),
    ).toBeNull();
  });

  it('keeps the chat workspace loading shell available away from the homepage', async () => {
    const { ChatWorkspace } = await import('~/routes/_index');

    render(<ChatWorkspace />);

    expect(
      screen.getByText(
        'Preparing the coding workspace. The prompt box will become interactive as soon as the chat shell is ready.',
      ),
    ).toBeTruthy();
    expect(screen.getAllByText('FREE').length).toBeGreaterThan(0);
    expect(screen.getByText(/GLM 5.3 Flash/i)).toBeTruthy();
    expect(screen.queryByPlaceholderText(/How can Bolt help you today\?/i)).toBeNull();
  });

  it('does not initialize the private workspace before a single-user owner signs in', async () => {
    const { ProfileProvider } = await import('~/lib/profile-context');
    const { ChatWorkspace } = await import('~/routes/_index');
    render(
      <ProfileProvider profile={null} singleUser>
        <ChatWorkspace />
      </ProfileProvider>,
    );
    expect(screen.queryByText(/Preparing the coding workspace/)).toBeNull();
  });
});
