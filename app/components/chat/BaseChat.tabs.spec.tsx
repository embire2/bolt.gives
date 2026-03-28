// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('remix-utils/client-only', () => {
  return {
    ClientOnly: ({ children }: { children: any }) => <>{typeof children === 'function' ? children() : children}</>,
  };
});

vi.mock('~/lib/hooks', () => {
  const StickToBottom = ({ children }: { children: any }) => <div>{children}</div>;
  (StickToBottom as any).Content = ({ children }: { children: any }) => <div>{children}</div>;

  return {
    StickToBottom,
    useStickToBottomContext() {
      return { isAtBottom: true, scrollToBottom: () => undefined };
    },
  };
});

vi.mock('~/components/sidebar/Menu.client', () => ({ Menu: () => null }));
vi.mock('~/components/workbench/Workbench.client', () => ({
  Workbench: ({ onRequestClose }: { onRequestClose?: () => void }) => (
    <div>
      <div data-testid="workbench-panel">Workbench Panel</div>
      <button type="button" onClick={onRequestClose}>
        Close Workspace Panel
      </button>
    </div>
  ),
}));
vi.mock('./Messages.client', () => ({ Messages: () => <div>Messages</div> }));
vi.mock('~/components/chat/chatExportAndImport/ImportButtons', () => ({ ImportButtons: () => null }));
vi.mock('~/components/chat/ExamplePrompts', () => ({ ExamplePrompts: () => null }));
vi.mock('./StarterTemplates', () => ({ default: () => null }));
vi.mock('./GitCloneButton', () => ({ default: () => null }));
vi.mock('~/components/deploy/DeployAlert', () => ({ default: () => null }));
vi.mock('./ChatAlert', () => ({ default: () => null }));
vi.mock('~/components/chat/SupabaseAlert', () => ({ SupabaseChatAlert: () => null }));
vi.mock('./LLMApiAlert', () => ({ default: () => null }));
vi.mock('./ProgressCompilation', () => ({ default: () => null }));
vi.mock('./StepRunnerFeed', () => ({ StepRunnerFeed: () => <div>Technical Timeline</div> }));
vi.mock('./ExecutionTransparencyPanel', () => ({
  ExecutionTransparencyPanel: () => <div>Execution Transparency</div>,
}));
vi.mock('./ExecutionStickyFooter', () => ({ ExecutionStickyFooter: () => <div>Execution Footer</div> }));
vi.mock('./UpdateBanner', () => ({ UpdateBanner: () => <div>Update Banner</div> }));
vi.mock('./CommentaryFeed', () => ({ CommentaryFeed: () => <div>Live Commentary</div> }));
vi.mock('./ChatBox', () => ({ ChatBox: () => <div>Chat Box</div> }));

let BaseChat: (typeof import('./BaseChat'))['BaseChat'];

describe('BaseChat surface tabs', () => {
  beforeAll(async () => {
    (window as any).__vite_plugin_react_preamble_installed__ = true;

    BaseChat = (await import('./BaseChat')).BaseChat;
  });

  afterEach(() => {
    cleanup();
    window.localStorage?.removeItem?.('bolt_surface_layout');
    vi.unstubAllGlobals();
  });

  it('lets users switch, close, and reopen the workspace tab', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ modelList: [] }),
      })),
    );

    render(<BaseChat chatStarted />);

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Chat' })).toBeTruthy();
      expect(screen.getByRole('tab', { name: 'Workspace' })).toBeTruthy();
    });

    expect(screen.queryByTestId('workbench-panel')).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: 'Workspace' }));
    expect(screen.getByTestId('workbench-panel')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Close Workspace tab' }));
    expect(screen.queryByTestId('workbench-panel')).toBeNull();
    expect(screen.getByRole('tab', { name: /Open Workspace/i })).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: /Open Workspace/i }));
    expect(screen.getByTestId('workbench-panel')).toBeTruthy();
  });
});
