// @vitest-environment jsdom

import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('@remix-run/react', () => ({ useParams: () => ({ id: 'active-project' }) }));
vi.mock('~/components/ui/Tooltip', () => ({ default: ({ children }: any) => <>{children}</> }));
vi.mock('@bolt/project/lib/hooks', () => ({
  useEditChatDescription: ({ initialDescription }: any) => ({
    editing: false,
    handleChange: vi.fn(),
    handleBlur: vi.fn(),
    handleSubmit: vi.fn(),
    handleKeyDown: vi.fn(),
    currentDescription: initialDescription,
    toggleEditMode: vi.fn(),
  }),
}));

let HistoryItem: (typeof import('./HistoryItem'))['HistoryItem'];

describe('history item layers', () => {
  beforeAll(async () => {
    (window as any).__vite_plugin_react_preamble_installed__ = true;
    HistoryItem = (await import('./HistoryItem')).HistoryItem;
  });

  afterEach(cleanup);

  it('places hover actions on an opaque rail instead of project text', () => {
    render(
      <HistoryItem
        item={{
          id: 'project-one',
          urlId: 'project-one',
          description: 'Calendar project with a long title',
          messages: [],
          timestamp: '2026-09-21T12:00:00.000Z',
        }}
        exportChat={vi.fn()}
      />,
    );

    const actions = screen.getByLabelText('Project actions');
    expect(actions.className).toContain('bg-white');
    expect(actions.className).toContain('dark:bg-gray-950');
    expect(actions.className).not.toContain('bg-transparent');
  });
});
