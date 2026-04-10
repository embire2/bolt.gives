// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { workbenchStore } from '~/lib/stores/workbench';

const localStorageState = new Map<string, string>();

const localStorageMock = {
  getItem: vi.fn((key: string) => localStorageState.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => {
    localStorageState.set(key, value);
  }),
  removeItem: vi.fn((key: string) => {
    localStorageState.delete(key);
  }),
  clear: vi.fn(() => {
    localStorageState.clear();
  }),
};

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

function hasClassToken(element: Element | null, className: string) {
  return (element?.className ?? '').toString().split(/\s+/).includes(className);
}

describe('BaseChat surface tabs', () => {
  beforeAll(async () => {
    (window as any).__vite_plugin_react_preamble_installed__ = true;

    BaseChat = (await import('./BaseChat')).BaseChat;
  });

  afterEach(() => {
    cleanup();
    localStorageMock.clear();
    workbenchStore.showWorkbench.set(false);
    workbenchStore.stepRunnerEvents.set([]);
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

    const chatTab = screen.getByRole('tab', { name: 'Chat' });
    const workspaceTab = screen.getByRole('tab', { name: 'Workspace' });

    expect(chatTab.className).toContain('text-bolt-elements-textPrimary');
    expect(workspaceTab.className).toContain('text-bolt-elements-textSecondary');

    expect(hasClassToken(screen.getByTestId('workbench-panel').closest('#workspace-surface-panel'), 'hidden')).toBe(
      true,
    );

    fireEvent.click(workspaceTab);
    expect(workspaceTab.className).toContain('text-bolt-elements-textPrimary');
    expect(chatTab.className).toContain('text-bolt-elements-textSecondary');
    expect(
      hasClassToken((await screen.findByTestId('workbench-panel')).closest('#workspace-surface-panel'), 'hidden'),
    ).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Close Workspace tab' }));
    expect(screen.queryByTestId('workbench-panel')).toBeNull();
    expect(screen.getByRole('tab', { name: /Open Workspace/i })).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: /Open Workspace/i }));
    expect(
      hasClassToken((await screen.findByTestId('workbench-panel')).closest('#workspace-surface-panel'), 'hidden'),
    ).toBe(false);
  });

  it('keeps chat active when the workspace becomes available automatically', async () => {
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
    });

    workbenchStore.showWorkbench.set(true);

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Workspace' })).toBeTruthy();
    });

    expect(screen.getByRole('tab', { name: 'Chat' }).className).toContain('text-bolt-elements-textPrimary');
    expect(screen.getByRole('tab', { name: 'Workspace' }).className).toContain('text-bolt-elements-textSecondary');
    expect(hasClassToken(screen.getByTestId('workbench-panel').closest('#workspace-surface-panel'), 'hidden')).toBe(
      true,
    );
  });

  it('auto-switches to the workspace when execution activity starts', async () => {
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
    });

    workbenchStore.stepRunnerEvents.set([
      {
        type: 'step-start',
        timestamp: new Date().toISOString(),
        description: 'Run shell command: pnpm install',
        stepIndex: 1,
      },
    ]);

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Workspace' })).toBeTruthy();
    });

    expect(hasClassToken(screen.getByTestId('workbench-panel').closest('#workspace-surface-panel'), 'hidden')).toBe(
      true,
    );
    expect(screen.getByRole('tab', { name: 'Chat' }).className).toContain('text-bolt-elements-textPrimary');
    expect(screen.getByRole('tab', { name: 'Workspace' }).className).toContain('text-bolt-elements-textSecondary');
    expect(screen.getByTestId('chat-input-region').className).not.toContain('sticky');
  });

  it('boots into chat even if workspace was the last persisted active surface', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ modelList: [] }),
      })),
    );

    vi.stubGlobal('localStorage', localStorageMock);

    localStorageMock.setItem(
      'bolt_surface_layout',
      JSON.stringify({
        openTabs: ['chat', 'workspace'],
        activeTab: 'workspace',
      }),
    );

    render(<BaseChat chatStarted />);

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Chat' })).toBeTruthy();
      expect(screen.getByRole('tab', { name: 'Workspace' })).toBeTruthy();
    });

    expect(hasClassToken(screen.getByTestId('workbench-panel').closest('#workspace-surface-panel'), 'hidden')).toBe(
      true,
    );
    expect(screen.getByRole('tab', { name: 'Chat' }).className).toContain('text-bolt-elements-textPrimary');
    expect(screen.getByRole('tab', { name: 'Workspace' }).className).toContain('text-bolt-elements-textSecondary');
  });

  it('keeps the chat surface mounted when the workspace tab is active', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ modelList: [] }),
      })),
    );

    render(<BaseChat chatStarted />);

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Workspace' })).toBeTruthy();
    });

    const chatInputRegion = screen.getByTestId('chat-input-region');
    expect(hasClassToken(chatInputRegion.closest('#chat-surface-panel'), 'hidden')).toBe(false);

    fireEvent.click(screen.getByRole('tab', { name: 'Workspace' }));

    await waitFor(() => {
      expect(hasClassToken(screen.getByTestId('workbench-panel').closest('#workspace-surface-panel'), 'hidden')).toBe(
        false,
      );
    });

    expect(hasClassToken(screen.getByTestId('chat-input-region').closest('#chat-surface-panel'), 'hidden')).toBe(true);
    expect(chatInputRegion.isConnected).toBe(true);
  });
});
