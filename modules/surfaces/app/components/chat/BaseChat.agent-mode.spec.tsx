// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { PROVIDER_CATALOG } from '@bolt/agent/lib/modules/llm/provider-catalog';

vi.mock('remix-utils/client-only', () => ({
  ClientOnly: ({ children }: { children: any }) => <>{typeof children === 'function' ? children() : children}</>,
}));

vi.mock('@bolt/project/lib/hooks', () => {
  const StickToBottom = ({ children, className }: { children: any; className?: string }) => (
    <div className={className}>{children}</div>
  );
  (StickToBottom as any).Content = ({ children, className }: { children: any; className?: string }) => (
    <div className={className}>{children}</div>
  );

  return {
    StickToBottom,
    useStickToBottomContext() {
      return { isAtBottom: true, scrollToBottom: () => undefined };
    },
  };
});

vi.mock('~/components/sidebar/Menu.client', () => ({ Menu: () => null }));
vi.mock('@bolt/project/components/workbench/Workbench.client', () => ({
  Workbench: ({ embedded, forceVisible, onRequestClose }: any) => (
    <div data-testid="workbench-panel" data-embedded={embedded} data-force-visible={forceVisible}>
      Workbench Panel
      {onRequestClose ? (
        <button type="button" onClick={onRequestClose}>
          Close Workspace Panel
        </button>
      ) : null}
    </div>
  ),
}));
vi.mock('./Messages.client', () => ({ Messages: () => <div data-testid="messages-panel">Messages</div> }));
vi.mock('~/components/chat/chatExportAndImport/ImportButtons', () => ({ ImportButtons: () => null }));
vi.mock('~/components/chat/ExamplePrompts', () => ({ ExamplePrompts: () => null }));
vi.mock('./StarterTemplates', () => ({ default: () => null }));
vi.mock('./GitCloneButton', () => ({ default: () => null }));
vi.mock('@bolt/project/components/deploy/DeployAlert', () => ({ default: () => null }));
vi.mock('./ChatAlert', () => ({ default: () => null }));
vi.mock('~/components/chat/SupabaseAlert', () => ({ SupabaseChatAlert: () => null }));
vi.mock('./LLMApiAlert', () => ({ default: () => null }));
vi.mock('./ProgressCompilation', () => ({ default: () => null }));
vi.mock('./StepRunnerFeed', () => ({ StepRunnerFeed: () => <div>Technical Timeline</div> }));
vi.mock('./ExecutionTransparencyPanel', () => ({
  ExecutionTransparencyPanel: () => <div>Execution Transparency</div>,
}));
vi.mock('./ExecutionStickyFooter', () => ({ ExecutionStickyFooter: () => <div>Execution Footer</div> }));
vi.mock('./CommentaryFeed', () => ({ CommentaryFeed: () => <div>Live Commentary</div> }));
vi.mock('./ChatBox', () => ({
  ChatBox: ({ variant = 'full', provider, model, setModel, agentMode, setAgentMode }: any) => (
    <div data-testid={variant === 'agent' ? 'compact-chat-box' : 'full-chat-box'}>
      {variant === 'agent' ? (
        <>
          <select
            aria-label="Agent behavior"
            value={agentMode || 'chat'}
            onChange={(event) => setAgentMode?.(event.target.value)}
          >
            <option value="chat">Agent</option>
            <option value="plan">Plan first</option>
            <option value="act">Run plan</option>
          </select>
          {provider?.name === 'FREE' ? (
            <select aria-label="FREE coding model" value={model} onChange={(event) => setModel?.(event.target.value)}>
              {(provider.staticModels || []).map((entry: any) => (
                <option key={entry.name} value={entry.name}>
                  {entry.label}
                </option>
              ))}
            </select>
          ) : null}
        </>
      ) : null}
    </div>
  ),
}));

let BaseChat: (typeof import('./BaseChat'))['BaseChat'];

function stubModelsRequest() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ modelList: [] }),
    })),
  );
}

function hasClassToken(element: Element, className: string) {
  return element.className.toString().split(/\s+/).includes(className);
}

describe('BaseChat Agent Mode', () => {
  beforeAll(async () => {
    (window as any).__vite_plugin_react_preamble_installed__ = true;
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value: vi.fn(),
      writable: true,
    });

    BaseChat = (await import('./BaseChat')).BaseChat;
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('keeps the landing prompt simple until a project starts', async () => {
    stubModelsRequest();
    render(<BaseChat />);

    expect(await screen.findByTestId('full-chat-box')).toBeTruthy();
    expect(screen.getByTestId('chat-input-region')).toBeTruthy();
    expect(screen.queryByTestId('agent-mode-shell')).toBeNull();
    expect(screen.queryByTestId('workbench-panel')).toBeNull();
    expect(screen.queryByRole('tablist', { name: 'Workspace surfaces' })).toBeNull();
  });

  it('shows conversation, compact prompt, and workspace together after the first prompt', async () => {
    stubModelsRequest();
    render(<BaseChat chatStarted />);

    const shell = await screen.findByTestId('agent-mode-shell');
    const conversation = screen.getByTestId('agent-mode-conversation');
    const workspace = screen.getByTestId('agent-mode-workspace');
    const composer = screen.getByTestId('persistent-chat-composer');

    expect(within(shell).getByRole('heading', { name: 'Agent Mode' })).toBeTruthy();
    expect(conversation.contains(screen.getByTestId('messages-panel'))).toBe(true);
    expect(workspace.contains(screen.getByTestId('workbench-panel'))).toBe(true);
    expect(composer.contains(screen.getByTestId('compact-chat-box'))).toBe(true);
    expect(screen.queryByRole('button', { name: 'Close Workspace Panel' })).toBeNull();
    expect(screen.queryByRole('tablist', { name: 'Workspace surfaces' })).toBeNull();
  });

  it('does not navigate between surfaces when a run starts or settles', async () => {
    stubModelsRequest();

    const { rerender } = render(<BaseChat chatStarted />);

    const conversation = await screen.findByTestId('agent-mode-conversation');
    const workspace = screen.getByTestId('agent-mode-workspace');

    rerender(<BaseChat chatStarted isStreaming data={[]} />);

    await waitFor(() => expect(screen.getByText('Working')).toBeTruthy());
    expect(screen.getByTestId('agent-mode-conversation')).toBe(conversation);
    expect(screen.getByTestId('agent-mode-workspace')).toBe(workspace);
    expect(hasClassToken(conversation, 'hidden')).toBe(false);
    expect(hasClassToken(workspace, 'hidden')).toBe(true);

    rerender(<BaseChat chatStarted isStreaming={false} data={[]} />);

    await waitFor(() => expect(screen.getByText('Ready')).toBeTruthy());
    expect(screen.getByTestId('agent-mode-conversation')).toBe(conversation);
    expect(screen.getByTestId('agent-mode-workspace')).toBe(workspace);
  });

  it('uses an explicit mobile viewport switch while keeping the prompt mounted', async () => {
    stubModelsRequest();
    render(<BaseChat chatStarted />);

    const mobileTabs = await screen.findByRole('tablist', { name: 'Agent Mode mobile view' });
    fireEvent.click(within(mobileTabs).getByRole('tab', { name: 'App' }));

    expect(within(mobileTabs).getByRole('tab', { name: 'App' }).getAttribute('aria-selected')).toBe('true');
    expect(hasClassToken(screen.getByTestId('agent-mode-conversation'), 'hidden')).toBe(true);
    expect(hasClassToken(screen.getByTestId('agent-mode-workspace'), 'hidden')).toBe(false);
    expect(screen.getByTestId('persistent-chat-composer').contains(screen.getByTestId('compact-chat-box'))).toBe(true);
  });

  it('keeps a queued follow-up visible beside the persistent composer', async () => {
    stubModelsRequest();
    render(
      <BaseChat
        chatStarted
        queuedVisibleFollowUp={{
          content: 'Add an agenda sidebar with the exact text CAL_FUP_123.',
          queuedAt: Date.now(),
        }}
      />,
    );

    expect(await screen.findByText(/Follow-up queued:/)).toBeTruthy();
    expect(screen.getByText(/CAL_FUP_123/)).toBeTruthy();
  });

  it('keeps FREE model and execution-mode switching available during a project', async () => {
    stubModelsRequest();

    const setModel = vi.fn();
    const setAgentMode = vi.fn();
    const freeProvider = PROVIDER_CATALOG.find((entry) => entry.name === 'FREE');

    expect(freeProvider).toBeTruthy();

    render(
      <BaseChat
        chatStarted
        provider={freeProvider}
        model="gpt-5.6-sol"
        setModel={setModel}
        agentMode="chat"
        setAgentMode={setAgentMode}
      />,
    );

    fireEvent.change(await screen.findByRole('combobox', { name: 'FREE coding model' }), {
      target: { value: 'claude-sonnet-5' },
    });
    fireEvent.change(screen.getByRole('combobox', { name: 'Agent behavior' }), {
      target: { value: 'plan' },
    });

    expect(setModel).toHaveBeenCalledWith('claude-sonnet-5');
    expect(setAgentMode).toHaveBeenCalledWith('plan');
  });

  it('shows one stable repair state without hiding either pane', async () => {
    stubModelsRequest();
    render(
      <BaseChat
        chatStarted
        isStreaming
        actionAlertAutoFixState="running"
        actionAlert={{
          type: 'error',
          title: 'Preview Error',
          description: 'The preview is restarting after a dependency fix.',
          content: 'Restart in progress.',
          source: 'preview',
        }}
      />,
    );

    expect(await screen.findByText('Repairing')).toBeTruthy();
    expect(screen.getByTestId('agent-mode-conversation')).toBeTruthy();
    expect(screen.getByTestId('agent-mode-workspace')).toBeTruthy();
  });
});
