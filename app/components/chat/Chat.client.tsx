import { useStore } from '@nanostores/react';
import type { Message } from 'ai';
import { useChat } from '@ai-sdk/react';
import { useAnimate } from 'framer-motion';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { useMessageParser, usePromptEnhancer, useShortcuts } from '~/lib/hooks';
import { description, useChatHistory } from '~/lib/persistence';
import { chatStore } from '~/lib/stores/chat';
import { workbenchStore } from '~/lib/stores/workbench';
import { DEFAULT_MODEL, DEFAULT_PROVIDER, PROMPT_COOKIE_KEY, PROVIDER_LIST } from '~/utils/constants';
import { cubicEasingFn } from '~/utils/easings';
import { createScopedLogger, renderLogger } from '~/utils/logger';
import { BaseChat } from './BaseChat';
import Cookies from 'js-cookie';
import { debounce } from '~/utils/debounce';
import { useSettings } from '~/lib/hooks/useSettings';
import type { ProviderInfo } from '~/types/model';
import { useSearchParams } from '@remix-run/react';
import { createSampler } from '~/utils/sampler';
import { getTemplates, selectStarterTemplate } from '~/utils/selectStarterTemplate';
import { logStore } from '~/lib/stores/logs';
import { streamingState } from '~/lib/stores/streaming';
import { filesToArtifacts } from '~/utils/fileUtils';
import { supabaseConnection } from '~/lib/stores/supabase';
import { defaultDesignScheme, type DesignScheme } from '~/types/design-scheme';
import type { ElementInfo } from '~/components/workbench/Inspector';
import type { TextUIPart, FileUIPart, Attachment } from '@ai-sdk/ui-utils';
import { useMCPStore } from '~/lib/stores/mcp';
import type { LlmErrorAlertType } from '~/types/actions';
import { buildModelSelectionEnvelope, selectModelForPrompt } from '~/lib/runtime/model-orchestrator';
import type { ModelInfo } from '~/lib/modules/llm/types';
import { recordTokenUsage } from '~/lib/stores/performance';
import { SessionManager } from '~/lib/services/sessionManager';
import { normalizeSessionPayload, restoreConversationFromPayload } from '~/lib/services/session-payload';
import { mergePromptContext } from '~/lib/services/prompt-merge';
import { LOCAL_PROVIDERS } from '~/lib/stores/settings';
import {
  LAST_CONFIGURED_PROVIDER_COOKIE_KEY,
  getRememberedProviderModel,
  parseApiKeysCookie,
  pickPreferredProviderName,
  recordProviderHistory,
  readInstanceSelection,
  rememberInstanceSelection,
  rememberProviderModelSelection,
  resolvePreferredModelName,
} from '~/lib/runtime/model-selection';
import { normalizeUsageEvent } from '~/lib/runtime/cost-estimation';
import {
  ARCHITECT_NAME,
  buildArchitectAutoHealPrompt,
  decideArchitectAutoHeal,
  diagnoseArchitectIssue,
} from '~/lib/runtime/architect';
import {
  executeApprovedPlanSteps,
  generatePlanSteps,
  type AgentMode,
  type AgentPlanStep,
} from '~/lib/runtime/agent-workflow';
import type { InteractiveStepRunnerEvent } from '~/lib/runtime/interactive-step-runner';
import {
  computeTextFileDelta,
  computeTextSnapshotRevertOps,
  formatCheckpointConfirmMessage,
  snapshotTextFiles,
} from '~/lib/runtime/agent-file-diffs';
import type { SketchElement } from '~/components/chat/SketchCanvas';
import type { AutonomyMode } from '~/lib/runtime/autonomy';
import type { AgentRunMetricsDataEvent, ProjectMemoryDataEvent, UsageDataEvent } from '~/types/context';

const logger = createScopedLogger('Chat');
const PROJECT_MEMORY_STORAGE_KEY = 'bolt_project_memory_v1';
const CHAT_SELECTION_COOKIE_EXPIRY_DAYS = 365;
const MAX_CHAT_DATA_EVENTS = 320;
const MAX_STEP_RUNNER_EVENTS = 320;
const TELEMETRY_SAMPLE_MS = 15000;
const TELEMETRY_OUTPUT_MAX_CHARS = 3000;

type StoredProjectMemory = ProjectMemoryDataEvent | null;
type ApiKeysUpdatePayload = {
  apiKeys: Record<string, string>;
  providerName: string;
  apiKey: string;
  providerModels: ModelInfo[];
};

function loadStoredProjectMemory(): StoredProjectMemory {
  if (typeof window === 'undefined') {
    return null;
  }

  const raw = window.localStorage.getItem(PROJECT_MEMORY_STORAGE_KEY);

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as ProjectMemoryDataEvent;

    if (parsed?.type !== 'project-memory') {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function getApiKeysFromCookiesSafe(): Record<string, string> {
  return parseApiKeysCookie(Cookies.get('apiKeys'));
}

function resolveProviderInfo(providerName: string | undefined): ProviderInfo {
  return (PROVIDER_LIST.find((provider) => provider.name === providerName) || DEFAULT_PROVIDER) as ProviderInfo;
}

async function fetchProviderModels(providerName: string): Promise<ModelInfo[]> {
  try {
    const response = await fetch(`/api/models/${encodeURIComponent(providerName)}`);
    const payload = (await response.json()) as { modelList?: ModelInfo[] };

    if (!response.ok) {
      return [];
    }

    return payload.modelList || [];
  } catch {
    return [];
  }
}

function appendStepRunnerEvent(event: InteractiveStepRunnerEvent) {
  const current = workbenchStore.stepRunnerEvents.get();
  const last = current[current.length - 1];

  if (
    last &&
    (event.type === 'stdout' || event.type === 'stderr') &&
    last.type === event.type &&
    last.stepIndex === event.stepIndex
  ) {
    const mergedOutput = `${last.output || ''}${event.output || ''}`.slice(-TELEMETRY_OUTPUT_MAX_CHARS);
    const mergedEvent: InteractiveStepRunnerEvent = {
      ...last,
      timestamp: event.timestamp,
      output: mergedOutput,
    };

    workbenchStore.stepRunnerEvents.set([...current.slice(0, -1), mergedEvent].slice(-MAX_STEP_RUNNER_EVENTS));

    return;
  }

  workbenchStore.stepRunnerEvents.set([...current, event].slice(-MAX_STEP_RUNNER_EVENTS));
}

function appendArchitectTimelineEvent(event: Omit<InteractiveStepRunnerEvent, 'timestamp'>) {
  appendStepRunnerEvent({
    ...event,
    timestamp: new Date().toISOString(),
  });
}

export function Chat() {
  renderLogger.trace('Chat');

  const { ready, initialMessages, storeMessageHistory, importChat, exportChat } = useChatHistory();
  const title = useStore(description);
  useEffect(() => {
    workbenchStore.setReloadedMessages(initialMessages.map((m) => m.id));
  }, [initialMessages]);

  return (
    <>
      {ready && (
        <ChatImpl
          description={title}
          initialMessages={initialMessages}
          exportChat={exportChat}
          storeMessageHistory={storeMessageHistory}
          importChat={importChat}
        />
      )}
    </>
  );
}

const processSampledMessages = createSampler(
  (options: {
    messages: Message[];
    initialMessages: Message[];
    isLoading: boolean;
    parseMessages: (messages: Message[], isLoading: boolean) => void;
    storeMessageHistory: (messages: Message[], isStreaming?: boolean) => Promise<void>;
  }) => {
    const { messages, initialMessages, isLoading, parseMessages, storeMessageHistory } = options;
    parseMessages(messages, isLoading);

    if (messages.length > initialMessages.length) {
      storeMessageHistory(messages, isLoading).catch((error) => toast.error(error.message));
    }
  },
  50,
);

interface ChatProps {
  initialMessages: Message[];
  storeMessageHistory: (messages: Message[], isStreaming?: boolean) => Promise<void>;
  importChat: (description: string, messages: Message[]) => Promise<void>;
  exportChat: () => void;
  description?: string;
}

export const ChatImpl = memo(
  ({ description, initialMessages, storeMessageHistory, importChat, exportChat }: ChatProps) => {
    useShortcuts();

    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [chatStarted, setChatStarted] = useState(initialMessages.length > 0);
    const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
    const [imageDataList, setImageDataList] = useState<string[]>([]);
    const [searchParams, setSearchParams] = useSearchParams();
    const [fakeLoading, setFakeLoading] = useState(false);
    const files = useStore(workbenchStore.files);
    const [designScheme, setDesignScheme] = useState<DesignScheme>(defaultDesignScheme);
    const actionAlert = useStore(workbenchStore.alert);
    const deployAlert = useStore(workbenchStore.deployAlert);
    const supabaseConn = useStore(supabaseConnection);
    const selectedProject = supabaseConn.stats?.projects?.find(
      (project) => project.id === supabaseConn.selectedProjectId,
    );
    const supabaseAlert = useStore(workbenchStore.supabaseAlert);
    const { activeProviders, promptId, autoSelectTemplate, contextOptimizationEnabled } = useSettings();
    const [llmErrorAlert, setLlmErrorAlert] = useState<LlmErrorAlertType | undefined>(undefined);
    const [model, setModel] = useState(() => {
      const savedModel = Cookies.get('selectedModel');
      return savedModel || DEFAULT_MODEL;
    });
    const [provider, setProvider] = useState(() => {
      const savedProvider = Cookies.get('selectedProvider');
      return resolveProviderInfo(savedProvider);
    });
    const { showChat } = useStore(chatStore);
    const autonomyMode = useStore(workbenchStore.autonomyMode);
    const [animationScope, animate] = useAnimate();
    const [apiKeys, setApiKeys] = useState<Record<string, string>>(() => getApiKeysFromCookiesSafe());
    const [chatMode, setChatMode] = useState<'discuss' | 'build'>('build');
    const [selectedElement, setSelectedElement] = useState<ElementInfo | null>(null);
    const [activeSessionId, setActiveSessionId] = useState<string | undefined>();
    const [agentMode, setAgentMode] = useState<AgentMode>('chat');
    const [agentPlanSteps, setAgentPlanSteps] = useState<AgentPlanStep[]>([]);
    const [sketchElements, setSketchElements] = useState<SketchElement[]>([]);
    const [projectMemory, setProjectMemory] = useState<StoredProjectMemory>(() => loadStoredProjectMemory());
    const [latestRunMetrics, setLatestRunMetrics] = useState<AgentRunMetricsDataEvent | null>(null);
    const [latestUsage, setLatestUsage] = useState<UsageDataEvent | null>(null);
    const selectionBootstrapRef = useRef(false);
    const architectAttemptCountsRef = useRef<Record<string, number>>({});
    const architectInFlightRef = useRef(false);
    const mcpSettings = useMCPStore((state) => state.settings);
    const mcpInitialized = useMCPStore((state) => state.isInitialized);
    const initializeMcp = useMCPStore((state) => state.initialize);

    useEffect(() => {
      if (!mcpInitialized) {
        initializeMcp();
      }
    }, [mcpInitialized, initializeMcp]);

    const {
      messages,
      isLoading,
      input,
      handleInputChange,
      setInput,
      stop,
      append,
      setMessages,
      reload,
      error,
      data: chatData,
      setData,
      addToolResult,
    } = useChat({
      api: '/api/chat',
      body: {
        apiKeys,
        files,
        promptId,
        contextOptimization: contextOptimizationEnabled,
        chatMode,
        designScheme,
        supabase: {
          isConnected: supabaseConn.isConnected,
          hasSelectedProject: !!selectedProject,
          credentials: {
            supabaseUrl: supabaseConn?.credentials?.supabaseUrl,
            anonKey: supabaseConn?.credentials?.anonKey,
          },
        },
        maxLLMSteps: mcpSettings.maxLLMSteps,
        projectMemory,
      },
      sendExtraMessageFields: true,
      onError: (e) => {
        setFakeLoading(false);
        handleError(e, 'chat');
      },
      onFinish: (message, response) => {
        const normalizedUsage = normalizeUsageEvent(response.usage);

        if (normalizedUsage) {
          setLatestUsage(normalizedUsage);
          recordTokenUsage(normalizedUsage);
          logStore.logProvider('Chat response completed', {
            component: 'Chat',
            action: 'response',
            model,
            provider: provider.name,
            usage: normalizedUsage,
            messageLength: message.content.length,
          });
        }

        logger.debug('Finished streaming');
      },
      initialMessages,
      initialInput: Cookies.get(PROMPT_COOKIE_KEY) || '',
    });

    const boundedChatData = useMemo(() => (chatData || []).slice(-MAX_CHAT_DATA_EVENTS), [chatData]);
    const lastDataEventAtRef = useRef(Date.now());
    const stallReportedRef = useRef(false);

    useEffect(() => {
      if (!boundedChatData || boundedChatData.length === 0) {
        return;
      }

      lastDataEventAtRef.current = Date.now();
      stallReportedRef.current = false;

      const lastUsageEvent = [...boundedChatData]
        .reverse()
        .find(
          (item): item is UsageDataEvent =>
            typeof item === 'object' && item !== null && !Array.isArray(item) && (item as any).type === 'usage',
        );

      if (lastUsageEvent) {
        const normalized = normalizeUsageEvent(lastUsageEvent);
        setLatestUsage((prev) => {
          if (
            prev?.totalTokens === normalized?.totalTokens &&
            prev?.promptTokens === normalized?.promptTokens &&
            prev?.completionTokens === normalized?.completionTokens
          ) {
            return prev;
          }

          return normalized;
        });
      }

      const lastProjectMemoryEvent = [...boundedChatData]
        .reverse()
        .find(
          (item): item is ProjectMemoryDataEvent =>
            typeof item === 'object' &&
            item !== null &&
            !Array.isArray(item) &&
            (item as any).type === 'project-memory',
        );

      if (lastProjectMemoryEvent) {
        setProjectMemory((prev) => {
          if (
            prev?.updatedAt === lastProjectMemoryEvent.updatedAt &&
            prev?.projectKey === lastProjectMemoryEvent.projectKey
          ) {
            return prev;
          }

          if (typeof window !== 'undefined') {
            window.localStorage.setItem(PROJECT_MEMORY_STORAGE_KEY, JSON.stringify(lastProjectMemoryEvent));
          }

          return lastProjectMemoryEvent;
        });
      }

      const lastRunMetricsEvent = [...boundedChatData]
        .reverse()
        .find(
          (item): item is AgentRunMetricsDataEvent =>
            typeof item === 'object' && item !== null && !Array.isArray(item) && (item as any).type === 'run-metrics',
        );

      if (lastRunMetricsEvent) {
        setLatestRunMetrics((prev) => (prev?.runId === lastRunMetricsEvent.runId ? prev : lastRunMetricsEvent));
      }
    }, [boundedChatData]);

    useEffect(() => {
      const streaming = isLoading || fakeLoading;
      let interval: number | undefined;

      if (!streaming) {
        stallReportedRef.current = false;
      } else {
        interval = window.setInterval(() => {
          const performanceRecord = performance as Performance & {
            memory?: {
              usedJSHeapSize?: number;
              jsHeapSizeLimit?: number;
            };
          };
          const heapUsedBytes = performanceRecord.memory?.usedJSHeapSize;
          const heapLimitBytes = performanceRecord.memory?.jsHeapSizeLimit;
          const heapUsedMb =
            typeof heapUsedBytes === 'number' && Number.isFinite(heapUsedBytes)
              ? (heapUsedBytes / (1024 * 1024)).toFixed(1)
              : 'n/a';
          const heapLimitMb =
            typeof heapLimitBytes === 'number' && Number.isFinite(heapLimitBytes)
              ? (heapLimitBytes / (1024 * 1024)).toFixed(1)
              : 'n/a';
          const stallMs = Date.now() - lastDataEventAtRef.current;
          const stallSeconds = Math.round(stallMs / 1000);
          const telemetryMessage = `memory ${heapUsedMb}/${heapLimitMb} MB | data ${boundedChatData.length}/${MAX_CHAT_DATA_EVENTS} | messages ${messages.length} | stall ${stallSeconds}s`;

          appendStepRunnerEvent({
            type: 'telemetry',
            timestamp: new Date().toISOString(),
            description: 'runtime telemetry',
            output: telemetryMessage,
          });

          if (stallMs > 45000 && !stallReportedRef.current) {
            stallReportedRef.current = true;

            appendStepRunnerEvent({
              type: 'error',
              timestamp: new Date().toISOString(),
              description: 'Potential stall detected',
              error: `No stream progress for ${stallSeconds}s`,
              output: telemetryMessage,
            });
          }
        }, TELEMETRY_SAMPLE_MS);
      }

      return () => {
        if (interval !== undefined) {
          window.clearInterval(interval);
        }
      };
    }, [boundedChatData.length, fakeLoading, isLoading, messages.length]);

    useEffect(() => {
      if (selectionBootstrapRef.current || activeProviders.length === 0) {
        return;
      }

      const nextApiKeys = getApiKeysFromCookiesSafe();
      setApiKeys(nextApiKeys);

      const instanceSelection =
        typeof window !== 'undefined' ? readInstanceSelection(window.location.hostname) : undefined;

      const preferredProviderName = pickPreferredProviderName({
        activeProviderNames: activeProviders.map((activeProvider) => activeProvider.name),
        apiKeys: nextApiKeys,
        localProviderNames: LOCAL_PROVIDERS,
        savedProviderName: instanceSelection?.providerName || Cookies.get('selectedProvider'),
        lastConfiguredProviderName: Cookies.get(LAST_CONFIGURED_PROVIDER_COOKIE_KEY),
        fallbackProviderName: DEFAULT_PROVIDER.name,
      });
      const preferredProvider =
        activeProviders.find((activeProvider) => activeProvider.name === preferredProviderName) ||
        resolveProviderInfo(preferredProviderName);

      setProvider(preferredProvider as ProviderInfo);
      Cookies.set('selectedProvider', preferredProvider.name, { expires: CHAT_SELECTION_COOKIE_EXPIRY_DAYS });

      if (typeof window !== 'undefined') {
        rememberInstanceSelection({
          hostname: window.location.hostname,
          providerName: preferredProvider.name,
        });
        recordProviderHistory(preferredProvider.name);
      }

      selectionBootstrapRef.current = true;

      (async () => {
        const providerModels = await fetchProviderModels(preferredProvider.name);
        const preferredModel = resolvePreferredModelName({
          providerName: preferredProvider.name,
          models: providerModels,
          rememberedModelName: getRememberedProviderModel(preferredProvider.name),
          savedModelName: instanceSelection?.modelName || Cookies.get('selectedModel'),
        });

        if (!preferredModel) {
          return;
        }

        setModel(preferredModel);
        Cookies.set('selectedModel', preferredModel, { expires: CHAT_SELECTION_COOKIE_EXPIRY_DAYS });
        rememberProviderModelSelection(preferredProvider.name, preferredModel);

        if (typeof window !== 'undefined') {
          rememberInstanceSelection({
            hostname: window.location.hostname,
            providerName: preferredProvider.name,
            modelName: preferredModel,
          });
        }
      })();
    }, [activeProviders]);

    useEffect(() => {
      const prompt = searchParams.get('prompt');

      // console.log(prompt, searchParams, model, provider);

      if (prompt) {
        setSearchParams({});
        runAnimation();
        append({
          role: 'user',
          content: buildModelSelectionEnvelope({
            model,
            providerName: provider.name,
            content: prompt,
          }),
        });
      }
    }, [model, provider, searchParams]);

    const { enhancingPrompt, promptEnhanced, enhancePrompt, resetEnhancer } = usePromptEnhancer();
    const { parsedMessages, parseMessages } = useMessageParser();

    const TEXTAREA_MAX_HEIGHT = chatStarted ? 400 : 200;

    useEffect(() => {
      chatStore.setKey('started', initialMessages.length > 0);
    }, []);

    useEffect(() => {
      processSampledMessages({
        messages,
        initialMessages,
        isLoading,
        parseMessages,
        storeMessageHistory,
      });
    }, [messages, isLoading, parseMessages]);

    const scrollTextArea = () => {
      const textarea = textareaRef.current;

      if (textarea) {
        textarea.scrollTop = textarea.scrollHeight;
      }
    };

    const abort = () => {
      stop();
      chatStore.setKey('aborted', true);
      workbenchStore.abortAllActions();

      logStore.logProvider('Chat response aborted', {
        component: 'Chat',
        action: 'abort',
        model,
        provider: provider.name,
      });
    };

    const buildChatRequestDiagnostics = useCallback(
      (context: 'chat' | 'template' | 'llmcall', error: unknown) => {
        const lastMessage = messages[messages.length - 1];

        return {
          context,
          provider: provider.name,
          model,
          route:
            typeof window !== 'undefined'
              ? `${window.location.pathname}${window.location.search}${window.location.hash}`
              : 'unknown',
          online: typeof navigator !== 'undefined' ? navigator.onLine : undefined,
          visibilityState: typeof document !== 'undefined' ? document.visibilityState : undefined,
          isLoading,
          fakeLoading,
          inputLength: input.length,
          messageCount: messages.length,
          lastMessageRole: lastMessage?.role,
          lastMessageId: lastMessage?.id,
          errorName: error instanceof Error ? error.name : undefined,
          errorMessage:
            error instanceof Error ? error.message : typeof error === 'string' ? error : JSON.stringify(error),
          errorStack: error instanceof Error ? error.stack : undefined,
        };
      },
      [fakeLoading, input.length, isLoading, messages, model, provider.name],
    );

    const handleError = useCallback(
      (error: any, context: 'chat' | 'template' | 'llmcall' = 'chat') => {
        const diagnostics = buildChatRequestDiagnostics(context, error);

        logger.error(`${context} request failed`, diagnostics);
        console.error(`[chat:${context}:diagnostics]`, diagnostics);

        stop();
        setFakeLoading(false);

        let errorInfo = {
          message: 'An unexpected error occurred',
          isRetryable: true,
          statusCode: 500,
          provider: provider.name,
          type: 'unknown' as const,
          retryDelay: 0,
        };

        if (error.message) {
          try {
            const parsed = JSON.parse(error.message);

            if (parsed.error || parsed.message) {
              errorInfo = { ...errorInfo, ...parsed };
            } else {
              errorInfo.message = error.message;
            }
          } catch {
            errorInfo.message = error.message;
          }
        }

        let errorType: LlmErrorAlertType['errorType'] = 'unknown';
        let title = 'Request Failed';

        if (errorInfo.statusCode === 401 || errorInfo.message.toLowerCase().includes('api key')) {
          errorType = 'authentication';
          title = 'Authentication Error';
        } else if (
          errorInfo.message.toLowerCase().includes('failed to fetch') ||
          errorInfo.message.toLowerCase().includes('aborted')
        ) {
          errorType = 'network';
          title = 'Connection Error';
          errorInfo.message = `${errorInfo.message}. Generation stream was interrupted before completion. Check network/proxy stability and server logs for the request diagnostics.`;
        } else if (errorInfo.statusCode === 429 || errorInfo.message.toLowerCase().includes('rate limit')) {
          errorType = 'rate_limit';
          title = 'Rate Limit Exceeded';
        } else if (errorInfo.message.toLowerCase().includes('quota')) {
          errorType = 'quota';
          title = 'Quota Exceeded';
        } else if (errorInfo.statusCode >= 500) {
          errorType = 'network';
          title = 'Server Error';
        }

        logStore.logError(`${context} request failed`, error, {
          component: 'Chat',
          action: 'request',
          error: errorInfo.message,
          context,
          retryable: errorInfo.isRetryable,
          errorType,
          provider: provider.name,
          diagnostics,
        });

        appendStepRunnerEvent({
          type: 'error',
          timestamp: new Date().toISOString(),
          description: `${context} generation failed`,
          error: errorInfo.message,
          output: JSON.stringify(
            {
              provider: diagnostics.provider,
              model: diagnostics.model,
              route: diagnostics.route,
              messageCount: diagnostics.messageCount,
              isLoading: diagnostics.isLoading,
              errorName: diagnostics.errorName,
              errorMessage: diagnostics.errorMessage,
            },
            null,
            2,
          ),
        });

        // Create API error alert
        setLlmErrorAlert({
          type: 'error',
          title,
          description: errorInfo.message,
          provider: provider.name,
          errorType,
        });
        setData([]);
      },
      [buildChatRequestDiagnostics, provider.name, stop],
    );

    const clearApiErrorAlert = useCallback(() => {
      setLlmErrorAlert(undefined);
    }, []);

    useEffect(() => {
      const textarea = textareaRef.current;

      if (textarea) {
        textarea.style.height = 'auto';

        const scrollHeight = textarea.scrollHeight;

        textarea.style.height = `${Math.min(scrollHeight, TEXTAREA_MAX_HEIGHT)}px`;
        textarea.style.overflowY = scrollHeight > TEXTAREA_MAX_HEIGHT ? 'auto' : 'hidden';
      }
    }, [input, textareaRef]);

    const runAnimation = async () => {
      if (chatStarted) {
        return;
      }

      await Promise.all([
        animate('#examples', { opacity: 0, display: 'none' }, { duration: 0.1 }),
        animate('#intro', { opacity: 0, flex: 1 }, { duration: 0.2, ease: cubicEasingFn }),
      ]);

      chatStore.setKey('started', true);

      setChatStarted(true);
    };

    // Helper function to create message parts array from text and images
    const createMessageParts = (text: string, images: string[] = []): Array<TextUIPart | FileUIPart> => {
      // Create an array of properly typed message parts
      const parts: Array<TextUIPart | FileUIPart> = [
        {
          type: 'text',
          text,
        },
      ];

      // Add image parts if any
      images.forEach((imageData) => {
        // Extract correct MIME type from the data URL
        const mimeType = imageData.split(';')[0].split(':')[1] || 'image/jpeg';

        // Create file part according to AI SDK format
        parts.push({
          type: 'file',
          mimeType,
          data: imageData.replace(/^data:image\/[^;]+;base64,/, ''),
        });
      });

      return parts;
    };

    // Helper function to convert File[] to Attachment[] for AI SDK
    const filesToAttachments = async (files: File[]): Promise<Attachment[] | undefined> => {
      if (files.length === 0) {
        return undefined;
      }

      const attachments = await Promise.all(
        files.map(
          (file) =>
            new Promise<Attachment>((resolve) => {
              const reader = new FileReader();

              reader.onloadend = () => {
                resolve({
                  name: file.name,
                  contentType: file.type,
                  url: reader.result as string,
                });
              };
              reader.readAsDataURL(file);
            }),
        ),
      );

      return attachments;
    };

    const imageDataListToAttachments = (images: string[], files: File[]): Attachment[] => {
      return images
        .map((url, index) => {
          if (!url.startsWith('data:')) {
            // Only data URLs are expected here.
            return null;
          }

          const file = files[index];
          const contentType = file?.type || url.match(/^data:([^;]+);base64,/)?.[1];
          const name = file?.name || `image-${index + 1}`;

          const attachment: Attachment = { url };
          attachment.name = name;

          if (contentType) {
            attachment.contentType = contentType;
          }

          return attachment;
        })
        .filter((a): a is Attachment => a !== null);
    };

    const buildChatAttachments = async (): Promise<Attachment[] | undefined> => {
      // `imageDataList` is the canonical source for images (it can be populated without File objects).
      const imageAttachments = imageDataListToAttachments(imageDataList, uploadedFiles);

      // If we have File objects without corresponding `imageDataList` entries, include them too.
      const extraFiles = uploadedFiles.slice(imageDataList.length);
      const extraFileAttachments = await filesToAttachments(extraFiles);

      const attachments = [...imageAttachments, ...(extraFileAttachments ?? [])];

      return attachments.length > 0 ? attachments : undefined;
    };

    const resolveModelSelection = useCallback(
      async (prompt: string, currentModel: string, currentProvider: ProviderInfo) => {
        try {
          const response = await fetch('/api/models');
          const data = (await response.json()) as { modelList: ModelInfo[] };
          const decision = selectModelForPrompt({
            prompt,
            currentModel,
            currentProvider,
            availableProviders: activeProviders,
            availableModels: data.modelList || [],
          });

          logStore.logProvider('Model orchestrator decision', {
            component: 'model-orchestrator',
            reason: decision.reason,
            complexity: decision.complexity,
            selectedProvider: decision.provider.name,
            selectedModel: decision.model,
            overridden: decision.overridden,
          });

          if (decision.overridden) {
            setModel(decision.model);
            setProvider(decision.provider);
            Cookies.set('selectedModel', decision.model, { expires: CHAT_SELECTION_COOKIE_EXPIRY_DAYS });
            Cookies.set('selectedProvider', decision.provider.name, { expires: CHAT_SELECTION_COOKIE_EXPIRY_DAYS });
            rememberProviderModelSelection(decision.provider.name, decision.model);

            if (typeof window !== 'undefined') {
              recordProviderHistory(decision.provider.name);
            }

            toast.info(`Model Orchestrator: ${decision.provider.name} / ${decision.model}`);
          }

          return {
            provider: decision.provider,
            model: decision.model,
            reason: decision.reason,
          };
        } catch (error) {
          logger.warn('Model orchestrator failed, using selected model', error);
          return {
            provider: currentProvider,
            model: currentModel,
            reason: 'Model orchestrator failed; kept manual model selection.',
          };
        }
      },
      [activeProviders],
    );

    const buildSessionPayload = useCallback(() => {
      const diffs = workbenchStore.getFileModifcations();
      const diffList = Object.entries(diffs || {}).map(([path, change]) => ({
        path,
        diff: change.content,
      }));

      return {
        title: description || 'Untitled Session',
        conversation: messages,
        prompts: messages.filter((message) => message.role === 'user'),
        responses: messages.filter((message) => message.role === 'assistant'),
        diffs: diffList,
      };
    }, [description, messages]);

    const handleSaveSession = useCallback(async () => {
      try {
        const saved = await SessionManager.saveSession(buildSessionPayload(), activeSessionId);
        setActiveSessionId(saved.id);
        toast.success('Session saved');
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to save session');
      }
    }, [activeSessionId, buildSessionPayload]);

    const handleResumeSession = useCallback(async () => {
      try {
        const sessions = await SessionManager.listSessions();

        if (sessions.length === 0) {
          toast.info('No saved sessions found');
          return;
        }

        const preview = sessions
          .slice(0, 10)
          .map((session) => `${session.id}: ${session.title}`)
          .join('\n');
        const selectedId = window.prompt(`Enter a session ID to resume:\n\n${preview}`);

        if (!selectedId) {
          return;
        }

        const loaded = await SessionManager.loadSessionById(selectedId.trim());

        if (!loaded?.payload) {
          toast.error('Session not found');
          return;
        }

        const restoredMessages = restoreConversationFromPayload(normalizeSessionPayload(loaded.payload));
        setMessages(restoredMessages);
        setActiveSessionId(loaded.id);
        chatStore.setKey('started', true);
        setChatStarted(true);
        toast.success('Session restored');
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to resume session');
      }
    }, [setMessages]);

    const handleShareSession = useCallback(async () => {
      try {
        let sessionId = activeSessionId;

        if (!sessionId) {
          const saved = await SessionManager.saveSession(buildSessionPayload(), activeSessionId);
          sessionId = saved.id;
          setActiveSessionId(saved.id);
        }

        const shareUrl = await SessionManager.createShareLink(sessionId);
        await navigator.clipboard.writeText(shareUrl);
        toast.success('Share URL copied to clipboard');
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to share session');
      }
    }, [activeSessionId, buildSessionPayload]);

    useEffect(() => {
      const shareSlug = searchParams.get('shareSession');

      if (!shareSlug) {
        return;
      }

      SessionManager.loadSessionByShareSlug(shareSlug)
        .then((loaded) => {
          if (!loaded?.payload) {
            toast.error('Shared session not found');
            return;
          }

          const restoredMessages = restoreConversationFromPayload(normalizeSessionPayload(loaded.payload));
          setMessages(restoredMessages);
          setActiveSessionId(loaded.id);
          chatStore.setKey('started', true);
          setChatStarted(true);
          toast.success('Shared session loaded');
        })
        .catch((error) => {
          toast.error(error instanceof Error ? error.message : 'Failed to load shared session');
        })
        .finally(() => {
          const next = new URLSearchParams(searchParams);
          next.delete('shareSession');
          setSearchParams(next);
        });
    }, [searchParams, setMessages, setSearchParams]);

    const runAgentActWorkflow = useCallback(async () => {
      if (agentPlanSteps.length === 0) {
        toast.error('No approved plan steps available. Switch to Plan mode first.');
        return false;
      }

      try {
        const shell = workbenchStore.boltTerminal;
        await shell.ready();

        const baselineSnapshot = snapshotTextFiles(workbenchStore.files.get());
        const stepSnapshots = new Map<number, ReturnType<typeof snapshotTextFiles>>();

        let socket: WebSocket | undefined;

        try {
          const base = window.localStorage.getItem('bolt_collab_server_url') || 'ws://localhost:1234';
          socket = new WebSocket(`${base.replace(/\/$/, '')}/events`);
        } catch {
          socket = undefined;
        }

        const result = await executeApprovedPlanSteps({
          steps: agentPlanSteps,
          socket,
          executor: {
            executeStep: async (step, context) => {
              // Snapshot file contents before each step to show diffs at the checkpoint.
              stepSnapshots.set((step as AgentPlanStep).id, snapshotTextFiles(workbenchStore.files.get()));

              const commandText = step.command.join(' ');
              const response = await shell.executeCommand(`agent-${Date.now()}`, commandText, undefined, (chunk) =>
                context.onStdout(chunk),
              );

              return {
                exitCode: response?.exitCode ?? 1,
                stdout: response?.output || '',
                stderr: response?.exitCode === 0 ? '' : response?.output || '',
              };
            },
          },
          onEvent: (event) => {
            appendStepRunnerEvent(event);
          },
          onCheckpoint: async (step) => {
            const afterSnapshot = snapshotTextFiles(workbenchStore.files.get());
            const beforeSnapshot = stepSnapshots.get(step.id) || afterSnapshot;
            const delta = computeTextFileDelta(beforeSnapshot, afterSnapshot);

            const proceed = window.confirm(
              formatCheckpointConfirmMessage({
                stepDescription: step.description,
                delta,
              }),
            );

            if (proceed) {
              return 'continue';
            }

            const revert = window.confirm('Stop execution and revert all changes from this Act run?');

            if (revert) {
              const currentSnapshot = snapshotTextFiles(workbenchStore.files.get());
              const ops = computeTextSnapshotRevertOps(baselineSnapshot, currentSnapshot);

              // Best-effort: some paths may have been deleted/locked by the user while the workflow runs.
              for (const filePath of ops.deletes) {
                try {
                  await workbenchStore.deleteFile(filePath);
                } catch {
                  // ignore
                }
              }

              for (const write of ops.writes) {
                try {
                  await workbenchStore.writeFile(write.path, write.content);
                } catch {
                  // ignore
                }
              }

              workbenchStore.resetAllUnsavedFiles();
              workbenchStore.resetAllFileModifications();

              return 'revert';
            }

            return 'stop';
          },
        });

        if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
          socket.close();
        }

        if (result === 'complete') {
          toast.success('Act workflow completed');
        } else if (result === 'reverted') {
          toast.info('Act workflow stopped and reverted');
        } else {
          toast.info('Act workflow stopped');
        }

        return true;
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Act workflow failed');
        return false;
      }
    }, [agentPlanSteps]);

    const sendMessage = async (_event: React.UIEvent, messageInput?: string) => {
      const messageContent = messageInput || input;

      if (!messageContent?.trim()) {
        return;
      }

      if (isLoading) {
        abort();
        return;
      }

      const finalMessageContent = mergePromptContext({
        content: messageContent,
        selectedElement,
        sketchElements,
      });

      if (agentMode === 'act') {
        const executed = await runAgentActWorkflow();

        if (executed) {
          setInput('');
          Cookies.remove(PROMPT_COOKIE_KEY);
          setUploadedFiles([]);
          setImageDataList([]);
          setSketchElements([]);
          resetEnhancer();
          textareaRef.current?.blur();
        }

        return;
      }

      const selection = await resolveModelSelection(finalMessageContent, model, provider);
      const effectiveModel = selection.model;
      const effectiveProvider = selection.provider;
      const selectionReason = selection.reason;
      const buildUserMessageText = (content: string) =>
        buildModelSelectionEnvelope({
          model: effectiveModel,
          providerName: effectiveProvider.name,
          selectionReason,
          content,
        });

      if (agentMode === 'plan') {
        try {
          const steps = await generatePlanSteps({
            goal: finalMessageContent,
            model: effectiveModel,
            provider: effectiveProvider,
          });

          if (steps.length === 0) {
            toast.error('No plan steps were generated. Try a more specific goal.');
            return;
          }

          const planText = steps
            .map((step) => {
              const command = step.command.length > 0 ? `command: \`${step.command.join(' ')}\`` : 'command: n/a';
              return `${step.id}. ${step.description} (${command})`;
            })
            .join('\n');
          const approved = window.confirm(`Generated Plan:\\n\\n${planText}\\n\\nApprove all steps for Act mode?`);
          const nextSteps = steps.map((step) => ({ ...step, approved }));

          setAgentPlanSteps(nextSteps);
          setAgentMode(approved ? 'act' : 'plan');

          const userMessageText = buildUserMessageText(finalMessageContent);
          setMessages([
            ...messages,
            {
              id: `${Date.now()}-plan-user`,
              role: 'user',
              content: userMessageText,
            },
            {
              id: `${Date.now()}-plan-assistant`,
              role: 'assistant',
              content: `Plan mode generated ${steps.length} step(s):\n\n${planText}\n\n${
                approved
                  ? 'All steps approved. Switch to Act mode and send a message to execute.'
                  : 'Steps are awaiting approval. You can edit the goal and regenerate.'
              }`,
            },
          ]);
          setInput('');
          Cookies.remove(PROMPT_COOKIE_KEY);
          setUploadedFiles([]);
          setImageDataList([]);
          setSketchElements([]);
          resetEnhancer();
          textareaRef.current?.blur();
        } catch (error) {
          toast.error(error instanceof Error ? error.message : 'Failed to generate plan');
        }

        return;
      }

      runAnimation();

      if (!chatStarted) {
        setFakeLoading(true);

        if (autoSelectTemplate) {
          const { template, title } = await selectStarterTemplate({
            message: finalMessageContent,
            model: effectiveModel,
            provider: effectiveProvider,
          });

          if (template !== 'blank') {
            const temResp = await getTemplates(template, title).catch((e) => {
              if (e.message.includes('rate limit')) {
                toast.warning('Rate limit exceeded. Skipping starter template\n Continuing with blank template');
              } else {
                toast.warning('Failed to import starter template\n Continuing with blank template');
              }

              return null;
            });

            if (temResp) {
              const { assistantMessage, userMessage } = temResp;
              const userMessageText = buildUserMessageText(finalMessageContent);
              const attachments = await buildChatAttachments();

              setMessages([
                {
                  id: `1-${new Date().getTime()}`,
                  role: 'user',
                  content: userMessageText,
                  parts: createMessageParts(userMessageText, imageDataList),
                  experimental_attachments: attachments,
                },
                {
                  id: `2-${new Date().getTime()}`,
                  role: 'assistant',
                  content: assistantMessage,
                },
                {
                  id: `3-${new Date().getTime()}`,
                  role: 'user',
                  content: buildUserMessageText(userMessage),
                  annotations: ['hidden'],
                },
              ]);

              const reloadOptions = attachments ? { experimental_attachments: attachments } : undefined;

              reload(reloadOptions);
              setInput('');
              Cookies.remove(PROMPT_COOKIE_KEY);

              setUploadedFiles([]);
              setImageDataList([]);
              setSketchElements([]);

              resetEnhancer();

              textareaRef.current?.blur();
              setFakeLoading(false);

              return;
            }
          }
        }

        // If autoSelectTemplate is disabled or template selection failed, proceed with normal message
        const userMessageText = buildUserMessageText(finalMessageContent);
        const attachments = await buildChatAttachments();

        setMessages([
          {
            id: `${new Date().getTime()}`,
            role: 'user',
            content: userMessageText,
            parts: createMessageParts(userMessageText, imageDataList),
            experimental_attachments: attachments,
          },
        ]);

        reload(attachments ? { experimental_attachments: attachments } : undefined);
        setFakeLoading(false);
        setInput('');
        Cookies.remove(PROMPT_COOKIE_KEY);

        setUploadedFiles([]);
        setImageDataList([]);
        setSketchElements([]);

        resetEnhancer();

        textareaRef.current?.blur();

        return;
      }

      if (error != null) {
        setMessages(messages.slice(0, -1));
      }

      const modifiedFiles = workbenchStore.getModifiedFiles();

      chatStore.setKey('aborted', false);

      if (modifiedFiles !== undefined) {
        const userUpdateArtifact = filesToArtifacts(modifiedFiles, `${Date.now()}`);
        const messageText = buildUserMessageText(`${userUpdateArtifact}${finalMessageContent}`);

        const attachments = await buildChatAttachments();
        const attachmentOptions = attachments ? { experimental_attachments: attachments } : undefined;

        append(
          {
            role: 'user',
            content: messageText,
            parts: createMessageParts(messageText, imageDataList),
            experimental_attachments: attachments,
          },
          attachmentOptions,
        );

        workbenchStore.resetAllFileModifications();
      } else {
        const messageText = buildUserMessageText(finalMessageContent);

        const attachments = await buildChatAttachments();
        const attachmentOptions = attachments ? { experimental_attachments: attachments } : undefined;

        append(
          {
            role: 'user',
            content: messageText,
            parts: createMessageParts(messageText, imageDataList),
            experimental_attachments: attachments,
          },
          attachmentOptions,
        );
      }

      setInput('');
      Cookies.remove(PROMPT_COOKIE_KEY);

      setUploadedFiles([]);
      setImageDataList([]);
      setSketchElements([]);

      resetEnhancer();

      textareaRef.current?.blur();
    };

    useEffect(() => {
      if (!actionAlert || isLoading || architectInFlightRef.current) {
        return;
      }

      const diagnosis = diagnoseArchitectIssue(actionAlert);

      if (!diagnosis) {
        return;
      }

      appendArchitectTimelineEvent({
        type: 'telemetry',
        description: `${ARCHITECT_NAME} diagnosis`,
        output: `${diagnosis.title} (${diagnosis.issueId})`,
      });

      const attemptsForFingerprint = architectAttemptCountsRef.current[diagnosis.fingerprint] || 0;
      const decision = decideArchitectAutoHeal({
        autonomyMode,
        diagnosis,
        attemptsForFingerprint,
      });

      if (!decision.shouldAutoHeal) {
        appendArchitectTimelineEvent({
          type: 'error',
          description: `${ARCHITECT_NAME} auto-heal skipped`,
          error:
            decision.reason === 'autonomy-blocked'
              ? 'Autonomy mode blocks auto-heal for this issue.'
              : 'Auto-heal attempt limit reached for this issue fingerprint.',
          output: `${diagnosis.title} (${diagnosis.issueId})`,
        });

        return;
      }

      const attemptNumber = attemptsForFingerprint + 1;
      architectAttemptCountsRef.current[diagnosis.fingerprint] = attemptNumber;
      architectInFlightRef.current = true;

      appendArchitectTimelineEvent({
        type: 'step-start',
        stepIndex: attemptNumber,
        description: `${ARCHITECT_NAME} auto-heal attempt ${attemptNumber}/${decision.maxAutoAttempts}`,
        command: ['architect', 'auto-heal', diagnosis.issueId],
      });

      workbenchStore.clearAlert();
      toast.info(`${ARCHITECT_NAME}: auto-heal attempt ${attemptNumber}/${decision.maxAutoAttempts}`);

      const architectPrompt = buildArchitectAutoHealPrompt({
        alert: actionAlert,
        diagnosis,
        attemptNumber,
      });
      const payload = buildModelSelectionEnvelope({
        model,
        providerName: provider.name,
        selectionReason: `${ARCHITECT_NAME} auto-heal detected: ${diagnosis.title}.`,
        content: architectPrompt,
      });

      append({
        id: `${Date.now()}-architect-auto-heal`,
        role: 'user',
        content: payload,
      })
        .then(() => {
          appendArchitectTimelineEvent({
            type: 'step-end',
            stepIndex: attemptNumber,
            description: `${ARCHITECT_NAME} auto-heal dispatched`,
            exitCode: 0,
          });
        })
        .catch((error) => {
          appendArchitectTimelineEvent({
            type: 'error',
            stepIndex: attemptNumber,
            description: `${ARCHITECT_NAME} auto-heal failed`,
            error: error instanceof Error ? error.message : 'Unknown auto-heal dispatch error',
          });
          toast.error(error instanceof Error ? error.message : `${ARCHITECT_NAME} auto-heal failed to start`);
        })
        .finally(() => {
          architectInFlightRef.current = false;
        });
    }, [actionAlert, append, autonomyMode, isLoading, model, provider.name]);

    /**
     * Handles the change event for the textarea and updates the input state.
     * @param event - The change event from the textarea.
     */
    const onTextareaChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      handleInputChange(event);
    };

    /**
     * Debounced function to cache the prompt in cookies.
     * Caches the trimmed value of the textarea input after a delay to optimize performance.
     */
    const debouncedCachePrompt = useCallback(
      debounce((event: React.ChangeEvent<HTMLTextAreaElement>) => {
        const trimmedValue = event.target.value.trim();
        Cookies.set(PROMPT_COOKIE_KEY, trimmedValue, { expires: 30 });
      }, 1000),
      [],
    );

    const handleApiKeysUpdated = useCallback(
      async ({ apiKeys: updatedApiKeys, providerName, apiKey, providerModels }: ApiKeysUpdatePayload) => {
        setApiKeys(updatedApiKeys);
        Cookies.set('apiKeys', JSON.stringify(updatedApiKeys), { expires: CHAT_SELECTION_COOKIE_EXPIRY_DAYS });

        const normalizedKey = apiKey.trim();

        if (!normalizedKey) {
          return;
        }

        Cookies.set(LAST_CONFIGURED_PROVIDER_COOKIE_KEY, providerName, { expires: CHAT_SELECTION_COOKIE_EXPIRY_DAYS });

        const preferredProvider =
          activeProviders.find((activeProvider) => activeProvider.name === providerName) ||
          resolveProviderInfo(providerName);

        setProvider(preferredProvider as ProviderInfo);
        Cookies.set('selectedProvider', preferredProvider.name, { expires: CHAT_SELECTION_COOKIE_EXPIRY_DAYS });

        if (typeof window !== 'undefined') {
          rememberInstanceSelection({
            hostname: window.location.hostname,
            providerName: preferredProvider.name,
          });
          recordProviderHistory(preferredProvider.name);
        }

        const modelsForProvider = providerModels.length > 0 ? providerModels : await fetchProviderModels(providerName);
        const preferredModel = resolvePreferredModelName({
          providerName,
          models: modelsForProvider,
          rememberedModelName: getRememberedProviderModel(providerName),
          savedModelName: Cookies.get('selectedModel') || model,
        });

        if (!preferredModel) {
          return;
        }

        setModel(preferredModel);
        Cookies.set('selectedModel', preferredModel, { expires: CHAT_SELECTION_COOKIE_EXPIRY_DAYS });
        rememberProviderModelSelection(providerName, preferredModel);

        if (typeof window !== 'undefined') {
          rememberInstanceSelection({
            hostname: window.location.hostname,
            providerName,
            modelName: preferredModel,
          });
          recordProviderHistory(providerName);
        }
      },
      [activeProviders, model],
    );

    const handleModelChange = (newModel: string) => {
      setModel(newModel);
      Cookies.set('selectedModel', newModel, { expires: CHAT_SELECTION_COOKIE_EXPIRY_DAYS });
      rememberProviderModelSelection(provider.name, newModel);

      if (typeof window !== 'undefined') {
        rememberInstanceSelection({
          hostname: window.location.hostname,
          providerName: provider.name,
          modelName: newModel,
        });
      }
    };

    const handleProviderChange = (newProvider: ProviderInfo) => {
      setProvider(newProvider);
      Cookies.set('selectedProvider', newProvider.name, { expires: CHAT_SELECTION_COOKIE_EXPIRY_DAYS });

      if (typeof window !== 'undefined') {
        rememberInstanceSelection({
          hostname: window.location.hostname,
          providerName: newProvider.name,
          modelName: model,
        });
        recordProviderHistory(newProvider.name);
      }
    };

    const handleWebSearchResult = useCallback(
      (result: string) => {
        const currentInput = input || '';
        const newInput = currentInput.length > 0 ? `${result}\n\n${currentInput}` : result;

        // Update the input via the same mechanism as handleInputChange
        const syntheticEvent = {
          target: { value: newInput },
        } as React.ChangeEvent<HTMLTextAreaElement>;
        handleInputChange(syntheticEvent);
      },
      [input, handleInputChange],
    );

    return (
      <BaseChat
        ref={animationScope}
        textareaRef={textareaRef}
        input={input}
        showChat={showChat}
        chatStarted={chatStarted}
        isStreaming={isLoading || fakeLoading}
        onStreamingChange={(streaming) => {
          streamingState.set(streaming);
        }}
        enhancingPrompt={enhancingPrompt}
        promptEnhanced={promptEnhanced}
        sendMessage={sendMessage}
        model={model}
        setModel={handleModelChange}
        provider={provider}
        setProvider={handleProviderChange}
        providerList={activeProviders}
        handleInputChange={(e) => {
          onTextareaChange(e);
          debouncedCachePrompt(e);
        }}
        handleStop={abort}
        description={description}
        importChat={importChat}
        exportChat={exportChat}
        messages={messages.map((message, i) => {
          if (message.role === 'user') {
            return message;
          }

          return {
            ...message,
            content: parsedMessages[i] || '',
          };
        })}
        enhancePrompt={() => {
          enhancePrompt(
            input,
            (input) => {
              setInput(input);
              scrollTextArea();
            },
            model,
            provider,
            apiKeys,
          );
        }}
        uploadedFiles={uploadedFiles}
        setUploadedFiles={setUploadedFiles}
        imageDataList={imageDataList}
        setImageDataList={setImageDataList}
        actionAlert={actionAlert}
        clearAlert={() => workbenchStore.clearAlert()}
        supabaseAlert={supabaseAlert}
        clearSupabaseAlert={() => workbenchStore.clearSupabaseAlert()}
        deployAlert={deployAlert}
        clearDeployAlert={() => workbenchStore.clearDeployAlert()}
        llmErrorAlert={llmErrorAlert}
        clearLlmErrorAlert={clearApiErrorAlert}
        data={boundedChatData}
        chatMode={chatMode}
        setChatMode={setChatMode}
        append={append}
        designScheme={designScheme}
        setDesignScheme={setDesignScheme}
        selectedElement={selectedElement}
        setSelectedElement={setSelectedElement}
        addToolResult={addToolResult}
        onWebSearchResult={handleWebSearchResult}
        onSaveSession={handleSaveSession}
        onResumeSession={handleResumeSession}
        onShareSession={handleShareSession}
        agentMode={agentMode}
        setAgentMode={setAgentMode}
        onSketchChange={setSketchElements}
        autonomyMode={autonomyMode}
        setAutonomyMode={(mode: AutonomyMode) => workbenchStore.setAutonomyMode(mode)}
        latestRunMetrics={latestRunMetrics}
        latestUsage={latestUsage}
        onApiKeysUpdated={handleApiKeysUpdated}
      />
    );
  },
);
