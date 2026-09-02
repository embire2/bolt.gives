import type { JSONValue, Message } from 'ai';
import React, { Suspense, type RefCallback, useEffect, useRef, useState } from 'react';
import { ClientOnly } from 'remix-utils/client-only';
import { Menu } from '~/components/sidebar/Menu.client';
import { classNames } from '@bolt/core/utils/classNames';
import { PROVIDER_LIST } from '@bolt/agent/utils/constants';
import {
  getApiKeysFromCookies,
  loadApiKeysFromSecureStorage,
  removeApiKeysCookie,
  setApiKeysCookie,
} from '@bolt/agent/lib/runtime/api-key-storage';
import { ChatBox } from './ChatBox';
import * as Tooltip from '@radix-ui/react-tooltip';
import styles from './BaseChat.module.scss';
import { ImportButtons } from '~/components/chat/chatExportAndImport/ImportButtons';
import { ExamplePrompts } from '~/components/chat/ExamplePrompts';
import GitCloneButton from './GitCloneButton';
import type { ProviderInfo } from '@bolt/agent/types/model';
import StarterTemplates from './StarterTemplates';
import type { ActionAlert, SupabaseAlert, DeployAlert, LlmErrorAlertType } from '@bolt/core/types/actions';
import ChatAlert from './ChatAlert';
import type { ModelInfo } from '@bolt/agent/lib/modules/llm/types';
import ProgressCompilation from './ProgressCompilation';
import type { AgentRunMetricsDataEvent, ProgressAnnotation, UsageDataEvent } from '@bolt/core/types/context';
import { expoUrlAtom } from '@bolt/project/lib/stores/qrCodeStore';
import { useStore } from '@nanostores/react';
import { StickToBottom, useStickToBottomContext } from '@bolt/project/lib/hooks';
import type { DesignScheme } from '@bolt/core/types/design-scheme';
import type { ElementInfo } from '@bolt/project/components/workbench/Inspector';
import type { SketchElement } from './SketchCanvas';
import type { AutonomyMode } from '@bolt/agent/lib/runtime/autonomy';
import { getProfileFirstName, useProfile } from '~/lib/profile-context';
import { logStore } from '@bolt/project/lib/stores/logs';
import { AgentModeShell } from './AgentModeShell';

const TEXTAREA_MIN_HEIGHT = 72;

const LazyWorkbench = React.lazy(() =>
  import('@bolt/project/components/workbench/Workbench.client').then((module) => ({ default: module.Workbench })),
);
const LazyMessages = React.lazy(() => import('./Messages.client').then((module) => ({ default: module.Messages })));
const LazyCommentaryFeed = React.lazy(() =>
  import('./CommentaryFeed').then((module) => ({ default: module.CommentaryFeed })),
);
const LazyStepRunnerFeed = React.lazy(() =>
  import('./StepRunnerFeed').then((module) => ({ default: module.StepRunnerFeed })),
);
const LazyExecutionTransparencyPanel = React.lazy(() =>
  import('./ExecutionTransparencyPanel').then((module) => ({ default: module.ExecutionTransparencyPanel })),
);
const LazyExecutionStickyFooter = React.lazy(() =>
  import('./ExecutionStickyFooter').then((module) => ({ default: module.ExecutionStickyFooter })),
);
const LazyDeployChatAlert = React.lazy(() =>
  import('@bolt/project/components/deploy/DeployAlert').then((module) => ({ default: module.default })),
);
const LazySupabaseChatAlert = React.lazy(() =>
  import('~/components/chat/SupabaseAlert').then((module) => ({ default: module.SupabaseChatAlert })),
);
const LazyLlmErrorAlert = React.lazy(() => import('./LLMApiAlert').then((module) => ({ default: module.default })));

function LazyPanelFallback({ title }: { title: string }) {
  return (
    <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-3 text-xs text-bolt-elements-textSecondary">
      <div className="font-medium text-bolt-elements-textPrimary">{title}</div>
      <div className="mt-2 text-bolt-elements-textTertiary">Loading...</div>
    </div>
  );
}

function DeferredTechnicalDetails({ children }: { children: React.ReactNode }) {
  const [hasOpened, setHasOpened] = useState(false);

  return (
    <details
      className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2"
      onToggle={(event) => {
        if (event.currentTarget.open) {
          setHasOpened(true);
        }
      }}
    >
      <summary className="cursor-pointer list-none px-3 py-2 text-xs font-medium text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary [&::-webkit-details-marker]:hidden">
        <span className="mr-2 i-ph:terminal-window" aria-hidden="true" />
        Technical details
      </summary>
      {hasOpened ? <div className="border-t border-bolt-elements-borderColor p-2">{children}</div> : null}
    </details>
  );
}

interface BaseChatProps {
  textareaRef?: React.RefObject<HTMLTextAreaElement> | undefined;
  messageRef?: RefCallback<HTMLDivElement> | undefined;
  scrollRef?: RefCallback<HTMLDivElement> | undefined;
  showChat?: boolean;
  chatStarted?: boolean;
  isStreaming?: boolean;
  onStreamingChange?: (streaming: boolean) => void;
  messages?: Message[];
  description?: string;
  enhancingPrompt?: boolean;
  promptEnhanced?: boolean;
  input?: string;
  model?: string;
  setModel?: (model: string) => void;
  provider?: ProviderInfo;
  setProvider?: (provider: ProviderInfo) => void;
  onProviderSelection?: (provider: ProviderInfo, preferredModel?: string) => void;
  providerList?: ProviderInfo[];
  handleStop?: () => void;
  sendMessage?: (event: React.UIEvent, messageInput?: string) => void;
  handleInputChange?: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  enhancePrompt?: () => void;
  importChat?: (description: string, messages: Message[]) => Promise<void>;
  exportChat?: () => void;
  uploadedFiles?: File[];
  setUploadedFiles?: (files: File[]) => void;
  imageDataList?: string[];
  setImageDataList?: (dataList: string[]) => void;
  actionAlert?: ActionAlert;
  actionAlertAutoFixState?: 'queued' | 'running';
  clearAlert?: () => void;
  supabaseAlert?: SupabaseAlert;
  clearSupabaseAlert?: () => void;
  deployAlert?: DeployAlert;
  clearDeployAlert?: () => void;
  llmErrorAlert?: LlmErrorAlertType;
  clearLlmErrorAlert?: () => void;
  data?: JSONValue[] | undefined;
  chatMode?: 'discuss' | 'build';
  setChatMode?: (mode: 'discuss' | 'build') => void;
  append?: (message: Message) => void;
  designScheme?: DesignScheme;
  setDesignScheme?: (scheme: DesignScheme) => void;
  selectedElement?: ElementInfo | null;
  setSelectedElement?: (element: ElementInfo | null) => void;
  addToolResult?: ({ toolCallId, result }: { toolCallId: string; result: any }) => void;
  onWebSearchResult?: (result: string) => void;
  onSaveSession?: () => void;
  onResumeSession?: () => void;
  onShareSession?: () => void;
  agentMode?: 'chat' | 'plan' | 'act';
  setAgentMode?: (mode: 'chat' | 'plan' | 'act') => void;
  onSketchChange?: (elements: SketchElement[]) => void;
  autonomyMode?: AutonomyMode;
  setAutonomyMode?: (mode: AutonomyMode) => void;
  latestRunMetrics?: AgentRunMetricsDataEvent | null;
  latestUsage?: UsageDataEvent | null;
  queuedVisibleFollowUp?: { content: string; queuedAt: number } | null;
  onApiKeysUpdated?: (payload: {
    apiKeys: Record<string, string>;
    providerName: string;
    apiKey: string;
    providerModels: ModelInfo[];
  }) => void;
}

interface TechnicalFeedContentProps {
  data?: JSONValue[] | undefined;
  progressAnnotations: ProgressAnnotation[];
  model?: string;
  provider?: ProviderInfo;
  isStreaming?: boolean;
  autonomyMode?: AutonomyMode;
  latestRunMetrics?: AgentRunMetricsDataEvent | null;
  latestUsage?: UsageDataEvent | null;
  technicalFeedRef?: React.Ref<HTMLDivElement>;
}

function TechnicalFeedContent({
  data,
  progressAnnotations,
  model,
  provider,
  isStreaming,
  autonomyMode,
  latestRunMetrics,
  latestUsage,
  technicalFeedRef,
}: TechnicalFeedContentProps) {
  return (
    <div
      ref={technicalFeedRef}
      className="modern-scrollbar min-h-[160px] max-h-[32vh] overflow-x-hidden overflow-y-auto rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-2 sm:min-h-[190px] sm:max-h-[38vh] md:min-h-[220px] md:max-h-[44vh]"
    >
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-bolt-elements-textSecondary">
        Technical Feed
      </div>
      <div className="space-y-2">
        {progressAnnotations && <ProgressCompilation data={progressAnnotations} />}
        <Suspense fallback={<LazyPanelFallback title="Execution Transparency" />}>
          <LazyExecutionTransparencyPanel
            data={data}
            model={model}
            provider={provider}
            isStreaming={isStreaming}
            autonomyMode={autonomyMode}
            latestRunMetrics={latestRunMetrics}
            latestUsage={latestUsage}
          />
        </Suspense>
        <Suspense fallback={<LazyPanelFallback title="Technical Timeline" />}>
          <LazyStepRunnerFeed data={data} includeCommentary={false} title="Technical Timeline" />
        </Suspense>
        <Suspense fallback={<LazyPanelFallback title="Execution Status" />}>
          <LazyExecutionStickyFooter data={data} model={model} provider={provider} isStreaming={isStreaming} />
        </Suspense>
      </div>
    </div>
  );
}

export const BaseChat = React.forwardRef<HTMLDivElement, BaseChatProps>(
  (
    {
      textareaRef,
      chatStarted = false,
      isStreaming = false,
      onStreamingChange,
      model,
      setModel,
      provider,
      setProvider,
      onProviderSelection,
      providerList,
      input = '',
      enhancingPrompt,
      handleInputChange,

      // promptEnhanced,
      enhancePrompt,
      sendMessage,
      handleStop,
      importChat,
      exportChat,
      uploadedFiles = [],
      setUploadedFiles,
      imageDataList = [],
      setImageDataList,
      messages,
      actionAlert,
      actionAlertAutoFixState,
      clearAlert,
      deployAlert,
      clearDeployAlert,
      supabaseAlert,
      clearSupabaseAlert,
      llmErrorAlert,
      clearLlmErrorAlert,
      data,
      chatMode,
      setChatMode,
      append,
      designScheme,
      setDesignScheme,
      selectedElement,
      setSelectedElement,
      addToolResult = () => {
        throw new Error('addToolResult not implemented');
      },
      onWebSearchResult,
      onSaveSession,
      onResumeSession,
      onShareSession,
      agentMode,
      setAgentMode,
      onSketchChange,
      autonomyMode,
      setAutonomyMode,
      latestRunMetrics,
      latestUsage,
      queuedVisibleFollowUp,
      onApiKeysUpdated,
    },
    ref,
  ) => {
    const profile = useProfile();
    const firstName = getProfileFirstName(profile);
    const TEXTAREA_MAX_HEIGHT = chatStarted ? 132 : 136;
    const [apiKeys, setApiKeys] = useState<Record<string, string>>(getApiKeysFromCookies());
    const hasAnyApiKey = Object.values(apiKeys).some((v) => typeof v === 'string' && v.trim().length > 0);
    const [modelList, setModelList] = useState<ModelInfo[]>([]);
    const [isModelSettingsCollapsed, setIsModelSettingsCollapsed] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [recognition, setRecognition] = useState<SpeechRecognition | null>(null);
    const [isModelLoading, setIsModelLoading] = useState<string | undefined>('all');
    const [progressAnnotations, setProgressAnnotations] = useState<ProgressAnnotation[]>([]);
    const commentaryFeedRef = useRef<HTMLDivElement | null>(null);
    const technicalFeedRef = useRef<HTMLDivElement | null>(null);
    const expoUrl = useStore(expoUrlAtom);
    const [qrModalOpen, setQrModalOpen] = useState(false);
    const providerListSignature = (providerList || PROVIDER_LIST).map((item) => item.name).join('|');
    const promptSurfaceMountLoggedRef = useRef(false);

    useEffect(() => {
      if (expoUrl) {
        setQrModalOpen(true);
      }
    }, [expoUrl]);

    useEffect(() => {
      if (data) {
        const progressList = data.filter(
          (x) => typeof x === 'object' && (x as any).type === 'progress',
        ) as ProgressAnnotation[];
        setProgressAnnotations(progressList);
      }
    }, [data]);

    useEffect(() => {
      if (!chatStarted) {
        return;
      }

      const commentaryElement = commentaryFeedRef.current;
      const feedElement = technicalFeedRef.current;

      if (!commentaryElement && !feedElement) {
        return;
      }

      if (!isStreaming && !(data && data.length > 0)) {
        return;
      }

      commentaryElement?.scrollTo({
        top: commentaryElement.scrollHeight,
        behavior: 'auto',
      });

      feedElement?.scrollTo({
        top: feedElement.scrollHeight,
        behavior: 'auto',
      });
    }, [chatStarted, data, isStreaming, progressAnnotations.length]);

    useEffect(() => {
      if (!textareaRef?.current || promptSurfaceMountLoggedRef.current) {
        return;
      }

      promptSurfaceMountLoggedRef.current = true;
      logStore.logSystem('Chat input mounted', {
        provider: provider?.name,
        model,
        chatStarted,
      });
    }, [chatStarted, input, model, provider?.name, textareaRef]);
    useEffect(() => {
      onStreamingChange?.(isStreaming);
    }, [isStreaming, onStreamingChange]);

    useEffect(() => {
      if (typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;

        recognition.onresult = (event) => {
          const transcript = Array.from(event.results)
            .map((result) => result[0])
            .map((result) => result.transcript)
            .join('');

          if (handleInputChange) {
            const syntheticEvent = {
              target: { value: transcript },
            } as React.ChangeEvent<HTMLTextAreaElement>;
            handleInputChange(syntheticEvent);
          }
        };

        recognition.onerror = (event) => {
          console.error('Speech recognition error:', event.error);
          setIsListening(false);
        };

        setRecognition(recognition);
      }
    }, []);

    useEffect(() => {
      if (typeof window === 'undefined') {
        return undefined;
      }

      let disposed = false;
      const modelsRequestController = new AbortController();
      let parsedApiKeys: Record<string, string> | undefined = {};

      try {
        parsedApiKeys = getApiKeysFromCookies();
        setApiKeys(parsedApiKeys);

        if (Object.keys(parsedApiKeys).length === 0) {
          void loadApiKeysFromSecureStorage().then((secureApiKeys) => {
            if (disposed || Object.keys(secureApiKeys).length === 0) {
              return;
            }

            setApiKeys(secureApiKeys);
            setApiKeysCookie(secureApiKeys);
          });
        }
      } catch (error) {
        console.error('Error loading API keys from cookies:', error);
        removeApiKeysCookie();
      }

      setIsModelLoading('all');
      fetch('/api/models', { signal: modelsRequestController.signal })
        .then((response) => response.json())
        .then((data) => {
          if (disposed) {
            return;
          }

          const typedData = data as { modelList: ModelInfo[] };
          setModelList(typedData.modelList);
        })
        .catch((error) => {
          if (error?.name === 'AbortError') {
            return;
          }

          console.error('Error fetching model list:', error);
        })
        .finally(() => {
          if (!disposed) {
            setIsModelLoading(undefined);
          }
        });

      return () => {
        disposed = true;
        modelsRequestController.abort();
      };
    }, [providerListSignature]);

    const onApiKeysChange = async (providerName: string, apiKey: string) => {
      const normalizedApiKey = apiKey.trim();
      const newApiKeys = { ...apiKeys, [providerName]: normalizedApiKey };
      setApiKeys(newApiKeys);
      setApiKeysCookie(newApiKeys, 365);

      setIsModelLoading(providerName);

      let providerModels: ModelInfo[] = [];

      try {
        const response = await fetch(`/api/models/${encodeURIComponent(providerName)}`);
        const data = await response.json();
        providerModels = (data as { modelList: ModelInfo[] }).modelList;
      } catch (error) {
        console.error('Error loading dynamic models for:', providerName, error);
      }

      // Only update models for the specific provider
      setModelList((prevModels) => {
        const otherModels = prevModels.filter((model) => model.provider !== providerName);
        return [...otherModels, ...providerModels];
      });
      setIsModelLoading(undefined);

      onApiKeysUpdated?.({
        apiKeys: newApiKeys,
        providerName,
        apiKey: normalizedApiKey,
        providerModels,
      });
    };

    const startListening = () => {
      if (recognition) {
        recognition.start();
        setIsListening(true);
      }
    };

    const stopListening = () => {
      if (recognition) {
        recognition.stop();
        setIsListening(false);
      }
    };

    const handleSendMessage = (event: React.UIEvent, messageInput?: string) => {
      if (sendMessage) {
        sendMessage(event, messageInput);
        setSelectedElement?.(null);

        if (recognition) {
          recognition.abort(); // Stop current recognition
          setIsListening(false);

          // Clear the input by triggering handleInputChange with empty value
          if (handleInputChange) {
            const syntheticEvent = {
              target: { value: '' },
            } as React.ChangeEvent<HTMLTextAreaElement>;
            handleInputChange(syntheticEvent);
          }
        }
      }
    };

    const handleFileUpload = () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';

      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];

        if (file) {
          const reader = new FileReader();

          reader.onload = (e) => {
            const base64Image = e.target?.result as string;
            setUploadedFiles?.([...uploadedFiles, file]);
            setImageDataList?.([...imageDataList, base64Image]);
          };
          reader.readAsDataURL(file);
        }
      };

      input.click();
    };

    const handlePaste = async (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items;

      if (!items) {
        return;
      }

      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();

          const file = item.getAsFile();

          if (file) {
            const reader = new FileReader();

            reader.onload = (e) => {
              const base64Image = e.target?.result as string;
              setUploadedFiles?.([...uploadedFiles, file]);
              setImageDataList?.([...imageDataList, base64Image]);
            };
            reader.readAsDataURL(file);
          }

          break;
        }
      }
    };

    const alertStack = (
      <div className="flex flex-col gap-2">
        {deployAlert && (
          <Suspense fallback={<LazyPanelFallback title="Deployment Alert" />}>
            <LazyDeployChatAlert
              alert={deployAlert}
              clearAlert={() => clearDeployAlert?.()}
              postMessage={(message: string | undefined) => {
                sendMessage?.({} as any, message);
                clearSupabaseAlert?.();
              }}
            />
          </Suspense>
        )}
        {supabaseAlert && (
          <Suspense fallback={<LazyPanelFallback title="Supabase Alert" />}>
            <LazySupabaseChatAlert
              alert={supabaseAlert}
              clearAlert={() => clearSupabaseAlert?.()}
              postMessage={(message) => {
                sendMessage?.({} as any, message);
                clearSupabaseAlert?.();
              }}
            />
          </Suspense>
        )}
        {actionAlert && (
          <ChatAlert
            alert={actionAlert}
            autoFixState={actionAlertAutoFixState}
            clearAlert={() => clearAlert?.()}
            postMessage={(message) => {
              sendMessage?.({} as any, message);
              clearAlert?.();
            }}
          />
        )}
        {llmErrorAlert && (
          <Suspense fallback={<LazyPanelFallback title="Provider Alert" />}>
            <LazyLlmErrorAlert alert={llmErrorAlert} clearAlert={() => clearLlmErrorAlert?.()} />
          </Suspense>
        )}
      </div>
    );

    const activityFeeds = chatStarted ? (
      <div className="space-y-2" aria-label="Agent activity">
        <Suspense fallback={<LazyPanelFallback title="Live Commentary" />}>
          <LazyCommentaryFeed data={data} scrollRef={commentaryFeedRef} />
        </Suspense>
        <DeferredTechnicalDetails>
          <TechnicalFeedContent
            data={data}
            progressAnnotations={progressAnnotations}
            model={model}
            provider={provider}
            isStreaming={isStreaming}
            autonomyMode={autonomyMode}
            latestRunMetrics={latestRunMetrics}
            latestUsage={latestUsage}
            technicalFeedRef={technicalFeedRef}
          />
        </DeferredTechnicalDetails>
      </div>
    ) : null;

    const renderChatInputRegion = (variant: 'full' | 'agent' = 'full') => (
      <div
        data-testid={variant === 'agent' ? 'agent-composer-region' : 'chat-input-region'}
        className="flex flex-col gap-2"
      >
        <ChatBox
          variant={variant}
          isModelSettingsCollapsed={isModelSettingsCollapsed}
          setIsModelSettingsCollapsed={setIsModelSettingsCollapsed}
          provider={provider}
          setProvider={setProvider}
          onProviderSelection={onProviderSelection}
          providerList={providerList || (PROVIDER_LIST as ProviderInfo[])}
          model={model}
          setModel={setModel}
          modelList={modelList}
          apiKeys={apiKeys}
          isModelLoading={isModelLoading}
          onApiKeysChange={onApiKeysChange}
          uploadedFiles={uploadedFiles}
          setUploadedFiles={setUploadedFiles}
          imageDataList={imageDataList}
          setImageDataList={setImageDataList}
          textareaRef={textareaRef}
          input={input}
          handleInputChange={handleInputChange}
          handlePaste={handlePaste}
          TEXTAREA_MIN_HEIGHT={TEXTAREA_MIN_HEIGHT}
          TEXTAREA_MAX_HEIGHT={TEXTAREA_MAX_HEIGHT}
          isStreaming={isStreaming}
          handleStop={handleStop}
          handleSendMessage={handleSendMessage}
          enhancingPrompt={enhancingPrompt}
          enhancePrompt={enhancePrompt}
          isListening={isListening}
          startListening={startListening}
          stopListening={stopListening}
          chatStarted={chatStarted}
          exportChat={exportChat}
          qrModalOpen={qrModalOpen}
          setQrModalOpen={setQrModalOpen}
          handleFileUpload={handleFileUpload}
          chatMode={chatMode}
          setChatMode={setChatMode}
          designScheme={designScheme}
          setDesignScheme={setDesignScheme}
          selectedElement={selectedElement}
          setSelectedElement={setSelectedElement}
          onWebSearchResult={onWebSearchResult}
          onSaveSession={onSaveSession}
          onResumeSession={onResumeSession}
          onShareSession={onShareSession}
          agentMode={agentMode}
          setAgentMode={setAgentMode}
          onSketchChange={onSketchChange}
          autonomyMode={autonomyMode}
          setAutonomyMode={setAutonomyMode}
        />
        {queuedVisibleFollowUp ? (
          <div className="mx-auto w-full max-w-chat rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-xs text-bolt-elements-textSecondary">
            <span className="font-medium text-bolt-elements-textPrimary">Follow-up queued:</span>{' '}
            {queuedVisibleFollowUp.content.slice(0, 180)}
            {queuedVisibleFollowUp.content.length > 180 ? '...' : ''}
          </div>
        ) : null}
        {variant === 'full' ? (
          <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2 text-xs text-bolt-elements-textSecondary">
            <span className="font-medium text-bolt-elements-textPrimary">Built-in web research:</span> Bolt.gives can
            browse the web with Playwright, study API documentation from a URL, and generate a <code>.md</code> file
            with its understanding of the full API environment. No setup is required.
          </div>
        ) : null}
      </div>
    );

    const renderPromptBlock = (placement: 'intro' | 'persistent') => (
      <div
        className={classNames('z-prompt mx-auto flex w-full flex-col gap-3', {
          'my-auto mb-6': placement === 'intro',
          'py-2': placement === 'persistent',
        })}
      >
        {alertStack}
        {renderChatInputRegion()}
      </div>
    );

    const chatSurface = (
      <div
        className={classNames(
          styles.Chat,
          'relative flex h-full min-h-0 w-full flex-col overflow-y-auto overflow-x-hidden modern-scrollbar',
        )}
      >
        {!chatStarted && (
          <div id="intro" className="mt-[10vh] sm:mt-[12vh] lg:mt-[16vh] mx-auto max-w-3xl px-4 text-center lg:px-0">
            <h1 className="mb-3 text-4xl font-bold text-bolt-elements-textPrimary animate-fade-in sm:text-5xl lg:text-6xl">
              {firstName ? `Hi ${firstName}, what are we creating today?` : 'What are we creating today?'}
            </h1>
            <p className="mb-6 text-base text-bolt-elements-textSecondary animate-fade-in animation-delay-200 sm:mb-8 sm:text-lg lg:text-xl">
              Create / Approve / Rinse / Repeat. There are no limits to your creativity with Bolt.gives
            </p>
          </div>
        )}
        <StickToBottom
          className={classNames('relative mx-auto w-full max-w-[980px] px-3 pt-6 sm:px-6 lg:px-8', {
            'flex h-full min-h-0 flex-col overflow-y-auto overscroll-contain modern-scrollbar': chatStarted,
          })}
          resize="smooth"
          initial="smooth"
        >
          <StickToBottom.Content className="relative flex min-h-0 flex-col gap-4">
            <ClientOnly>
              {() => {
                return chatStarted ? (
                  <Suspense fallback={<LazyPanelFallback title="Conversation" />}>
                    <LazyMessages
                      className="z-1 mx-auto flex w-full flex-1 flex-col pb-4"
                      messages={messages}
                      isStreaming={isStreaming}
                      append={append}
                      chatMode={chatMode}
                      setChatMode={setChatMode}
                      provider={provider}
                      model={model}
                      addToolResult={addToolResult}
                    />
                  </Suspense>
                ) : null;
              }}
            </ClientOnly>
            <ScrollToBottom />
          </StickToBottom.Content>
          {!chatStarted ? renderPromptBlock('intro') : null}
        </StickToBottom>
        {chatStarted ? (
          <div className="mx-auto w-full max-w-[980px] px-3 pb-4 sm:px-6 lg:px-8">{activityFeeds}</div>
        ) : null}
        <div className="flex flex-col justify-center px-3 pb-4 sm:px-6 lg:px-8">
          {!chatStarted && (
            <div className="flex justify-center gap-2">
              {ImportButtons(importChat)}
              <GitCloneButton importChat={importChat} />
            </div>
          )}
          <div className="flex flex-col gap-5">
            {!chatStarted && !hasAnyApiKey && (
              <div className="mx-auto w-full max-w-[980px] rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 text-sm">
                <div className="flex items-start gap-3">
                  <div className="i-ph:rocket-launch-duotone mt-0.5 text-2xl text-bolt-elements-textPrimary" />
                  <div className="flex-1">
                    <div className="font-medium text-bolt-elements-textPrimary">
                      Getting started with your bolt.gives profile
                    </div>
                    <div className="mt-1 space-y-1 text-bolt-elements-textSecondary">
                      <div>
                        1. Start with FREE and choose ChatGPT-5.6 SOL, Opus 4.8, Sonnet 5, or Fable 5. No API key is
                        required.
                      </div>
                      <div>2. Or pick your own provider (OpenAI, Anthropic, Google, OpenRouter, Ollama, etc.).</div>
                      <div>3. For another cloud provider, add its API key in the chat box or Settings.</div>
                      <div className="mt-2 text-xs">
                        Note: keys you supply for other providers stay in your browser and are sent only with requests
                        to that provider. The hosted FREE key remains server-side.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {!chatStarted &&
              ExamplePrompts((event, messageInput) => {
                if (isStreaming) {
                  handleStop?.();
                  return;
                }

                handleSendMessage?.(event, messageInput);
              })}
            {!chatStarted && <StarterTemplates />}
          </div>
        </div>
      </div>
    );

    const agentConversation = (
      <StickToBottom
        className="modern-scrollbar flex h-full min-h-0 flex-col overflow-y-auto overscroll-contain"
        resize="smooth"
        initial="smooth"
      >
        <StickToBottom.Content className="relative flex min-h-full flex-col gap-3 px-3 py-3">
          {alertStack}
          <ClientOnly>
            {() => (
              <Suspense fallback={<LazyPanelFallback title="Conversation" />}>
                <LazyMessages
                  className="z-1 flex w-full flex-col"
                  messages={messages}
                  isStreaming={isStreaming}
                  append={append}
                  chatMode={chatMode}
                  setChatMode={setChatMode}
                  provider={provider}
                  model={model}
                  addToolResult={addToolResult}
                />
              </Suspense>
            )}
          </ClientOnly>
          {activityFeeds}
          <ScrollToBottom />
        </StickToBottom.Content>
      </StickToBottom>
    );

    const agentWorkspace = (
      <ClientOnly>
        {() => (
          <Suspense fallback={<LazyPanelFallback title="Workspace" />}>
            <LazyWorkbench
              embedded
              forceVisible
              chatStarted={chatStarted}
              isStreaming={isStreaming}
              setSelectedElement={setSelectedElement}
              data={data}
              model={model}
              provider={provider}
              autonomyMode={autonomyMode}
              latestRunMetrics={latestRunMetrics}
              latestUsage={latestUsage}
            />
          </Suspense>
        )}
      </ClientOnly>
    );

    const agentStatusLabel = actionAlert
      ? actionAlertAutoFixState === 'running'
        ? 'Repairing'
        : 'Repair queued'
      : llmErrorAlert
        ? 'Needs attention'
        : isStreaming
          ? 'Working'
          : 'Ready';
    const agentModeLabel = agentMode === 'plan' ? 'Plan first' : agentMode === 'act' ? 'Run plan' : 'Build';

    const baseChat = (
      <div ref={ref} className={classNames(styles.BaseChat, 'relative flex h-full min-h-0 w-full overflow-hidden')}>
        <ClientOnly>{() => <Menu />}</ClientOnly>
        <div className="h-full min-h-0 w-full overflow-hidden">
          {chatStarted ? (
            <AgentModeShell
              conversation={agentConversation}
              workspace={agentWorkspace}
              composer={renderChatInputRegion('agent')}
              isStreaming={isStreaming}
              statusLabel={agentStatusLabel}
              modeLabel={agentModeLabel}
            />
          ) : (
            chatSurface
          )}
        </div>
      </div>
    );

    return <Tooltip.Provider delayDuration={200}>{baseChat}</Tooltip.Provider>;
  },
);

function ScrollToBottom() {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();

  return (
    !isAtBottom && (
      <>
        <div className="sticky bottom-0 left-0 right-0 bg-gradient-to-t from-bolt-elements-background-depth-1 to-transparent h-20 z-10" />
        <button
          className="sticky z-50 bottom-0 left-0 right-0 text-4xl rounded-lg px-1.5 py-0.5 flex items-center justify-center mx-auto gap-2 bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor text-bolt-elements-textPrimary text-sm"
          onClick={() => scrollToBottom()}
        >
          Go to last message
          <span className="i-ph:arrow-down animate-bounce" />
        </button>
      </>
    )
  );
}
