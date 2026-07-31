// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { getAll } from '@bolt/project/lib/persistence';

vi.mock('framer-motion', () => ({
  cubicBezier: () => [0.4, 0, 0.2, 1],
  motion: {
    div: React.forwardRef<HTMLDivElement, any>(({ animate, children, ...props }, ref) => (
      <div ref={ref} data-testid="sidebar-shell" data-animate={animate} {...props}>
        {children}
      </div>
    )),
  },
}));

vi.mock('react-toastify', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock('~/components/ui/Dialog', () => ({
  Dialog: ({ children }: any) => <div>{children}</div>,
  DialogButton: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  DialogDescription: ({ children }: any) => <div>{children}</div>,
  DialogRoot: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('~/components/ui/ThemeSwitch', () => ({ ThemeSwitch: () => <div>Theme Switch</div> }));
vi.mock('~/components/@settings/core/ControlPanel', () => ({ ControlPanel: () => null }));
vi.mock('~/components/ui/SettingsButton', () => ({
  SettingsButton: ({ onClick }: any) => <button onClick={onClick}>Settings</button>,
  HelpButton: ({ onClick }: any) => <button onClick={onClick}>Help</button>,
}));
vi.mock('~/components/ui/Button', () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
}));
vi.mock('./HistoryItem', () => ({
  HistoryItem: ({ item }: any) => <a href={`/chat/${item.urlId}`}>{item.description}</a>,
}));
vi.mock('./date-binning', () => ({
  binDates: (items: any[]) => [{ category: 'Today', items }],
}));
vi.mock('@bolt/project/lib/hooks/useSearchFilter', () => ({
  useSearchFilter: ({ items }: any) => ({ filteredItems: items, handleSearchChange: vi.fn() }),
}));
vi.mock('~/lib/profile-context', () => ({
  useProfile: () => ({ id: 'profile-a', name: 'Ada Lovelace' }),
}));
vi.mock('@bolt/core/utils/classNames', () => ({
  classNames: (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' '),
}));
vi.mock('@bolt/project/lib/persistence', () => ({
  db: {},
  deleteById: vi.fn(),
  duplicateChat: vi.fn(),
  getAll: vi.fn(async () => []),
  getMessages: vi.fn(),
  chatId: { get: () => null },
}));

let Menu: (typeof import('./Menu.client'))['Menu'];

describe('Menu sidebar behavior', () => {
  beforeAll(async () => {
    (window as any).__vite_plugin_react_preamble_installed__ = true;
    Menu = (await import('./Menu.client')).Menu;
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('opens on explicit toggle click events', async () => {
    render(<Menu />);

    const shell = screen.getByTestId('sidebar-shell');
    expect(shell.getAttribute('data-animate')).toBe('closed');

    window.dispatchEvent(new CustomEvent('bolt-sidebar-toggle'));
    await waitFor(() => {
      expect(screen.getByTestId('sidebar-shell').getAttribute('data-animate')).toBe('open');
    });
  });

  it('does not auto-open from passive mouse movement near the screen edge', () => {
    render(<Menu />);

    fireEvent.mouseMove(window, { pageX: 8, clientX: 8 });

    expect(screen.getByTestId('sidebar-shell').getAttribute('data-animate')).toBe('closed');
  });

  it('keeps saved projects visible when an agent did not provide a title', async () => {
    vi.mocked(getAll).mockResolvedValueOnce([
      {
        id: '1',
        messages: [],
        timestamp: '2026-07-25T10:00:00.000Z',
      },
    ]);

    render(<Menu />);
    fireEvent.click(screen.getByRole('button', { name: 'Open sidebar' }));

    const projectLink = await screen.findByRole('link', { name: 'Untitled project' });
    expect(projectLink.getAttribute('href')).toBe('/chat/1');
    expect(getAll).toHaveBeenCalledWith(expect.anything(), 'profile-a');
  });

  it('renders the authenticated profile rather than a stale provider identity', () => {
    render(<Menu />);
    expect(screen.getByText('Ada Lovelace')).toBeTruthy();
  });
});
