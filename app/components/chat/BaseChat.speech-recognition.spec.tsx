// @vitest-environment jsdom

import React from 'react';
import { cleanup, render, waitFor } from '@testing-library/react';
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
vi.mock('~/components/workbench/Workbench.client', () => ({ Workbench: () => null }));
vi.mock('./Messages.client', () => ({ Messages: () => null }));
vi.mock('~/components/chat/chatExportAndImport/ImportButtons', () => ({ ImportButtons: () => null }));
vi.mock('~/components/chat/ExamplePrompts', () => ({ ExamplePrompts: () => null }));
vi.mock('./StarterTemplates', () => ({ default: () => null }));
vi.mock('./GitCloneButton', () => ({ default: () => null }));
vi.mock('~/components/deploy/DeployAlert', () => ({ default: () => null }));
vi.mock('./ChatAlert', () => ({ default: () => null }));
vi.mock('~/components/chat/SupabaseAlert', () => ({ SupabaseChatAlert: () => null }));
vi.mock('./LLMApiAlert', () => ({ default: () => null }));
vi.mock('./ProgressCompilation', () => ({ default: () => null }));
vi.mock('./StepRunnerFeed', () => ({ StepRunnerFeed: () => null }));
vi.mock('./ChatBox', () => ({ ChatBox: () => null }));

let BaseChat: (typeof import('./BaseChat'))['BaseChat'];

let lastRecognition: any;

class MockSpeechRecognition {
  continuous = false;
  interimResults = false;
  onresult?: (event: any) => void;
  onerror?: (event: any) => void;

  start = vi.fn();
  stop = vi.fn();
  abort = vi.fn();

  constructor() {
    lastRecognition = this;
  }
}

describe('BaseChat speech recognition', () => {
  beforeAll(async () => {
    (window as any).__vite_plugin_react_preamble_installed__ = true;

    (window as any).SpeechRecognition = MockSpeechRecognition;
    (window as any).webkitSpeechRecognition = MockSpeechRecognition;

    BaseChat = (await import('./BaseChat')).BaseChat;
  });

  afterEach(() => {
    cleanup();
    lastRecognition = undefined;
    vi.unstubAllGlobals();
  });

  it('pipes recognized transcript into handleInputChange', async () => {
    const handleInputChange = vi.fn();

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ modelList: [] }),
      })),
    );

    render(<BaseChat handleInputChange={handleInputChange} />);

    await waitFor(() => {
      expect(lastRecognition).toBeTruthy();
    });

    lastRecognition.onresult?.({
      results: [[{ transcript: 'hello ' }], [{ transcript: 'world' }]],
    });

    await waitFor(() => {
      expect(handleInputChange).toHaveBeenCalled();
    });

    const eventArg = handleInputChange.mock.calls.at(-1)?.[0];
    expect(eventArg?.target?.value).toBe('hello world');
  });
});
