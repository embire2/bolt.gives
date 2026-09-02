// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { PROVIDER_CATALOG } from '@bolt/agent/lib/modules/llm/provider-catalog';

vi.mock('@bolt/project/lib/stores/settings', () => ({ LOCAL_PROVIDERS: ['Ollama', 'LMStudio'] }));
vi.mock('remix-utils/client-only', () => ({
  ClientOnly: ({ children }: { children: any }) => <>{typeof children === 'function' ? children() : children}</>,
}));
vi.mock('./FilePreview', () => ({ default: () => null }));
vi.mock('./ScreenshotStateManager', () => ({ ScreenshotStateManager: () => null }));
vi.mock('~/components/ui/ColorSchemeDialog', () => ({ ColorSchemeDialog: () => <button>Design</button> }));
vi.mock('./MCPTools', () => ({ McpTools: () => <button>MCP</button> }));
vi.mock('./SketchCanvas', () => ({ SketchCanvas: () => <button>Sketch</button> }));
vi.mock('./SupabaseConnection', () => ({ SupabaseConnection: () => <button>Database</button> }));
vi.mock('@bolt/project/components/workbench/ExpoQrModal', () => ({ ExpoQrModal: () => null }));
vi.mock('~/components/chat/SpeechRecognition', () => ({ SpeechRecognitionButton: () => <button>Speech</button> }));
vi.mock('~/components/chat/ModelSelector', () => ({ ModelSelector: () => <div>Provider selector</div> }));
vi.mock('./APIKeyManager', () => ({ APIKeyManager: () => <div>API key manager</div> }));
vi.mock('./WebSearch.client', () => ({ WebSearch: () => <button>Browse URL</button> }));
vi.mock('~/components/ui/IconButton', () => ({
  IconButton: ({ title, children, onClick, disabled }: any) => (
    <button type="button" title={title} onClick={onClick} disabled={disabled}>
      {children || title}
    </button>
  ),
}));

const freeProvider = PROVIDER_CATALOG.find((entry) => entry.name === 'FREE');
let ChatBox: (typeof import('./ChatBox'))['ChatBox'];

function renderAgentComposer(overrides: Record<string, unknown> = {}) {
  if (!freeProvider) {
    throw new Error('FREE provider is missing from the provider catalog');
  }

  const props = {
    variant: 'agent' as const,
    isModelSettingsCollapsed: true,
    setIsModelSettingsCollapsed: vi.fn(),
    provider: freeProvider,
    providerList: [freeProvider],
    modelList: [],
    apiKeys: {},
    isModelLoading: undefined,
    onApiKeysChange: vi.fn(),
    uploadedFiles: [],
    imageDataList: [],
    textareaRef: React.createRef<HTMLTextAreaElement>(),
    input: '',
    handlePaste: vi.fn(),
    TEXTAREA_MIN_HEIGHT: 40,
    TEXTAREA_MAX_HEIGHT: 96,
    isStreaming: false,
    handleSendMessage: vi.fn(),
    isListening: false,
    startListening: vi.fn(),
    stopListening: vi.fn(),
    chatStarted: true,
    qrModalOpen: false,
    setQrModalOpen: vi.fn(),
    handleFileUpload: vi.fn(),
    model: 'gpt-5.6-sol',
    setModel: vi.fn(),
    agentMode: 'chat' as const,
    setAgentMode: vi.fn(),
    ...overrides,
  };

  render(<ChatBox {...props} />);

  return props;
}

describe('ChatBox Agent Mode composer', () => {
  beforeAll(async () => {
    (window as any).__vite_plugin_react_preamble_installed__ = true;
    ChatBox = (await import('./ChatBox')).ChatBox;
  });

  afterEach(cleanup);

  it('keeps model and agent behavior controls visible without the full prompt chrome', () => {
    const props = renderAgentComposer();

    expect(screen.getByTestId('agent-compact-composer')).toBeTruthy();
    expect(screen.getByLabelText('FREE coding model')).toHaveProperty('value', 'gpt-5.6-sol');
    expect(screen.getByLabelText('Agent behavior')).toHaveProperty('value', 'chat');
    expect(screen.getByRole('textbox').getAttribute('placeholder')).toContain('build or change');

    fireEvent.change(screen.getByRole('combobox', { name: 'FREE coding model' }), {
      target: { value: 'claude-opus-4-8' },
    });
    fireEvent.change(screen.getByRole('combobox', { name: 'Agent behavior' }), {
      target: { value: 'plan' },
    });

    expect(props.setModel).toHaveBeenCalledWith('claude-opus-4-8');
    expect(props.setAgentMode).toHaveBeenCalledWith('plan');
  });

  it('submits on Enter and keeps secondary provider controls in the tools disclosure', async () => {
    const handleSendMessage = vi.fn();
    renderAgentComposer({ input: 'Build a calendar', handleSendMessage });

    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', shiftKey: false });
    expect(handleSendMessage).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByLabelText('Open agent tools'));

    await waitFor(() => expect(screen.getByText('Provider selector')).toBeTruthy());
    expect(screen.getByText('Agent tools')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Browse URL' })).toBeTruthy();
  });
});
