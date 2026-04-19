import type { JSONValue, Message } from 'ai';
import React, { Suspense, type RefCallback, useEffect, useRef, useState } from 'react';
import { ClientOnly } from 'remix-utils/client-only';
import { Menu } from '~/components/sidebar/Menu.client';
import { classNames } from '~/utils/classNames';
import { PROVIDER_LIST } from '~/utils/constants';
import {
  getApiKeysFromCookies,
  loadApiKeysFromSecureStorage,
  removeApiKeysCookie,
  setApiKeysCookie,
} from '~/lib/runtime/api-key-storage';
import { ChatBox } from './ChatBox';
import * as Tooltip from '@radix-ui/react-tooltip';
import styles from './BaseChat.module.scss';
import { ImportButtons } from '~/components/chat/chatExportAndImport/ImportButtons';
import { ExamplePrompts } from '~/components/chat/ExamplePrompts';
import GitCloneButton from './GitCloneButton';
import type { ProviderInfo } from '~/types/model';
import StarterTemplates from './StarterTemplates';
import type { ActionAlert, SupabaseAlert, DeployAlert, LlmErrorAlertType } from '~/types/actions';
import ChatAlert from './ChatAlert';
import type { ModelInfo } from '~/lib/modules/llm/types';
import ProgressCompilation from './ProgressCompilation';
import type { AgentRunMetricsDataEvent, ProgressAnnotation, UsageDataEvent } from '~/types/context';
import { expoUrlAtom } from '~/lib/stores/qrCodeStore';
import { useStore } from '@nanostores/react';
import { StickToBottom, useStickToBottomContext } from '~/lib/hooks';
import type { DesignScheme } from '~/types/design-scheme';
import type { ElementInfo } from '~/components/workbench/Inspector';
import type { SketchElement } from './SketchCanvas';
import type { AutonomyMode } from '~/lib/runtime/autonomy';
import { usePublicUrlConfig } from '~/lib/public-url-context';
import { logStore } from '~/lib/stores/logs';
import { workbenchStore } from '~/lib/stores/workbench';

const TEXTAREA_MIN_HEIGHT = 72;
const SURFACE_LAYOUT_STORAGE_KEY = 'bolt_surface_layout';

type SurfaceTabId = 'chat' | 'workspace';

interface SurfaceTabDefinition {
  id: SurfaceTabId;
  label: string;
  description: string;
  closable: boolean;
}

const SURFACE_TABS: SurfaceTabDefinition[] = [
  {
    id: 'chat',
    label: 'Chat',
    description: 'Prompt, live commentary, and technical feed',
    closable: false,
  },
  {
    id: 'workspace',
    label: 'Workspace',
    description: 'Files, code, diff, preview, and terminal',
    closable: true,
  },
];

const LazyWorkbench = React.lazy(() =>
  import('~/components/workbench/Workbench.client').then((module) => ({ default: module.Workbench })),
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
  import('~/components/deploy/DeployAlert').then((module) => ({ default: module.default })),
);
const LazySupabaseChatAlert = React.lazy(() =>
  import('~/components/chat/SupabaseAlert').then((module) => ({ default: module.SupabaseChatAlert })),
);
const LazyLlmErrorAlert = React.lazy(() => import('./LLMApiAlert').then((module) => ({ default: module.default })));
const LazyUpdateBanner = React.lazy(() =>
  import('./UpdateBanner').then((module) => ({ default: module.UpdateBanner })),
);

function LazyPanelFallback({ title }: { title: string }) {
  return (
    <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-3 text-xs text-bolt-elements-textSecondary">
      <div className="font-medium text-bolt-elements-textPrimary">{title}</div>
      <div className="mt-2 animate-pulse text-bolt-elements-textTertiary">Loading…</div>
    </div>
  );
}

function readStoredSurfaceLayout(): { openTabs: SurfaceTabId[]; activeTab: SurfaceTabId } | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(SURFACE_LAYOUT_STORAGE_KEY);

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as {
      openTabs?: unknown;
      activeTab?: unknown;
    };

    const openTabs = Array.isArray(parsed.openTabs)
      ? parsed.openTabs.filter((tab): tab is SurfaceTabId => tab === 'chat' || tab === 'workspace')
      : [];

    if (!openTabs.includes('chat')) {
      openTabs.unshift('chat');
    }

    return {
      openTabs,
      activeTab: 'chat',
    };
  } catch {
    return null;
  }
}

function persistSurfaceLayout(openTabs: SurfaceTabId[], activeTab: SurfaceTabId) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(
      SURFACE_LAYOUT_STORAGE_KEY,
      JSON.stringify({
        openTabs,
        activeTab,
      }),
    );
  } catch {
    // Persistence failures should never block the shell.
  }
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
        <Suspense fallback={null}>
          <LazyUpdateBanner />
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
      onApiKeysUpdated,
    },
    ref,
  ) => {
    const { adminPanelUrl } = usePublicUrlConfig();
    const TEXTAREA_MAX_HEIGHT = chatStarted ? 132 : 136;
    const [apiKeys, setApiKeys] = useState<Record<string, string>>(getApiKeysFromCookies());
    const hasAnyApiKey = Object.values(apiKeys).some((v) => typeof v === 'string' && v.trim().length > 0);
    const [modelList, setModelList] = useState<ModelInfo[]>([]);
    const [isModelSettingsCollapsed, setIsModelSettingsCollapsed] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [recognition, setRecognition] = useState<SpeechRecognition | null>(null);
    const [isModelLoading, setIsModelLoading] = useState<string | undefined>('all');
    const [progressAnnotations, setProgressAnnotations] = useState<ProgressAnnotation[]>([]);
    const showWorkbench = useStore(workbenchStore.showWorkbench);
    const stepRunnerEvents = useStore(workbenchStore.stepRunnerEvents);
    const commentaryFeedRef = useRef<HTMLDivElement | null>(null);
    const technicalFeedRef = useRef<HTMLDivElement | null>(null);
    const workspaceAutoSurfaceRef = useRef(false);
    const expoUrl = useStore(expoUrlAtom);
    const [qrModalOpen, setQrModalOpen] = useState(false);
    const [openSurfaces, setOpenSurfaces] = useState<SurfaceTabId[]>(['chat', 'workspace']);
    const [activeSurface, setActiveSurface] = useState<SurfaceTabId>('chat');
    const [surfaceLayoutHydrated, setSurfaceLayoutHydrated] = useState(false);
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
      const storedLayout = readStoredSurfaceLayout();

      if (storedLayout) {
        setOpenSurfaces(storedLayout.openTabs);
        setActiveSurface(storedLayout.activeTab);
      }

      setSurfaceLayoutHydrated(true);
    }, []);

    useEffect(() => {
      if (!surfaceLayoutHydrated) {
        return;
      }

      persistSurfaceLayout(openSurfaces, activeSurface);
    }, [activeSurface, openSurfaces, surfaceLayoutHydrated]);

    useEffect(() => {
      if (openSurfaces.includes(activeSurface)) {
        return;
      }

      setActiveSurface('chat');
    }, [activeSurface, openSurfaces]);

    useEffect(() => {
      if (!showWorkbench) {
        return;
      }

      setOpenSurfaces((currentTabs) =>
        currentTabs.includes('workspace') ? currentTabs : [...currentTabs, 'workspace'],
      );
    }, [showWorkbench]);

    useEffect(() => {
      const hasMeaningfulWorkspaceActivity = stepRunnerEvents.some((event) => event.type !== 'telemetry');

      if (!hasMeaningfulWorkspaceActivity) {
        workspaceAutoSurfaceRef.current = false;
        return;
      }

      if (workspaceAutoSurfaceRef.current) {
        return;
      }

      workspaceAutoSurfaceRef.current = true;
      setOpenSurfaces((currentTabs) =>
        currentTabs.includes('workspace') ? currentTabs : [...currentTabs, 'workspace'],
      );
      workbenchStore.showWorkbench.set(true);
    }, [stepRunnerEvents]);

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
        return;
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

    const openSurface = (surfaceId: SurfaceTabId) => {
      setOpenSurfaces((currentTabs) => (currentTabs.includes(surfaceId) ? currentTabs : [...currentTabs, surfaceId]));
      setActiveSurface(surfaceId);

      if (surfaceId === 'workspace') {
        workbenchStore.showWorkbench.set(true);
      }
    };

    const closeSurface = (surfaceId: SurfaceTabId) => {
      if (surfaceId === 'chat') {
        return;
      }

      setOpenSurfaces((currentTabs) => currentTabs.filter((tab) => tab !== surfaceId));
      setActiveSurface((currentSurface) => (currentSurface === surfaceId ? 'chat' : currentSurface));

      if (surfaceId === 'workspace') {
        workbenchStore.showWorkbench.set(false);
      }
    };

    const visibleSurfaceTabs = SURFACE_TABS.filter((tab) => openSurfaces.includes(tab.id));
    const hiddenSurfaceTabs = SURFACE_TABS.filter((tab) => tab.closable && !openSurfaces.includes(tab.id));

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
              What are we creating today?
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
          <div
            className={classNames('z-prompt mx-auto flex w-full flex-col gap-3', {
              'my-auto mb-6': !chatStarted,
              'mt-2': chatStarted,
            })}
          >
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
            {chatStarted ? (
              <div className="grid gap-3 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
                <div className="min-w-0">
                  <Suspense fallback={<LazyPanelFallback title="Live Commentary" />}>
                    <LazyCommentaryFeed data={data} scrollRef={commentaryFeedRef} />
                  </Suspense>
                </div>
                <div className="min-w-0">
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
                </div>
              </div>
            ) : null}
            <div data-testid="chat-input-region" className="flex flex-col gap-2">
              <ChatBox
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
              <div
                className={classNames(
                  'rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 text-bolt-elements-textSecondary',
                  chatStarted ? 'px-3 py-1.5 text-[11px]' : 'px-3 py-2 text-xs',
                )}
              >
                <span className="font-medium text-bolt-elements-textPrimary">Built-in web research:</span> Bolt.gives
                can browse the web with Playwright, study API documentation from a URL, and generate a <code>.md</code>{' '}
                file with its understanding of the full API environment. No setup is required.
              </div>
            </div>
          </div>
        </StickToBottom>
        <div className="flex flex-col justify-center px-3 pb-4 sm:px-6 lg:px-8">
          {!chatStarted && (
            <div className="flex justify-center gap-2">
              {ImportButtons(importChat)}
              <GitCloneButton importChat={importChat} />
              <a
                href={adminPanelUrl}
                className="inline-flex items-center gap-2 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-4 py-2 text-sm text-bolt-elements-textPrimary hover:border-bolt-elements-focus"
              >
                <span className="i-ph:buildings text-base" />
                Admin Panel
              </a>
            </div>
          )}
          <div className="flex flex-col gap-5">
            {!chatStarted && !hasAnyApiKey && (
              <div className="mx-auto w-full max-w-[980px] rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 text-sm">
                <div className="flex items-start gap-3">
                  <div className="i-ph:rocket-launch-duotone mt-0.5 text-2xl text-bolt-elements-textPrimary" />
                  <div className="flex-1">
                    <div className="font-medium text-bolt-elements-textPrimary">
                      Getting started (no bolt.gives signup required)
                    </div>
                    <div className="mt-1 space-y-1 text-bolt-elements-textSecondary">
                      <div>
                        1. Pick a provider (OpenAI, Anthropic, Google, OpenRouter, Ollama, etc.) in the chat box.
                      </div>
                      <div>
                        2. If you choose a cloud provider, you will need to sign up with that provider to get an API
                        key.
                      </div>
                      <div>3. Add the API key in the chat box (key icon) or via Settings, then start chatting.</div>
                      <div>
                        4. If you self-host for a team or customers, open <code>{adminPanelUrl}</code> or{' '}
                        <code>/tenant-admin</code> to manage registrations, tenant accounts, and Cloudflare trial
                        instances on this server.
                      </div>
                      <div className="mt-2 text-xs">
                        Note: keys are stored in your browser and sent with your requests to talk to your selected
                        provider.
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

    const baseChat = (
      <div ref={ref} className={classNames(styles.BaseChat, 'relative flex h-full min-h-0 w-full overflow-hidden')}>
        <ClientOnly>{() => <Menu />}</ClientOnly>
        <div className="flex h-full w-full min-h-0 flex-col overflow-hidden">
          <div className="px-2 py-2">
            <div
              role="tablist"
              aria-label="Workspace surfaces"
              className={classNames(styles.SurfaceRail, 'flex flex-wrap items-center gap-2 pl-12 sm:pl-14')}
            >
              {visibleSurfaceTabs.map((tab) => {
                const isActive = activeSurface === tab.id;
                const panelId = `${tab.id}-surface-panel`;
                const tabId = `${tab.id}-surface-tab`;

                return (
                  <div
                    key={tab.id}
                    className={classNames(
                      styles.SurfaceTab,
                      'group flex items-center gap-1 rounded-full px-2 py-1 text-sm transition-colors',
                      isActive
                        ? classNames(styles.SurfaceTabActive, 'bg-transparent text-bolt-elements-textPrimary')
                        : 'bg-transparent text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary',
                    )}
                  >
                    <button
                      type="button"
                      id={tabId}
                      role="tab"
                      aria-selected={isActive}
                      aria-controls={panelId}
                      className={classNames(
                        'flex items-center gap-2 rounded-full bg-transparent px-1 py-0.5',
                        isActive
                          ? 'text-bolt-elements-textPrimary'
                          : 'text-bolt-elements-textSecondary group-hover:text-bolt-elements-textPrimary',
                      )}
                      onClick={() => openSurface(tab.id)}
                      title={tab.description}
                    >
                      <span className={tab.id === 'chat' ? 'i-ph:chat-circle-dots' : 'i-ph:stack'} />
                      <span className="font-medium">{tab.label}</span>
                    </button>
                    {tab.closable ? (
                      <button
                        type="button"
                        className="rounded-full bg-transparent p-1 text-bolt-elements-textTertiary transition-colors hover:text-bolt-elements-textPrimary"
                        onClick={() => closeSurface(tab.id)}
                        aria-label={`Close ${tab.label} tab`}
                        title={`Close ${tab.label}`}
                      >
                        <span className="i-ph:x" />
                      </button>
                    ) : null}
                  </div>
                );
              })}
              {hiddenSurfaceTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={false}
                  aria-controls={`${tab.id}-surface-panel`}
                  className="flex items-center gap-2 rounded-full border border-dashed border-bolt-elements-borderColor bg-transparent px-3 py-1 text-sm text-bolt-elements-textSecondary transition-colors hover:text-bolt-elements-textPrimary"
                  onClick={() => openSurface(tab.id)}
                  title={tab.description}
                >
                  <span className="i-ph:plus" />
                  <span className="text-bolt-elements-textPrimary">Open {tab.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-hidden">
            {openSurfaces.includes('chat') ? (
              <div
                id="chat-surface-panel"
                role="tabpanel"
                aria-labelledby="chat-surface-tab"
                aria-hidden={activeSurface !== 'chat'}
                className={classNames('h-full min-h-0', {
                  hidden: activeSurface !== 'chat',
                })}
              >
                {chatSurface}
              </div>
            ) : null}

            {openSurfaces.includes('workspace') ? (
              <div
                id="workspace-surface-panel"
                role="tabpanel"
                aria-labelledby="workspace-surface-tab"
                aria-hidden={activeSurface !== 'workspace'}
                className={classNames('h-full min-h-0 overflow-hidden py-3', {
                  hidden: activeSurface !== 'workspace',
                })}
              >
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
                        onRequestClose={() => closeSurface('workspace')}
                      />
                    </Suspense>
                  )}
                </ClientOnly>
              </div>
            ) : null}
          </div>
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
