// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { atom } from 'nanostores';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const showTerminal = atom(true);
const theme = atom('dark');
const toggleTerminal = vi.fn((value?: boolean) => {
  showTerminal.set(value !== undefined ? value : !showTerminal.get());
});

vi.mock('@nanostores/react', async () => {
  const actual = await vi.importActual<typeof import('@nanostores/react')>('@nanostores/react');

  return {
    ...actual,
    useStore: actual.useStore,
  };
});

vi.mock('react-resizable-panels', () => ({
  Panel: ({ children }: any) => <div data-testid="terminal-panel">{children}</div>,
}));

vi.mock('~/components/ui/IconButton', () => ({
  IconButton: ({ title, onClick }: any) => (
    <button type="button" onClick={onClick}>
      {title ?? 'icon'}
    </button>
  ),
}));

vi.mock('~/lib/hooks', () => ({
  shortcutEventEmitter: {
    on: () => vi.fn(),
  },
}));

vi.mock('~/lib/stores/theme', () => ({
  themeStore: theme,
}));

vi.mock('~/lib/stores/workbench', () => ({
  workbenchStore: {
    showTerminal,
    toggleTerminal,
    detachTerminal: vi.fn(),
    attachBoltTerminal: vi.fn(),
    attachTerminal: vi.fn(),
    onTerminalResize: vi.fn(),
  },
}));

vi.mock('~/utils/classNames', () => ({
  classNames: (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' '),
}));

vi.mock('./Terminal', () => ({
  Terminal: React.forwardRef((_props: any, _ref) => <div>Terminal</div>),
}));

vi.mock('./TerminalManager', () => ({
  TerminalManager: () => null,
}));

vi.mock('~/utils/logger', () => ({
  createScopedLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

let TerminalTabs: (typeof import('./TerminalTabs'))['TerminalTabs'];

describe('TerminalTabs', () => {
  beforeAll(async () => {
    (window as any).__vite_plugin_react_preamble_installed__ = true;
    TerminalTabs = (await import('./TerminalTabs')).TerminalTabs;
  });

  afterEach(() => {
    cleanup();
    toggleTerminal.mockClear();
    showTerminal.set(true);
  });

  it('does not crash when terminal visibility state changes', () => {
    render(<TerminalTabs />);

    expect(screen.getByTestId('terminal-panel')).toBeTruthy();

    showTerminal.set(false);

    expect(screen.getByTestId('terminal-panel')).toBeTruthy();
  });

  it('closes through the explicit close action', () => {
    render(<TerminalTabs />);

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(toggleTerminal).toHaveBeenCalledWith(false);
  });
});
