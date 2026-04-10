// @vitest-environment jsdom

import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

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

  it('renders a non-interactive loading shell with the locked FREE provider details', async () => {
    const { default: Index } = await import('../../app/routes/_index');

    render(<Index />);

    expect(screen.getByText('Preparing the coding workspace. The prompt box will become interactive as soon as the chat shell is ready.')).toBeTruthy();
    expect(screen.getByText('FREE')).toBeTruthy();
    expect(screen.getByText(/DeepSeek V3\.2/i)).toBeTruthy();
    expect(screen.queryByPlaceholderText(/How can Bolt help you today\?/i)).toBeNull();
  });
});
