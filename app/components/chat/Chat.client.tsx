import { useStore } from '@nanostores/react';
import type { Message } from 'ai';
import { useChat } from '@ai-sdk/react';
import { useAnimate } from 'framer-motion';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { flushSync } from 'react-dom';
import { BaseChat } from './BaseChat';
import { useMessageParser, usePromptEnhancer, useShortcuts } from '~/lib/hooks';
import { chatId as persistedChatId, description, useChatHistory } from '~/lib/persistence';
import { chatStore } from '~/lib/stores/chat';
import { workbenchStore } from '~/lib/stores/workbench';
import { getCollaborationServerUrl } from '~/lib/collaboration/config';
import { DEFAULT_MODEL, DEFAULT_PROVIDER, PROMPT_COOKIE_KEY, PROVIDER_LIST } from '~/utils/constants';
import { cubicEasingFn } from '~/utils/easings';
import { createScopedLogger, renderLogger } from '~/utils/logger';
import Cookies from 'js-cookie';
import { debounce } from '~/utils/debounce';
import { useSettings } from '~/lib/hooks/useSettings';
import type { IProviderSetting, ProviderInfo } from '~/types/model';
import { useSearchParams } from '@remix-run/react';
import { createSampler } from '~/utils/sampler';
import {
  getTemplates,
  selectStarterTemplate,
  type StarterTemplateBootstrapCommands,
} from '~/utils/selectStarterTemplate';
import { logStore } from '~/lib/stores/logs';
import { streamingState } from '~/lib/stores/streaming';
import { filesToArtifacts } from '~/utils/fileUtils';
import { supabaseConnection } from '~/lib/stores/supabase';
import { defaultDesignScheme, type DesignScheme } from '~/types/design-scheme';
import type { ElementInfo } from '~/components/workbench/Inspector';
import type { TextUIPart, FileUIPart, Attachment } from '@ai-sdk/ui-utils';
import type { FileMap } from '~/lib/stores/files';
import { useMCPStore } from '~/lib/stores/mcp';
import type { ActionAlert, LlmErrorAlertType } from '~/types/actions';
import { buildModelSelectionEnvelope, selectModelForPrompt } from '~/lib/runtime/model-orchestrator';
import type { ModelInfo } from '~/lib/modules/llm/types';
import { recordTokenUsage } from '~/lib/stores/performance';
import { mergePromptContext } from '~/lib/services/prompt-merge';
import { LOCAL_PROVIDERS } from '~/lib/stores/settings';
import {
  LAST_CONFIGURED_PROVIDER_COOKIE_KEY,
  getRememberedProviderModel,
  pickPreferredProviderName,
  recordProviderHistory,
  readInstanceSelection,
  rememberInstanceSelection,
  rememberProviderModelSelection,
  resolvePreferredModelName,
} from '~/lib/runtime/model-selection';
import { normalizeUsageEvent } from '~/lib/runtime/cost-estimation';
import type { ArchitectDiagnosis } from '~/lib/runtime/architect';
import type { AgentMode, AgentPlanStep } from '~/lib/runtime/agent-workflow';
import type { InteractiveStepRunnerEvent } from '~/lib/runtime/interactive-step-runner';
import { getLastMeaningfulProgressTimestamp } from '~/lib/runtime/stall-progress';
import { resolveStallPolicy } from '~/lib/runtime/stall-policy';
import { isHostedRuntimeEnabled } from '~/lib/runtime/hosted-runtime-client';
import type { TextFileSnapshot } from '~/lib/runtime/agent-file-diffs';
import type { SketchElement } from '~/components/chat/SketchCanvas';
import type { AutonomyMode } from '~/lib/runtime/autonomy';
import type {
  AgentRunMetricsDataEvent,
  CheckpointDataEvent,
  ProjectMemoryDataEvent,
  SyntheticRunHandoffDataEvent,
  UsageDataEvent,
} from '~/types/context';
import { shouldUnlockPromptAfterPreviewReady } from './execution-status';
import { hasFallbackStarterPlaceholder, STARTER_PLACEHOLDER_TEXT } from '~/lib/runtime/starter-placeholder';
import { getHiddenContinuationDelay, shouldDispatchHiddenContinuation } from '~/lib/runtime/continuation-dispatch';
import { getApiKeysFromCookies, setApiKeysCookie } from '~/lib/runtime/api-key-storage';
import { classifyRecoverableStreamError, shouldIgnoreDisconnectAfterCompletedRun } from '~/lib/runtime/recovery-errors';
import { securedFetch } from '~/lib/hooks/useCsrf';
import { buildStarterBootstrapMessages } from './starter-bootstrap-messages';
import {
  getStarterBootstrapRuntimeActionStatus,
  selectMissingStarterBootstrapRuntimeActions,
  shouldWaitForStarterBootstrapObservation,
  shouldWaitForStarterContinuation,
  shouldRunImmediateStarterBootstrapRuntime,
  type StarterBootstrapRuntimeAction,
} from './starter-bootstrap-runtime';
import {
  selectSyntheticRuntimeHandoffCandidate,
  shouldApplySyntheticRuntimeHandoff,
} from './synthetic-runtime-handoff';

const logger = createScopedLogger('Chat');
const ARCHITECT_NAME = 'Architect';
const PROJECT_MEMORY_STORAGE_PREFIX = 'bolt_project_memory_v2';
const PROJECT_CONTEXT_STORAGE_PREFIX = 'bolt_project_context_v1';
const CHAT_SELECTION_COOKIE_EXPIRY_DAYS = 365;
const MAX_CHAT_DATA_EVENTS = 140;
const MAX_STEP_RUNNER_EVENTS = 96;
const TELEMETRY_SAMPLE_MS = 10000;
const TELEMETRY_EMIT_INTERVAL_MS = 60000;
const HOSTED_TELEMETRY_SAMPLE_MS = 30000;
const HOSTED_TELEMETRY_EMIT_INTERVAL_MS = 120000;
const STEP_EVENT_FLUSH_MS = 250;
const TELEMETRY_OUTPUT_MAX_CHARS = 1600;
const TELEMETRY_MERGE_WINDOW_MS = 20000;
const LOCAL_PROVIDER_SET = new Set<string>(LOCAL_PROVIDERS);
const ANSI_ESCAPE_RE = /\u001b\[[0-?]*[ -/]*[@-~]/g;
const CARRIAGE_RETURN_RE = /\r+/g;
const loadSessionManager = () => import('~/lib/services/sessionManager');
const loadSessionPayloadModule = () => import('~/lib/services/session-payload');
const loadArchitectModule = () => import('~/lib/runtime/architect');
const loadAgentWorkflowModule = () => import('~/lib/runtime/agent-workflow');
const loadAgentFileDiffsModule = () => import('~/lib/runtime/agent-file-diffs');
const loadStarterBootstrapModule = () => import('~/lib/runtime/starter-bootstrap');
const loadMutatingIntentModule = () => import('~/lib/runtime/mutating-intent');

type StoredProjectMemory = ProjectMemoryDataEvent | null;
type ApiKeysUpdatePayload = {
  apiKeys: Record<string, string>;
  providerName: string;
  apiKey: string;
  providerModels: ModelInfo[];
};
type PendingArchitectAutoHeal = {
  alert: ActionAlert;
  diagnosis: ArchitectDiagnosis;
  alertKey: string;
  promptGeneration: number;
};

type QueuedHiddenContinuation = {
  idSuffix: string;
  content: string;
  failureDescription: string;
  successDescription?: string;
  attempt: number;
  scheduledAt: number;
};

function hasMaterializedStarterWorkspace(fileMap: FileMap | undefined): boolean {
  if (!fileMap) {
    return false;
  }

  return Object.entries(fileMap).some(([filePath, dirent]) => {
    if (dirent?.type !== 'file' || dirent.isBinary) {
      return false;
    }

    return /(^|\/)(package\.json|src\/App\.(?:[jt]sx?|vue|svelte)|app\/page\.(?:[jt]sx?))$/i.test(filePath);
  });
}

function collectWorkbenchRuntimeActions(): StarterBootstrapRuntimeAction[] {
  return Object.values(workbenchStore.artifacts.get()).flatMap((artifact) =>
    Object.values(artifact.runner.actions.get())
      .filter((action) => action.type === 'shell' || action.type === 'start')
      .map((action) => ({
        type: action.type as StarterBootstrapRuntimeAction['type'],
        content: action.content,
        status: action.status,
      })),
  );
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function isSyntheticRunHandoffEvent(value: unknown): value is SyntheticRunHandoffDataEvent {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    (value as any).type === 'synthetic-run-handoff'
  );
}

function isCheckpointDataEvent(value: unknown): value is CheckpointDataEvent {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && (value as any).type === 'checkpoint';
}

function createProjectContextId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `pc_${crypto.randomUUID()}`;
  }

  return `pc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function getProjectContextStorageKey(chatIdValue: string) {
  return `${PROJECT_CONTEXT_STORAGE_PREFIX}:${chatIdValue}`;
}

function getProjectMemoryStorageKey(projectContextId: string) {
  return `${PROJECT_MEMORY_STORAGE_PREFIX}:${projectContextId}`;
}

function loadStoredProjectContextId(chatIdValue: string | undefined): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  if (!chatIdValue) {
    return null;
  }

  return window.localStorage.getItem(getProjectContextStorageKey(chatIdValue));
}

function persistProjectContextId(chatIdValue: string, projectContextId: string) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(getProjectContextStorageKey(chatIdValue), projectContextId);
}

function loadStoredProjectMemory(projectContextId: string | null | undefined): StoredProjectMemory {
  if (typeof window === 'undefined' || !projectContextId) {
    return null;
  }

  const raw = window.localStorage.getItem(getProjectMemoryStorageKey(projectContextId));

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

function persistProjectMemory(projectContextId: string, memory: ProjectMemoryDataEvent) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(getProjectMemoryStorageKey(projectContextId), JSON.stringify(memory));
}

function getApiKeysFromCookiesSafe(): Record<string, string> {
  return getApiKeysFromCookies();
}

function getProviderSettingsFromCookiesSafe(): Record<string, IProviderSetting> {
  try {
    const raw = Cookies.get('providers');

    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as Record<string, IProviderSetting>;

    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function buildActionAlertKey(alert: ActionAlert): string {
  return [alert.source || 'unknown', alert.title || '', alert.description || '', alert.content || ''].join('::');
}

function resolveProviderInfo(providerName: string | undefined): ProviderInfo {
  return (PROVIDER_LIST.find((provider) => provider.name === providerName) || DEFAULT_PROVIDER) as ProviderInfo;
}

async function fetchProviderModels(providerName: string): Promise<ModelInfo[]> {
  try {
    const response = await fetch(`/api/models/${encodeURIComponent(providerName)}`);
    const payload = (await response.json()) as { modelList?: ModelInfo[] };

    if (!response.ok) {
      return resolveProviderInfo(providerName).staticModels || [];
    }

    return payload.modelList || resolveProviderInfo(providerName).staticModels || [];
  } catch {
    return resolveProviderInfo(providerName).staticModels || [];
  }
}

let bufferedStepRunnerEvents: InteractiveStepRunnerEvent[] = [];
let stepRunnerFlushHandle: ReturnType<typeof setTimeout> | null = null;

function findMergeableStreamIndex(events: InteractiveStepRunnerEvent[], incoming: InteractiveStepRunnerEvent): number {
  if (incoming.type !== 'stdout' && incoming.type !== 'stderr') {
    return -1;
  }

  for (let index = events.length - 1; index >= 0; index--) {
    const candidate = events[index];

    if (candidate.stepIndex !== incoming.stepIndex) {
      continue;
    }

    if (candidate.type === 'step-end' || candidate.type === 'error' || candidate.type === 'complete') {
      break;
    }

    if (candidate.type === incoming.type) {
      return index;
    }
  }

  return -1;
}

function mergeOrAppendStepRunnerEvent(
  events: InteractiveStepRunnerEvent[],
  event: InteractiveStepRunnerEvent,
): InteractiveStepRunnerEvent[] {
  if (events.length === 0) {
    return [event];
  }

  const last = events[events.length - 1];
  const streamMergeIndex = findMergeableStreamIndex(events, event);

  if (streamMergeIndex >= 0) {
    const target = events[streamMergeIndex];
    const mergedOutput = `${target.output || ''}${target.output ? '\n' : ''}${event.output || ''}`.slice(
      -TELEMETRY_OUTPUT_MAX_CHARS,
    );
    const mergedEvent: InteractiveStepRunnerEvent = {
      ...target,
      timestamp: event.timestamp,
      output: mergedOutput,
    };
    const next = [...events];
    next[streamMergeIndex] = mergedEvent;

    return next;
  }

  const isDuplicateTelemetry =
    event.type === 'telemetry' &&
    last.type === 'telemetry' &&
    (last.output || '') === (event.output || '') &&
    (last.description || '') === (event.description || '');

  if (isDuplicateTelemetry) {
    return [...events.slice(0, -1), { ...last, timestamp: event.timestamp }];
  }

  if (event.type === 'telemetry' && last.type === 'telemetry') {
    const lastTimestamp = Date.parse(last.timestamp || '');
    const nextTimestamp = Date.parse(event.timestamp || '');
    const distance =
      Number.isFinite(lastTimestamp) && Number.isFinite(nextTimestamp) ? nextTimestamp - lastTimestamp : 0;

    if (distance < TELEMETRY_MERGE_WINDOW_MS) {
      return [...events.slice(0, -1), { ...last, ...event }];
    }
  }

  return [...events, event];
}

function flushBufferedStepRunnerEvents() {
  if (stepRunnerFlushHandle) {
    clearTimeout(stepRunnerFlushHandle);
    stepRunnerFlushHandle = null;
  }

  if (bufferedStepRunnerEvents.length === 0) {
    return;
  }

  const current = workbenchStore.stepRunnerEvents.get();
  let next = [...current];

  for (const event of bufferedStepRunnerEvents) {
    next = mergeOrAppendStepRunnerEvent(next, event);
  }

  bufferedStepRunnerEvents = [];
  workbenchStore.stepRunnerEvents.set(next.slice(-MAX_STEP_RUNNER_EVENTS));
}

function scheduleBufferedStepRunnerFlush() {
  if (stepRunnerFlushHandle) {
    return;
  }

  stepRunnerFlushHandle = setTimeout(() => {
    flushBufferedStepRunnerEvents();
  }, STEP_EVENT_FLUSH_MS);
}

function appendStepRunnerEvent(event: InteractiveStepRunnerEvent) {
  const normalizedEvent: InteractiveStepRunnerEvent = {
    ...event,
    output:
      typeof event.output === 'string'
        ? event.output
            .replace(ANSI_ESCAPE_RE, '')
            .replace(CARRIAGE_RETURN_RE, '')
            .replace(/\n{3,}/g, '\n\n')
            .slice(-TELEMETRY_OUTPUT_MAX_CHARS)
        : event.output,
  };

  bufferedStepRunnerEvents.push(normalizedEvent);

  if (normalizedEvent.type === 'stdout' || normalizedEvent.type === 'stderr' || normalizedEvent.type === 'telemetry') {
    scheduleBufferedStepRunnerFlush();
    return;
  }

  flushBufferedStepRunnerEvents();
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

  useEffect(() => {
    if (!ready) {
      return;
    }

    logStore.logSystem('Chat shell ready', {
      initialMessageCount: initialMessages.length,
      persistedHistoryReady: true,
    });
  }, [initialMessages.length, ready]);

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
    const promptSurfaceReadyLoggedRef = useRef(false);
    const [chatStarted, setChatStarted] = useState(initialMessages.length > 0);
    const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
    const [imageDataList, setImageDataList] = useState<string[]>([]);
    const [searchParams, setSearchParams] = useSearchParams();
    const [fakeLoading, setFakeLoading] = useState(false);
    const files = useStore(workbenchStore.files);
    const stepRunnerEvents = useStore(workbenchStore.stepRunnerEvents);
    const previews = useStore(workbenchStore.previews);
    const currentChatId = useStore(persistedChatId);
    const [designScheme, setDesignScheme] = useState<DesignScheme>(defaultDesignScheme);
    const actionAlert = useStore(workbenchStore.alert);
    const isRuntimeScannerEnabled = useStore(workbenchStore.isRuntimeScannerEnabled);
    const deployAlert = useStore(workbenchStore.deployAlert);
    const supabaseConn = useStore(supabaseConnection);
    const selectedProject = supabaseConn.stats?.projects?.find(
      (project) => project.id === supabaseConn.selectedProjectId,
    );
    const supabaseAlert = useStore(workbenchStore.supabaseAlert);
    const { activeProviders, promptId, autoSelectTemplate, contextOptimizationEnabled } = useSettings();
    const [provider, setProvider] = useState<ProviderInfo>(() => {
      const savedProvider = Cookies.get('selectedProvider');
      return resolveProviderInfo(savedProvider);
    });
    const [llmErrorAlert, setLlmErrorAlert] = useState<LlmErrorAlertType | undefined>(undefined);
    const [model, setModel] = useState(() => {
      const savedProvider = Cookies.get('selectedProvider');
      const savedModel = Cookies.get('selectedModel');
      const visibleProvider = resolveProviderInfo(savedProvider);
      const sanitizedVisibleModel = resolvePreferredModelName({
        providerName: visibleProvider.name,
        models: visibleProvider.staticModels || [],
        savedModelName: savedModel,
      });

      return sanitizedVisibleModel || savedModel || DEFAULT_MODEL;
    });
    const runContextRef = useRef<{ model: string; providerName: string }>({
      model,
      providerName: provider.name,
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
    const [projectContextId, setProjectContextId] = useState(() => {
      const storedProjectContextId = loadStoredProjectContextId(currentChatId);

      return storedProjectContextId || createProjectContextId();
    });
    const [projectMemory, setProjectMemory] = useState<StoredProjectMemory>(null);
    const [latestRunMetrics, setLatestRunMetrics] = useState<AgentRunMetricsDataEvent | null>(null);
    const [latestUsage, setLatestUsage] = useState<UsageDataEvent | null>(null);
    const [pendingArchitectAutoHeal, setPendingArchitectAutoHeal] = useState<PendingArchitectAutoHeal | null>(null);
    const [architectAutoHealStatus, setArchitectAutoHealStatus] = useState<'queued' | 'running' | null>(null);
    const hostedRuntimeEnabled = useMemo(() => isHostedRuntimeEnabled(), []);
    const selectionBootstrapRef = useRef(false);
    const previousChatIdRef = useRef<string | undefined>(currentChatId);
    const architectAttemptCountsRef = useRef<Record<string, number>>({});
    const architectInFlightRef = useRef(false);
    const manualPromptGenerationRef = useRef(0);
    const architectAlertPromptGenerationRef = useRef<Record<string, number>>({});
    const providerEnvKeyStatusRef = useRef<Record<string, boolean>>({});
    const mcpSettings = useMCPStore((state) => state.settings);
    const mcpInitialized = useMCPStore((state) => state.isInitialized);
    const initializeMcp = useMCPStore((state) => state.initialize);

    useEffect(() => {
      if (provider?.name) {
        return;
      }

      setProvider(DEFAULT_PROVIDER as ProviderInfo);
    }, [provider]);

    useEffect(() => {
      const previousChatId = previousChatIdRef.current;
      previousChatIdRef.current = currentChatId;

      if (!currentChatId) {
        if (previousChatId !== undefined) {
          setProjectContextId(createProjectContextId());
        }

        return;
      }

      const storedProjectContextId = loadStoredProjectContextId(currentChatId);

      if (storedProjectContextId) {
        if (storedProjectContextId !== projectContextId) {
          setProjectContextId(storedProjectContextId);
        }

        return;
      }

      const nextProjectContextId = previousChatId === undefined ? projectContextId : createProjectContextId();
      persistProjectContextId(currentChatId, nextProjectContextId);

      if (nextProjectContextId !== projectContextId) {
        setProjectContextId(nextProjectContextId);
      }
    }, [currentChatId, projectContextId]);

    useEffect(() => {
      setProjectMemory(loadStoredProjectMemory(projectContextId));
    }, [projectContextId]);

    useEffect(() => {
      runContextRef.current = {
        model,
        providerName: provider?.name || DEFAULT_PROVIDER.name,
      };
    }, [model, provider]);

    useEffect(() => {
      if (provider.name !== 'FREE') {
        return;
      }

      const visibleDefaultModel = provider.staticModels?.[0]?.name || DEFAULT_MODEL;

      if (!visibleDefaultModel || model === visibleDefaultModel) {
        return;
      }

      setModel(visibleDefaultModel);
      Cookies.set('selectedModel', visibleDefaultModel, { expires: CHAT_SELECTION_COOKIE_EXPIRY_DAYS });
      rememberProviderModelSelection(provider.name, visibleDefaultModel);

      if (typeof window !== 'undefined') {
        rememberInstanceSelection({
          hostname: window.location.hostname,
          providerName: provider.name,
          modelName: visibleDefaultModel,
        });
      }
    }, [model, provider]);

    useEffect(() => {
      promptSurfaceReadyLoggedRef.current = false;
    }, [provider?.name, model]);

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
      fetch: securedFetch,
      body: {
        apiKeys,
        providerSettings: getProviderSettingsFromCookiesSafe(),
        selectedProvider: provider.name,
        selectedModel: model,
        files,
        hostedRuntimeSessionId: hostedRuntimeEnabled ? workbenchStore.hostedRuntimeSessionId : undefined,
        projectContextId,
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
          const activeRunContext = runContextRef.current;
          setLatestUsage(normalizedUsage);
          recordTokenUsage(normalizedUsage);
          logStore.logProvider('Chat response completed', {
            component: 'Chat',
            action: 'response',
            model: activeRunContext.model,
            provider: activeRunContext.providerName,
            usage: normalizedUsage,
            messageLength: message.content.length,
          });
        }

        logger.debug('Finished streaming');
      },
      initialMessages,
      initialInput: Cookies.get(PROMPT_COOKIE_KEY) || '',
    });

    useEffect(() => {
      let delayedPromptCheck: number | null = null;

      if (typeof window !== 'undefined') {
        delayedPromptCheck = window.setTimeout(() => {
          if (textareaRef.current || promptSurfaceReadyLoggedRef.current) {
            return;
          }

          logStore.logWarning('Prompt surface did not mount within expected time', {
            provider: provider?.name,
            model,
            chatStarted,
            pathname: window.location.pathname,
          });
        }, 3000);
      }

      return () => {
        if (delayedPromptCheck !== null && typeof window !== 'undefined') {
          window.clearTimeout(delayedPromptCheck);
        }
      };
    }, [chatStarted, model, provider?.name]);

    useEffect(() => {
      if (!textareaRef.current || promptSurfaceReadyLoggedRef.current) {
        return;
      }

      promptSurfaceReadyLoggedRef.current = true;
      logStore.logSystem('Prompt surface ready', {
        provider: provider?.name,
        model,
        chatStarted,
      });
    }, [chatStarted, input, model, provider?.name]);

    const boundedChatData = useMemo(() => (chatData || []).slice(-MAX_CHAT_DATA_EVENTS), [chatData]);
    const lastDataEventAtRef = useRef(Date.now());
    const stallReportedRef = useRef(false);
    const stallRecoveryTriggeredRef = useRef(false);
    const lastTelemetryEmitAtRef = useRef(0);
    const lastMessageProgressAtRef = useRef(Date.now());
    const lastAssistantProgressSignatureRef = useRef('');
    const latestUserRequestRef = useRef('');
    const requestLifecycleStartedAtRef = useRef(Date.now());
    const lastRunCompletedAtRef = useRef<number | null>(null);
    const lastPreviewReadyAtRef = useRef<number | null>(null);
    const pendingStarterContinuationRef = useRef<string | null>(null);
    const starterContinuationTriggeredRef = useRef(false);
    const starterBootstrapCommandsRef = useRef<StarterTemplateBootstrapCommands | null>(null);
    const starterBootstrapQueuedAtRef = useRef<number | null>(null);
    const starterStartRecoveryTriggeredRef = useRef(false);
    const autoContinuationCountRef = useRef(0);
    const previewPromptUnlockTriggeredRef = useRef(false);
    const isLoadingRef = useRef(isLoading);
    const fakeLoadingRef = useRef(fakeLoading);
    const messagesRef = useRef(messages);
    const appliedSyntheticRunHandoffsRef = useRef(new Set<string>());
    const pendingSyntheticRunHandoffRef = useRef<SyntheticRunHandoffDataEvent | null>(null);
    const [queuedHiddenContinuation, setQueuedHiddenContinuation] = useState<QueuedHiddenContinuation | null>(null);

    useEffect(() => {
      isLoadingRef.current = isLoading;
    }, [isLoading]);

    useEffect(() => {
      fakeLoadingRef.current = fakeLoading;
    }, [fakeLoading]);

    useEffect(() => {
      messagesRef.current = messages;
    }, [messages]);

    useEffect(() => {
      if (isRuntimeScannerEnabled && actionAlert && !isLoading && !fakeLoading) {
        const isPreview = actionAlert.source === 'preview';
        const prompt = `*Fix this ${isPreview ? 'preview' : 'terminal'} error* \n\`\`\`${isPreview ? 'js' : 'sh'}\n${actionAlert.content}\n\`\`\`\n`;

        // Clear alerts before starting the fix to prevent duplicate triggers
        workbenchStore.clearAlert();

        if (isPreview) {
          workbenchStore.clearPreviewAlert();
        }

        toast.info(`Runtime Scanner detected a ${isPreview ? 'preview' : 'terminal'} error and is auto-fixing it.`);

        // Dispatch the error fix request
        append({
          role: 'user',
          content: prompt,
        });
      }
    }, [actionAlert, isRuntimeScannerEnabled, isLoading, fakeLoading, append]);

    useEffect(() => {
      const lastAssistantMessage = [...messages]
        .reverse()
        .find((message) => message.role === 'assistant' && typeof message.content === 'string');
      const nextSignature = lastAssistantMessage
        ? `${lastAssistantMessage.id}:${lastAssistantMessage.content.length}`
        : '';

      if (nextSignature && nextSignature !== lastAssistantProgressSignatureRef.current) {
        lastAssistantProgressSignatureRef.current = nextSignature;
        lastMessageProgressAtRef.current = Date.now();
      }
    }, [messages]);

    const appendHiddenContinuation = useCallback(
      (args: { idSuffix: string; content: string; failureDescription: string; successDescription?: string }) => {
        const initialBusy = isLoadingRef.current || fakeLoadingRef.current;
        const delayMs = getHiddenContinuationDelay({
          attempt: 1,
          isBusy: initialBusy,
        });

        setQueuedHiddenContinuation({
          ...args,
          attempt: 1,
          scheduledAt: Date.now() + delayMs,
        });
      },
      [],
    );

    useEffect(() => {
      if (!queuedHiddenContinuation) {
        return undefined;
      }

      const maxAttempts = 4;

      if (
        !shouldDispatchHiddenContinuation({
          isLoading,
          fakeLoading,
          scheduledAt: queuedHiddenContinuation.scheduledAt,
          now: Date.now(),
        })
      ) {
        const delayMs = Math.max(100, queuedHiddenContinuation.scheduledAt - Date.now());
        const timer = window.setTimeout(() => {
          setQueuedHiddenContinuation((current) => (current ? { ...current } : current));
        }, delayMs);

        return () => {
          window.clearTimeout(timer);
        };
      }

      let cancelled = false;

      void append({
        id: `${Date.now()}-${queuedHiddenContinuation.idSuffix}`,
        role: 'user',
        content: queuedHiddenContinuation.content,
        annotations: ['hidden'],
      })
        .then(() => {
          if (cancelled) {
            return;
          }

          if (queuedHiddenContinuation.successDescription) {
            appendStepRunnerEvent({
              type: 'telemetry',
              timestamp: new Date().toISOString(),
              description: queuedHiddenContinuation.successDescription,
              output: `attempt=${queuedHiddenContinuation.attempt}/${maxAttempts}`,
            });
          }

          setQueuedHiddenContinuation(null);
        })
        .catch((dispatchError) => {
          if (cancelled) {
            return;
          }

          appendStepRunnerEvent({
            type: 'error',
            timestamp: new Date().toISOString(),
            description: `${queuedHiddenContinuation.failureDescription} (${queuedHiddenContinuation.attempt}/${maxAttempts})`,
            error: dispatchError instanceof Error ? dispatchError.message : 'Unknown continuation dispatch error',
          });

          if (queuedHiddenContinuation.attempt >= maxAttempts) {
            setQueuedHiddenContinuation(null);

            return;
          }

          const nextAttempt = queuedHiddenContinuation.attempt + 1;
          const delayMs = getHiddenContinuationDelay({
            attempt: nextAttempt,
            isBusy: isLoadingRef.current || fakeLoadingRef.current,
          });

          setQueuedHiddenContinuation({
            ...queuedHiddenContinuation,
            attempt: nextAttempt,
            scheduledAt: Date.now() + delayMs,
          });
        });

      return () => {
        cancelled = true;
      };
    }, [append, fakeLoading, isLoading, queuedHiddenContinuation]);

    const dispatchAutoContinuation = useCallback(
      (args: { idSuffix: string; content: string; failureDescription: string; successDescription?: string }) => {
        const stallPolicy = resolveStallPolicy(runContextRef.current.model);

        if (autoContinuationCountRef.current >= stallPolicy.maxAutoContinuations) {
          appendStepRunnerEvent({
            type: 'error',
            timestamp: new Date().toISOString(),
            description: 'Auto-recovery continuation limit reached',
            error: `Reached ${stallPolicy.maxAutoContinuations} continuation attempts for this request.`,
            output: 'Review the latest timeline events and retry after adjusting provider/model or prompt scope.',
          });
          toast.error('Auto-recovery reached its retry limit for this request. Please retry with a narrower prompt.');
          setFakeLoading(false);

          return false;
        }

        autoContinuationCountRef.current += 1;
        requestLifecycleStartedAtRef.current = Date.now();
        appendHiddenContinuation(args);

        return true;
      },
      [appendHiddenContinuation],
    );

    const dispatchStarterContinuation = useCallback(
      (reason: 'stream-finished' | 'stream-stalled') => {
        const pendingStarterContext = pendingStarterContinuationRef.current;
        const activeRunContext = runContextRef.current;
        const starterPlaceholderStillPresent = hasFallbackStarterPlaceholder(workbenchStore.files.get());

        if (!pendingStarterContext || starterContinuationTriggeredRef.current) {
          return false;
        }

        const normalizedRequest = pendingStarterContext.trim() || latestUserRequestRef.current.trim();

        if (!normalizedRequest) {
          pendingStarterContinuationRef.current = null;
          starterContinuationTriggeredRef.current = false;
          starterBootstrapQueuedAtRef.current = null;

          return false;
        }

        starterContinuationTriggeredRef.current = true;

        const nextAttempt = autoContinuationCountRef.current + 1;

        const continuationPrompt = buildModelSelectionEnvelope({
          model: activeRunContext.model,
          providerName: activeRunContext.providerName,
          selectionReason:
            reason === 'stream-stalled'
              ? 'Starter bootstrap stalled. Continuing with the user request.'
              : 'Starter bootstrap completed. Continuing with the user request.',
          includeSelectionReason: true,
          content: `${
            starterPlaceholderStillPresent
              ? 'Starter bootstrap is complete, but the fallback placeholder is still present.'
              : 'Starter bootstrap is complete, but the imported starter baseline still needs to be turned into the requested app.'
          }
Continue implementing the original request now and do not stop at scaffold/install/start.

Starter import context:
${normalizedRequest}

Requirements:
1) Continue from the existing files and runtime state. Do not re-run create-vite/create-react-app if package.json already exists.
2) Replace any fallback placeholder UI or starter baseline screen in src/App.tsx, src/App.jsx, app/page.tsx, or the equivalent entry screen.
3) Implement the requested features fully, beyond the starter baseline.
4) Keep preview running and verify the output.
5) Your first output must be actionable <boltAction> steps (do not respond with plan-only prose).
6) If a command fails, self-heal by correcting the command and retrying.
7) Do not finish while the preview still shows the imported starter instead of the requested app${
            starterPlaceholderStillPresent ? `, including "${STARTER_PLACEHOLDER_TEXT}"` : ''
          }.
8) Finish with a concise completion summary plus any remaining gaps.`,
        });

        appendStepRunnerEvent({
          type: 'telemetry',
          timestamp: new Date().toISOString(),
          description:
            reason === 'stream-stalled'
              ? 'Dispatching hidden continuation after starter stall'
              : 'Dispatching hidden continuation after starter bootstrap',
          output: `provider=${activeRunContext.providerName} model=${activeRunContext.model} attempt=${nextAttempt}`,
        });

        const dispatched = dispatchAutoContinuation({
          idSuffix: 'starter-followup',
          content: continuationPrompt,
          failureDescription: 'Failed to dispatch starter continuation',
          successDescription: 'Hidden starter continuation dispatched',
        });

        if (!dispatched) {
          pendingStarterContinuationRef.current = null;
          starterContinuationTriggeredRef.current = false;
          starterBootstrapQueuedAtRef.current = null;
        } else {
          starterBootstrapQueuedAtRef.current = null;
        }

        return dispatched;
      },
      [dispatchAutoContinuation],
    );

    useEffect(() => {
      if (!boundedChatData || boundedChatData.length === 0) {
        return;
      }

      lastDataEventAtRef.current = Date.now();

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

          persistProjectMemory(projectContextId, lastProjectMemoryEvent);

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
        const runCompletedAt = Date.parse(lastRunMetricsEvent.timestamp || '');

        if (Number.isFinite(runCompletedAt)) {
          lastRunCompletedAtRef.current = runCompletedAt;
        }

        setLatestRunMetrics((prev) => (prev?.runId === lastRunMetricsEvent.runId ? prev : lastRunMetricsEvent));
      }
    }, [boundedChatData, projectContextId]);

    useEffect(() => {
      const latestSyntheticRunHandoff = [...boundedChatData]
        .reverse()
        .find((item): item is SyntheticRunHandoffDataEvent => isSyntheticRunHandoffEvent(item));
      const syntheticRunHandoff = selectSyntheticRuntimeHandoffCandidate({
        latestEvent: latestSyntheticRunHandoff,
        pendingEvent: pendingSyntheticRunHandoffRef.current,
      });

      if (latestSyntheticRunHandoff) {
        pendingSyntheticRunHandoffRef.current = latestSyntheticRunHandoff;
      }

      if (!syntheticRunHandoff) {
        return;
      }

      const currentMessages = messagesRef.current;

      if (
        !shouldApplySyntheticRuntimeHandoff({
          event: syntheticRunHandoff,
          appliedHandoffIds: appliedSyntheticRunHandoffsRef.current,
          messages: currentMessages,
          isLoading,
          fakeLoading,
        })
      ) {
        if (
          appliedSyntheticRunHandoffsRef.current.has(syntheticRunHandoff.handoffId) ||
          currentMessages.some((message) => message.id === syntheticRunHandoff.messageId)
        ) {
          pendingSyntheticRunHandoffRef.current = null;
        }

        return;
      }

      appliedSyntheticRunHandoffsRef.current.add(syntheticRunHandoff.handoffId);
      pendingSyntheticRunHandoffRef.current = null;
      lastMessageProgressAtRef.current = Date.now();

      appendStepRunnerEvent({
        type: 'telemetry',
        timestamp: new Date().toISOString(),
        description: 'Workspace runtime handoff received',
        output: `start=${syntheticRunHandoff.startCommand}${syntheticRunHandoff.setupCommand ? ` | setup=${syntheticRunHandoff.setupCommand}` : ''}`,
      });

      window.setTimeout(() => {
        void workbenchStore.dispatchSyntheticRuntimeHandoff({
          handoffId: syntheticRunHandoff.handoffId,
          messageId: syntheticRunHandoff.messageId,
          setupCommand: syntheticRunHandoff.setupCommand,
          startCommand: syntheticRunHandoff.startCommand,
        });
      }, 0);

      toast.info('Workspace runtime handoff: launching the preview from inferred project commands.');
    }, [boundedChatData, fakeLoading, isLoading]);

    const appliedHostedPreviewCheckpointRef = useRef<string | null>(null);

    useEffect(() => {
      const hostedPreviewCheckpoint = [...boundedChatData]
        .reverse()
        .find(
          (item): item is CheckpointDataEvent =>
            isCheckpointDataEvent(item) &&
            item.checkpointType === 'preview-ready' &&
            typeof item.previewBaseUrl === 'string' &&
            item.previewBaseUrl.length > 0 &&
            typeof item.previewPort === 'number',
        );

      if (!hostedPreviewCheckpoint?.previewBaseUrl || typeof hostedPreviewCheckpoint.previewPort !== 'number') {
        return;
      }

      const checkpointSignature = [
        hostedPreviewCheckpoint.timestamp,
        hostedPreviewCheckpoint.previewBaseUrl,
        hostedPreviewCheckpoint.previewPort,
      ].join('::');

      if (appliedHostedPreviewCheckpointRef.current === checkpointSignature) {
        return;
      }

      appliedHostedPreviewCheckpointRef.current = checkpointSignature;

      const previewReadyAt = Date.parse(hostedPreviewCheckpoint.timestamp || '');

      if (Number.isFinite(previewReadyAt)) {
        lastPreviewReadyAtRef.current = previewReadyAt;
      }

      appendStepRunnerEvent({
        type: 'telemetry',
        timestamp: new Date().toISOString(),
        description: 'Preview verified',
        output: `url=${hostedPreviewCheckpoint.previewBaseUrl} port=${hostedPreviewCheckpoint.previewPort}`,
      });
      workbenchStore.syncHostedPreview({
        port: hostedPreviewCheckpoint.previewPort,
        baseUrl: hostedPreviewCheckpoint.previewBaseUrl,
      });
    }, [boundedChatData]);

    useEffect(() => {
      const bootstrapCommands = starterBootstrapCommandsRef.current;
      const runtimeActions = collectWorkbenchRuntimeActions();

      if (!bootstrapCommands?.startCommand || starterStartRecoveryTriggeredRef.current) {
        return;
      }

      const hasReadyPreview = previews.some((preview) => preview.ready && preview.baseUrl);

      if (hasReadyPreview) {
        starterBootstrapCommandsRef.current = null;
        starterBootstrapQueuedAtRef.current = null;
        starterStartRecoveryTriggeredRef.current = false;

        return;
      }

      if (!hasMaterializedStarterWorkspace(files)) {
        return;
      }

      const installStatus = getStarterBootstrapRuntimeActionStatus(runtimeActions, bootstrapCommands.installCommand);
      const startStatus = getStarterBootstrapRuntimeActionStatus(runtimeActions, bootstrapCommands.startCommand);
      const starterBootstrapObservationPending = shouldWaitForStarterBootstrapObservation({
        commands: bootstrapCommands,
        installStatus,
        startStatus,
        queuedAt: starterBootstrapQueuedAtRef.current,
        recoveryTriggered: starterStartRecoveryTriggeredRef.current,
      });

      if (starterBootstrapObservationPending) {
        return;
      }

      const installCompleted = bootstrapCommands.installCommand ? installStatus === 'complete' : true;
      const startInFlight = startStatus === 'pending' || startStatus === 'running';
      const startAlreadyRecovered = startStatus === 'complete';

      if (!installCompleted || startInFlight || startAlreadyRecovered) {
        return;
      }

      starterStartRecoveryTriggeredRef.current = true;

      if (bootstrapCommands.installCommand && installStatus === 'idle') {
        const recoveryId = `starter-bootstrap-recovery-${Date.now()}`;

        appendStepRunnerEvent({
          type: 'telemetry',
          timestamp: new Date().toISOString(),
          description: 'Dispatching starter runtime bootstrap recovery',
          output: [bootstrapCommands.installCommand, bootstrapCommands.startCommand].filter(Boolean).join(' | '),
        });

        void ensureStarterBootstrapRuntime({
          artifactId: recoveryId,
          messageId: recoveryId,
          title: 'Starter Runtime Recovery',
          commands: bootstrapCommands,
        })
          .then((recovered) => {
            if (!recovered) {
              starterStartRecoveryTriggeredRef.current = false;
            }
          })
          .catch((error) => {
            starterStartRecoveryTriggeredRef.current = false;
            logger.warn('starter runtime bootstrap recovery failed', error);
          });

        return;
      }

      appendStepRunnerEvent({
        type: 'telemetry',
        timestamp: new Date().toISOString(),
        description: 'Dispatching starter preview recovery',
        output: `start=${bootstrapCommands.startCommand}`,
      });

      const recoveryId = `starter-preview-recovery-${Date.now()}`;

      void workbenchStore
        .dispatchSyntheticRuntimeHandoff({
          messageId: recoveryId,
          handoffId: recoveryId,
          startCommand: bootstrapCommands.startCommand,
        })
        .catch((error) => {
          starterStartRecoveryTriggeredRef.current = false;
          logger.warn('starter preview recovery dispatch failed', error);
        });
    }, [files, previews, stepRunnerEvents]);

    useEffect(() => {
      const streaming = isLoading || fakeLoading;
      let interval: number | undefined;
      const telemetrySampleMs = hostedRuntimeEnabled ? HOSTED_TELEMETRY_SAMPLE_MS : TELEMETRY_SAMPLE_MS;
      const telemetryEmitIntervalMs = hostedRuntimeEnabled
        ? HOSTED_TELEMETRY_EMIT_INTERVAL_MS
        : TELEMETRY_EMIT_INTERVAL_MS;

      if (!streaming) {
        stallReportedRef.current = false;
        stallRecoveryTriggeredRef.current = false;
        lastTelemetryEmitAtRef.current = 0;
        previewPromptUnlockTriggeredRef.current = false;
      } else {
        interval = window.setInterval(() => {
          if (typeof document !== 'undefined' && document.hidden && hostedRuntimeEnabled) {
            return;
          }

          const stallPolicy = resolveStallPolicy(runContextRef.current.model);
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
          const recentStepEvents = workbenchStore.stepRunnerEvents.get();
          const lastMeaningfulTimestamp = getLastMeaningfulProgressTimestamp(
            recentStepEvents,
            requestLifecycleStartedAtRef.current,
            [lastMessageProgressAtRef.current, lastDataEventAtRef.current],
          );
          const meaningfulStallMs = Date.now() - lastMeaningfulTimestamp;
          const meaningfulStallSeconds = Math.round(meaningfulStallMs / 1000);
          const telemetryMessage = hostedRuntimeEnabled
            ? `server-hosted | data ${boundedChatData.length}/${MAX_CHAT_DATA_EVENTS} | messages ${messages.length} | stall ${stallSeconds}s`
            : `memory ${heapUsedMb}/${heapLimitMb} MB | data ${boundedChatData.length}/${MAX_CHAT_DATA_EVENTS} | messages ${messages.length} | stall ${stallSeconds}s`;

          const now = Date.now();

          if (now - lastTelemetryEmitAtRef.current >= telemetryEmitIntervalMs) {
            appendStepRunnerEvent({
              type: 'telemetry',
              timestamp: new Date().toISOString(),
              description: 'runtime telemetry',
              output: telemetryMessage,
            });
            lastTelemetryEmitAtRef.current = now;
          }

          const previewReadyQuietThresholdMs = hostedRuntimeEnabled ? 20000 : 12000;

          if (
            shouldUnlockPromptAfterPreviewReady(recentStepEvents, meaningfulStallMs, previewReadyQuietThresholdMs) &&
            !previewPromptUnlockTriggeredRef.current
          ) {
            previewPromptUnlockTriggeredRef.current = true;

            appendStepRunnerEvent({
              type: 'telemetry',
              timestamp: new Date().toISOString(),
              description: 'Preview verified; unlocking prompt after quiet period',
              output: `idle=${meaningfulStallSeconds}s`,
            });

            stop();
            setFakeLoading(false);

            return;
          }

          if (
            meaningfulStallMs > stallPolicy.starterContinuationThresholdMs &&
            pendingStarterContinuationRef.current &&
            !starterContinuationTriggeredRef.current
          ) {
            appendStepRunnerEvent({
              type: 'error',
              timestamp: new Date().toISOString(),
              description: 'Starter bootstrap stalled; forcing continuation',
              error: `No meaningful progress for ${meaningfulStallSeconds}s`,
            });

            stop();
            setFakeLoading(false);
            dispatchStarterContinuation('stream-stalled');

            return;
          }

          if (meaningfulStallMs > stallPolicy.warningThresholdMs && !stallReportedRef.current) {
            stallReportedRef.current = true;

            const recentEventSummary = recentStepEvents
              .slice(-6)
              .map((event) => `${event.type}${typeof event.exitCode === 'number' ? `(${event.exitCode})` : ''}`)
              .join(' -> ');

            appendStepRunnerEvent({
              type: 'error',
              timestamp: new Date().toISOString(),
              description: 'Potential stall detected',
              error: `No stream progress for ${meaningfulStallSeconds}s`,
              output: `${telemetryMessage} | recent events: ${recentEventSummary || 'n/a'}`,
            });
          }

          if (meaningfulStallMs > stallPolicy.recoveryThresholdMs && !stallRecoveryTriggeredRef.current) {
            stallRecoveryTriggeredRef.current = true;

            const activeRunContext = runContextRef.current;
            const hasRequestContext = latestUserRequestRef.current.trim().length > 0;
            const shouldAutoContinue = hasRequestContext;

            logger.error('stream stalled and auto-recovery engaged', {
              stallSeconds: meaningfulStallSeconds,
              telemetryMessage,
              hasRequestContext,
              provider: activeRunContext.providerName,
              model: activeRunContext.model,
            });

            appendStepRunnerEvent({
              type: 'error',
              timestamp: new Date().toISOString(),
              description: 'Auto-recovery triggered for stalled stream',
              error: `No stream progress for ${meaningfulStallSeconds}s`,
              output: `${telemetryMessage} | autoContinue=${shouldAutoContinue ? 'yes' : 'no'}`,
            });

            stop();
            setFakeLoading(false);

            if (shouldAutoContinue) {
              const recoveryPrompt = buildModelSelectionEnvelope({
                model: activeRunContext.model,
                providerName: activeRunContext.providerName,
                selectionReason: 'Auto-recovery resumed after stalled stream.',
                includeSelectionReason: true,
                content: `The previous run stalled after scaffold/install/start with no final response.
Continue from the current project state without re-scaffolding.
Original request:
${latestUserRequestRef.current}

Requirements:
1) Continue implementation from current files.
2) If dependencies are already installed, do not repeat installs unless required.
3) Start/verify preview and confirm it is running.
4) Start by emitting executable <boltAction> steps instead of planning prose.
5) Return a clear final response with what was completed and any remaining gaps.`,
              });

              appendStepRunnerEvent({
                type: 'telemetry',
                timestamp: new Date().toISOString(),
                description: 'Dispatching hidden continuation prompt',
                output: `provider=${activeRunContext.providerName} model=${activeRunContext.model}`,
              });

              dispatchAutoContinuation({
                idSuffix: 'stall-recovery',
                content: recoveryPrompt,
                failureDescription: 'Failed to dispatch stalled-stream continuation',
                successDescription: 'Hidden stalled-stream continuation dispatched',
              });
            }
          }
        }, telemetrySampleMs);
      }

      return () => {
        if (interval !== undefined) {
          window.clearInterval(interval);
        }
      };
    }, [
      append,
      boundedChatData.length,
      dispatchAutoContinuation,
      dispatchStarterContinuation,
      fakeLoading,
      hostedRuntimeEnabled,
      isLoading,
      messages.length,
      stop,
    ]);

    useEffect(() => {
      if (isLoading || fakeLoading) {
        return undefined;
      }

      if (!pendingStarterContinuationRef.current) {
        return undefined;
      }

      if (starterContinuationTriggeredRef.current) {
        return undefined;
      }

      let cancelled = false;

      const evaluateStarterContinuation = async () => {
        const { decideStarterContinuationPrecedence, diagnoseArchitectIssue } = await loadArchitectModule();
        const previewDiagnosis = actionAlert ? diagnoseArchitectIssue(actionAlert) : null;
        const starterContinuationDecision = decideStarterContinuationPrecedence({
          diagnosis: previewDiagnosis,
          hasPendingStarterRequest: Boolean(pendingStarterContinuationRef.current),
          starterContinuationAlreadyTriggered: starterContinuationTriggeredRef.current,
        });

        if (actionAlert?.source === 'preview' && !starterContinuationDecision.shouldDispatchStarterContinuation) {
          return;
        }

        const starterWorkspaceReady = hasMaterializedStarterWorkspace(files);
        const bootstrapCommands = starterBootstrapCommandsRef.current;
        const runtimeActions = collectWorkbenchRuntimeActions();
        const installStatus = getStarterBootstrapRuntimeActionStatus(runtimeActions, bootstrapCommands?.installCommand);
        const startStatus = getStarterBootstrapRuntimeActionStatus(runtimeActions, bootstrapCommands?.startCommand);
        const starterBootstrapObservationPending = shouldWaitForStarterBootstrapObservation({
          commands: bootstrapCommands || undefined,
          installStatus,
          startStatus,
          queuedAt: starterBootstrapQueuedAtRef.current,
          recoveryTriggered: starterStartRecoveryTriggeredRef.current,
        });
        const starterRuntimeBootstrapInFlight =
          starterBootstrapObservationPending ||
          Boolean(bootstrapCommands && shouldWaitForStarterContinuation({ installStatus, startStatus }));

        if (!starterWorkspaceReady && autoContinuationCountRef.current === 0) {
          return;
        }

        if (starterRuntimeBootstrapInFlight && autoContinuationCountRef.current === 0) {
          return;
        }

        if (cancelled) {
          return;
        }

        dispatchStarterContinuation('stream-finished');
      };

      void evaluateStarterContinuation();

      return () => {
        cancelled = true;
      };
    }, [actionAlert?.source, dispatchStarterContinuation, fakeLoading, files, isLoading, stepRunnerEvents]);

    useEffect(() => {
      if (selectionBootstrapRef.current || activeProviders.length === 0) {
        return undefined;
      }

      let cancelled = false;

      const bootstrapSelection = async () => {
        const nextApiKeys = getApiKeysFromCookiesSafe();
        setApiKeys(nextApiKeys);

        const instanceSelection =
          typeof window !== 'undefined' ? readInstanceSelection(window.location.hostname) : undefined;
        const activeProviderNames = activeProviders.map((activeProvider) => activeProvider.name);

        const credentialChecks = await Promise.all(
          activeProviderNames.map(async (providerName) => {
            if (LOCAL_PROVIDER_SET.has(providerName)) {
              return providerName;
            }

            const fromUi = nextApiKeys[providerName];

            if (typeof fromUi === 'string' && fromUi.trim().length > 0) {
              return providerName;
            }

            if (providerEnvKeyStatusRef.current[providerName] !== undefined) {
              return providerEnvKeyStatusRef.current[providerName] ? providerName : null;
            }

            try {
              const response = await fetch(`/api/check-env-key?provider=${encodeURIComponent(providerName)}`);
              const payload = (await response.json()) as { isSet?: boolean };
              const isSet = Boolean(payload?.isSet);
              providerEnvKeyStatusRef.current[providerName] = isSet;

              return isSet ? providerName : null;
            } catch {
              providerEnvKeyStatusRef.current[providerName] = false;
              return null;
            }
          }),
        );

        if (cancelled) {
          return;
        }

        const preferredProviderName = pickPreferredProviderName({
          activeProviderNames,
          apiKeys: nextApiKeys,
          configuredProviderNames: credentialChecks.filter((providerName): providerName is string =>
            Boolean(providerName),
          ),
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

        const providerModels = await fetchProviderModels(preferredProvider.name);

        if (cancelled) {
          return;
        }

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
      };

      void bootstrapSelection();

      return () => {
        cancelled = true;
      };
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

    const TEXTAREA_MAX_HEIGHT = chatStarted ? 180 : 136;

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
        const activeRunContext = runContextRef.current;
        const lastMessage = messages[messages.length - 1];

        return {
          context,
          provider: activeRunContext.providerName,
          model: activeRunContext.model,
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
      [fakeLoading, input.length, isLoading, messages],
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
          provider: diagnostics.provider,
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
          provider: diagnostics.provider,
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

        const { timeoutLike: timeoutLikeError, disconnectLike: disconnectLikeError } = classifyRecoverableStreamError(
          errorInfo.message,
        );
        const shouldIgnoreCompletedRunDisconnect =
          context === 'chat' &&
          shouldIgnoreDisconnectAfterCompletedRun({
            message: errorInfo.message,
            requestStartedAt: requestLifecycleStartedAtRef.current,
            lastRunCompletedAt: lastRunCompletedAtRef.current,
            lastPreviewReadyAt: lastPreviewReadyAtRef.current,
          });

        if (shouldIgnoreCompletedRunDisconnect) {
          logStore.logWarning('Ignoring late stream disconnect after completed run', {
            component: 'Chat',
            action: 'request',
            provider: diagnostics.provider,
            diagnostics,
            lastRunCompletedAt: lastRunCompletedAtRef.current,
            lastPreviewReadyAt: lastPreviewReadyAtRef.current,
          });

          appendStepRunnerEvent({
            type: 'telemetry',
            timestamp: new Date().toISOString(),
            description: 'Ignoring late stream disconnect after completed run',
            output: `provider=${diagnostics.provider} model=${diagnostics.model}`,
          });
          setLlmErrorAlert(undefined);
          setData([]);

          return;
        }

        let queuedAutoRecovery = false;

        if (
          context === 'chat' &&
          (timeoutLikeError || disconnectLikeError) &&
          latestUserRequestRef.current.trim().length > 0 &&
          !stallRecoveryTriggeredRef.current
        ) {
          queuedAutoRecovery = true;
          stallRecoveryTriggeredRef.current = true;

          const activeRunContext = runContextRef.current;
          const recoveryPrompt = buildModelSelectionEnvelope({
            model: activeRunContext.model,
            providerName: activeRunContext.providerName,
            selectionReason: timeoutLikeError
              ? 'The previous run timed out before completing. Continuing from current workspace state.'
              : 'The previous run disconnected before completing. Continuing from current workspace state.',
            includeSelectionReason: true,
            content: `The previous run ${timeoutLikeError ? 'timed out' : 'disconnected'} before completing.
Continue from the current project state without restarting from scratch.

Original request:
${latestUserRequestRef.current}

Requirements:
1) Do not re-scaffold if project files already exist.
2) Emit actionable <boltAction> steps (file/shell/start) that continue implementation.
3) Verify preview/runtime state after each major step.
4) Do not return plan-only prose; start with executable actions.
5) End with a concise completion summary and any remaining gaps.`,
          });

          appendStepRunnerEvent({
            type: 'telemetry',
            timestamp: new Date().toISOString(),
            description: timeoutLikeError
              ? 'Dispatching hidden continuation after timeout'
              : 'Dispatching hidden continuation after stream disconnect',
            output: `provider=${activeRunContext.providerName} model=${activeRunContext.model}`,
          });

          dispatchAutoContinuation({
            idSuffix: timeoutLikeError ? 'timeout-recovery' : 'disconnect-recovery',
            content: recoveryPrompt,
            failureDescription: timeoutLikeError
              ? 'Failed to dispatch timeout recovery continuation'
              : 'Failed to dispatch disconnect recovery continuation',
            successDescription: timeoutLikeError
              ? 'Hidden timeout continuation dispatched'
              : 'Hidden disconnect continuation dispatched',
          });
        }

        // Create API error alert
        if (queuedAutoRecovery) {
          setLlmErrorAlert(undefined);
          toast.info(
            timeoutLikeError
              ? 'The run timed out. Auto-recovery is continuing from the current workspace state.'
              : 'The stream disconnected before completion. Auto-recovery is continuing from the current workspace state.',
          );
        } else {
          setLlmErrorAlert({
            type: 'error',
            title,
            description: errorInfo.message,
            provider: diagnostics.provider,
            errorType,
          });
        }

        setData([]);
      },
      [buildChatRequestDiagnostics, dispatchAutoContinuation, stop],
    );

    const clearApiErrorAlert = useCallback(() => {
      setLlmErrorAlert(undefined);
    }, []);

    const ensureStarterBootstrapRuntime = useCallback(
      async (options: {
        artifactId: string;
        messageId: string;
        title: string;
        commands: StarterTemplateBootstrapCommands | undefined;
      }) => {
        const waitDeadline = Date.now() + 8000;

        while (Date.now() < waitDeadline) {
          if (hasMaterializedStarterWorkspace(workbenchStore.files.get())) {
            break;
          }

          await delay(100);
        }

        if (!hasMaterializedStarterWorkspace(workbenchStore.files.get())) {
          return false;
        }

        const pendingActions = selectMissingStarterBootstrapRuntimeActions(
          options.commands,
          collectWorkbenchRuntimeActions(),
        );

        if (pendingActions.length === 0) {
          return false;
        }

        appendStepRunnerEvent({
          type: 'telemetry',
          timestamp: new Date().toISOString(),
          description: 'Dispatching starter runtime bootstrap',
          output: pendingActions.map((action) => `${action.type}:${action.content}`).join(' | '),
        });

        await workbenchStore.addArtifact({
          id: options.artifactId,
          messageId: options.messageId,
          title: options.title,
          type: 'bundled',
        });

        const runtimeArtifact = workbenchStore.artifacts.get()[options.artifactId];

        if (!runtimeArtifact) {
          return false;
        }

        for (const [index, action] of pendingActions.entries()) {
          const actionData = {
            artifactId: options.artifactId,
            messageId: options.messageId,
            actionId: `${options.artifactId}-runtime-${index}`,
            action,
          };

          runtimeArtifact.runner.addAction(actionData);
          await runtimeArtifact.runner.runAction(actionData);
        }

        return true;
      },
      [],
    );

    const replaceMessagesAndReload = useCallback(
      (
        nextMessages: Message[],
        options?: {
          experimental_attachments?: Attachment[];
        },
      ) => {
        flushSync(() => {
          setMessages(nextMessages);
        });

        appendStepRunnerEvent({
          type: 'telemetry',
          timestamp: new Date().toISOString(),
          description: 'Reload scheduled',
          output: `messages=${nextMessages.length} attachments=${options?.experimental_attachments?.length || 0}`,
        });

        Promise.resolve(reload(options)).catch((reloadError) => {
          handleError(reloadError, 'chat');
        });
      },
      [handleError, reload, setMessages],
    );

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

    const hasProviderCredential = useCallback(
      async (providerName: string): Promise<boolean> => {
        if (LOCAL_PROVIDER_SET.has(providerName)) {
          return true;
        }

        const fromUi = apiKeys[providerName];

        if (typeof fromUi === 'string' && fromUi.trim().length > 0) {
          return true;
        }

        if (providerEnvKeyStatusRef.current[providerName] !== undefined) {
          return providerEnvKeyStatusRef.current[providerName];
        }

        try {
          const response = await fetch(`/api/check-env-key?provider=${encodeURIComponent(providerName)}`);
          const payload = (await response.json()) as { isSet?: boolean };
          const isSet = Boolean(payload?.isSet);

          providerEnvKeyStatusRef.current[providerName] = isSet;

          return isSet;
        } catch {
          providerEnvKeyStatusRef.current[providerName] = false;
          return false;
        }
      },
      [apiKeys],
    );

    const resolveModelSelection = useCallback(
      async (prompt: string, currentModel: string, currentProvider: ProviderInfo) => {
        try {
          const response = await fetch('/api/models');
          const data = (await response.json()) as { modelList: ModelInfo[] };
          const availableModels = data.modelList || [];
          const decision = selectModelForPrompt({
            prompt,
            currentModel,
            currentProvider,
            availableProviders: activeProviders,
            availableModels,
          });

          logStore.logProvider('Model orchestrator decision', {
            component: 'model-orchestrator',
            reason: decision.reason,
            complexity: decision.complexity,
            selectedProvider: decision.provider.name,
            selectedModel: decision.model,
            overridden: decision.overridden,
          });

          const pickProviderModel = (providerName: string, preferredModel?: string): string | undefined => {
            const providerModels = availableModels.filter((candidate) => candidate.provider === providerName);

            if (providerModels.length === 0) {
              return undefined;
            }

            const rememberedModel = getRememberedProviderModel(providerName);

            const chosen = resolvePreferredModelName({
              providerName,
              models: providerModels,
              rememberedModelName: rememberedModel,
              savedModelName: preferredModel,
            });

            return chosen || providerModels[0]?.name;
          };

          let resolvedProvider = decision.provider;
          let resolvedModel = decision.model;
          let resolvedReason = decision.reason;
          let providerConfigured = await hasProviderCredential(resolvedProvider.name);

          if (!providerConfigured) {
            const candidateProviders = Array.from(
              new Set([
                currentProvider.name,
                resolvedProvider.name,
                'OpenAI',
                'Anthropic',
                'OpenRouter',
                ...activeProviders.map((candidate) => candidate.name),
              ]),
            );

            for (const candidateProviderName of candidateProviders) {
              const candidateModel = pickProviderModel(candidateProviderName, currentModel);

              if (!candidateModel) {
                continue;
              }

              const candidateConfigured = await hasProviderCredential(candidateProviderName);

              if (!candidateConfigured) {
                continue;
              }

              resolvedProvider =
                activeProviders.find((candidate) => candidate.name === candidateProviderName) ||
                resolveProviderInfo(candidateProviderName);
              resolvedModel = candidateModel;
              resolvedReason = `Switched to configured provider ${candidateProviderName}/${candidateModel} because ${decision.provider.name} is not configured for this instance.`;
              providerConfigured = true;
              break;
            }
          }

          const selectionChanged =
            resolvedProvider.name !== currentProvider.name || resolvedModel !== currentModel || decision.overridden;

          if (selectionChanged) {
            setModel(resolvedModel);
            setProvider(resolvedProvider);
            Cookies.set('selectedModel', resolvedModel, { expires: CHAT_SELECTION_COOKIE_EXPIRY_DAYS });
            Cookies.set('selectedProvider', resolvedProvider.name, { expires: CHAT_SELECTION_COOKIE_EXPIRY_DAYS });
            rememberProviderModelSelection(resolvedProvider.name, resolvedModel);

            if (typeof window !== 'undefined') {
              rememberInstanceSelection({
                hostname: window.location.hostname,
                providerName: resolvedProvider.name,
                modelName: resolvedModel,
              });
              recordProviderHistory(resolvedProvider.name);
            }

            toast.info(`Model Orchestrator: ${resolvedProvider.name} / ${resolvedModel}`);
          }

          return {
            provider: resolvedProvider,
            model: resolvedModel,
            reason: resolvedReason,
            isProviderConfigured: providerConfigured,
          };
        } catch (error) {
          logger.warn('Model orchestrator failed, using selected model', error);
          return {
            provider: currentProvider,
            model: currentModel,
            reason: 'Model orchestrator failed; kept manual model selection.',
            isProviderConfigured: true,
          };
        }
      },
      [activeProviders, hasProviderCredential],
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
        const { SessionManager } = await loadSessionManager();
        const saved = await SessionManager.saveSession(buildSessionPayload(), activeSessionId);
        setActiveSessionId(saved.id);
        toast.success('Session saved');
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to save session');
      }
    }, [activeSessionId, buildSessionPayload]);

    const handleResumeSession = useCallback(async () => {
      try {
        const { SessionManager } = await loadSessionManager();
        const { normalizeSessionPayload, restoreConversationFromPayload } = await loadSessionPayloadModule();
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
        const { SessionManager } = await loadSessionManager();
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
        return undefined;
      }

      let cancelled = false;

      const loadSharedSession = async () => {
        try {
          const [{ SessionManager }, { normalizeSessionPayload, restoreConversationFromPayload }] = await Promise.all([
            loadSessionManager(),
            loadSessionPayloadModule(),
          ]);
          const loaded = await SessionManager.loadSessionByShareSlug(shareSlug);

          if (cancelled) {
            return;
          }

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
        } catch (error) {
          if (!cancelled) {
            toast.error(error instanceof Error ? error.message : 'Failed to load shared session');
          }
        } finally {
          if (!cancelled) {
            const next = new URLSearchParams(searchParams);
            next.delete('shareSession');
            setSearchParams(next);
          }
        }
      };

      void loadSharedSession();

      return () => {
        cancelled = true;
      };
    }, [searchParams, setMessages, setSearchParams]);

    const runAgentActWorkflow = useCallback(async () => {
      if (agentPlanSteps.length === 0) {
        toast.error('No approved plan steps available. Switch to Plan mode first.');
        return false;
      }

      try {
        const [{ executeApprovedPlanSteps }, agentFileDiffs] = await Promise.all([
          loadAgentWorkflowModule(),
          loadAgentFileDiffsModule(),
        ]);
        const {
          computeTextFileDelta,
          computeTextSnapshotRevertOps,
          formatCheckpointConfirmMessage,
          snapshotTextFiles,
        } = agentFileDiffs;
        const shell = workbenchStore.boltTerminal;
        await shell.ready();

        const baselineSnapshot = snapshotTextFiles(workbenchStore.files.get());
        const stepSnapshots = new Map<number, TextFileSnapshot>();

        let socket: WebSocket | undefined;

        try {
          const base = getCollaborationServerUrl();
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
      requestLifecycleStartedAtRef.current = Date.now();
      lastMessageProgressAtRef.current = requestLifecycleStartedAtRef.current;
      lastAssistantProgressSignatureRef.current = '';
      latestUserRequestRef.current = finalMessageContent;
      manualPromptGenerationRef.current += 1;
      lastRunCompletedAtRef.current = null;
      lastPreviewReadyAtRef.current = null;
      stallRecoveryTriggeredRef.current = false;
      starterContinuationTriggeredRef.current = false;
      starterBootstrapCommandsRef.current = null;
      starterBootstrapQueuedAtRef.current = null;
      starterStartRecoveryTriggeredRef.current = false;
      autoContinuationCountRef.current = 0;
      pendingStarterContinuationRef.current = null;
      setPendingArchitectAutoHeal(null);
      setArchitectAutoHealStatus(null);

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

      const currentAutonomyMode = workbenchStore.autonomyMode.get();

      if (
        currentAutonomyMode === 'read-only' &&
        (await loadMutatingIntentModule()).requestLikelyNeedsMutatingActions(finalMessageContent)
      ) {
        logger.warn('Read-only autonomy mode cannot satisfy mutating request', {
          messagePreview: finalMessageContent.slice(0, 180),
        });

        const shouldSwitchMode =
          typeof window !== 'undefined'
            ? window.confirm(
                [
                  'This request needs file writes and shell commands, but Autonomy is currently Read-Only.',
                  '',
                  'Switch to Safe Auto and continue now?',
                ].join('\n'),
              )
            : false;

        if (!shouldSwitchMode) {
          toast.error('Request not started. Switch Autonomy to Safe Auto or Full Auto to build/run apps.');
          return;
        }

        workbenchStore.setAutonomyMode('auto-apply-safe');
        toast.info('Autonomy switched to Safe Auto for this request.');
      }

      const selection = await resolveModelSelection(finalMessageContent, model, provider);
      const effectiveModel = selection.model;
      const effectiveProvider = selection.provider;
      const selectionReason = selection.reason;
      runContextRef.current = {
        model: effectiveModel,
        providerName: effectiveProvider.name,
      };

      if (!selection.isProviderConfigured) {
        appendStepRunnerEvent({
          type: 'error',
          timestamp: new Date().toISOString(),
          description: 'Provider preflight failed',
          error: `No usable API key found for ${effectiveProvider.name}.`,
          output: 'Configure an API key (UI or environment) or switch to a configured provider.',
        });
        toast.error(
          `The selected provider (${effectiveProvider.name}) is not configured. Add a valid key or choose another provider.`,
        );

        return;
      }

      const buildUserMessageText = (content: string) =>
        buildModelSelectionEnvelope({
          model: effectiveModel,
          providerName: effectiveProvider.name,
          selectionReason,
          content,
        });

      if (agentMode === 'plan') {
        try {
          const { generatePlanSteps } = await loadAgentWorkflowModule();
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

        const shouldBootstrapStarter = autoSelectTemplate
          ? (await loadStarterBootstrapModule()).shouldUseClientStarterBootstrap({
              providerName: effectiveProvider.name,
              modelName: effectiveModel,
              message: finalMessageContent,
              hostedRuntimeEnabled: isHostedRuntimeEnabled(),
            })
          : false;

        if (shouldBootstrapStarter) {
          logger.info('Starter template selection started', {
            model: effectiveModel,
            provider: effectiveProvider.name,
            messagePreview: finalMessageContent.slice(0, 180),
          });

          const { template, title } = await selectStarterTemplate({
            message: finalMessageContent,
            model: effectiveModel,
            provider: effectiveProvider,
          });

          logger.info('Starter template selected', {
            template,
            title,
            model: effectiveModel,
            provider: effectiveProvider.name,
          });

          if (template !== 'blank') {
            const temResp = await getTemplates(template, title, finalMessageContent).catch((e) => {
              if (e.message.includes('rate limit')) {
                toast.warning('Rate limit exceeded. Skipping starter template\n Continuing with blank template');
              } else {
                toast.warning('Failed to import starter template\n Continuing with blank template');
              }

              return null;
            });

            if (temResp) {
              const { assistantMessage, usingLocalFallback, bootstrapCommands } = temResp;
              const starterActionCount = (assistantMessage.match(/<(?:boltAction|codyAction)\b/g) || []).length;
              logger.info('Starter template import prepared', {
                template,
                starterActionCount,
                usingLocalFallback,
              });

              pendingStarterContinuationRef.current = `${temResp.userMessage.trim()}

CONTINUE IMMEDIATELY:
1) Continue from the already imported starter files and current workspace state.
2) Do not answer with a plan or explanation first.
3) Your response must begin with executable <boltAction> steps.
4) Replace any fallback placeholder UI before any final summary.
5) Keep the dev server running or restart it if needed after file changes.
6) Do not stop until the requested app is implemented and previewable.
7) End with a concise completion summary only after the app is running.`;
              starterContinuationTriggeredRef.current = false;
              starterBootstrapCommandsRef.current = bootstrapCommands || null;
              starterBootstrapQueuedAtRef.current = Date.now();
              starterStartRecoveryTriggeredRef.current = false;

              const userMessageText = buildUserMessageText(finalMessageContent);
              const attachments = await buildChatAttachments();
              const timestamp = new Date().getTime().toString();

              const nextMessages = buildStarterBootstrapMessages({
                userMessageId: `1-${timestamp}`,
                assistantMessageId: `2-${timestamp}`,
                userMessageText,
                starterAssistantMessage: assistantMessage,
                userParts: createMessageParts(userMessageText, imageDataList),
                attachments,
              });

              logger.info('Starter template chat reload triggered', {
                template,
                hasAttachments: Boolean(attachments?.length),
                messageCount: nextMessages.length,
                userRequestPreview: finalMessageContent.slice(0, 180),
              });
              logger.info('Starter continuation queued until workspace bootstrap is materialized', {
                template,
                placeholderExpected: true,
              });
              flushSync(() => {
                setMessages(nextMessages);
              });

              if (
                shouldRunImmediateStarterBootstrapRuntime({
                  commands: bootstrapCommands,
                  hostedRuntimeEnabled,
                  usingLocalFallback,
                })
              ) {
                void ensureStarterBootstrapRuntime({
                  artifactId: `${timestamp}-starter-runtime`,
                  messageId: `${timestamp}-starter-runtime`,
                  title: 'Starter Runtime Bootstrap',
                  commands: bootstrapCommands,
                }).catch((runtimeBootstrapError) => {
                  handleError(runtimeBootstrapError, 'chat');
                });
              }

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

        if (autoSelectTemplate && !shouldBootstrapStarter) {
          logger.info('Skipping client-side starter bootstrap for capable model', {
            model: effectiveModel,
            provider: effectiveProvider.name,
          });
        }

        // If autoSelectTemplate is disabled or template selection failed, proceed with normal message
        const userMessageText = buildUserMessageText(finalMessageContent);
        const attachments = await buildChatAttachments();

        const nextMessages: Message[] = [
          {
            id: `${new Date().getTime()}`,
            role: 'user',
            content: userMessageText,
            parts: createMessageParts(userMessageText, imageDataList),
            experimental_attachments: attachments,
          },
        ];
        const reloadOptions = attachments ? { experimental_attachments: attachments } : undefined;

        logger.info('Initial request reload triggered', {
          messageCount: nextMessages.length,
          hasAttachments: Boolean(attachments?.length),
          userRequestPreview: finalMessageContent.slice(0, 180),
        });
        replaceMessagesAndReload(nextMessages, reloadOptions);
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
      if (actionAlert) {
        return;
      }

      setPendingArchitectAutoHeal(null);
      setArchitectAutoHealStatus(null);
    }, [actionAlert]);

    const dispatchArchitectAutoHeal = useCallback(
      async (alert: ActionAlert, diagnosis: ArchitectDiagnosis) => {
        const { buildArchitectAutoHealPrompt, decideArchitectAutoHeal } = await loadArchitectModule();
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
          setPendingArchitectAutoHeal(null);
          setArchitectAutoHealStatus(null);

          return;
        }

        const attemptNumber = attemptsForFingerprint + 1;
        architectAttemptCountsRef.current[diagnosis.fingerprint] = attemptNumber;
        architectInFlightRef.current = true;
        setArchitectAutoHealStatus('running');
        setPendingArchitectAutoHeal(null);

        appendArchitectTimelineEvent({
          type: 'step-start',
          stepIndex: attemptNumber,
          description: `${ARCHITECT_NAME} auto-heal attempt ${attemptNumber}/${decision.maxAutoAttempts}`,
          command: ['architect', 'auto-heal', diagnosis.issueId],
        });

        workbenchStore.clearAlert();
        toast.info(`${ARCHITECT_NAME}: auto-heal attempt ${attemptNumber}/${decision.maxAutoAttempts}`);

        const architectPrompt = buildArchitectAutoHealPrompt({
          alert,
          diagnosis,
          attemptNumber,
          originalRequest: pendingStarterContinuationRef.current || latestUserRequestRef.current || undefined,
        });
        const payload = buildModelSelectionEnvelope({
          model,
          providerName: provider.name,
          selectionReason: `${ARCHITECT_NAME} auto-heal detected: ${diagnosis.title}.`,
          content: architectPrompt,
        });

        try {
          await append({
            id: `${Date.now()}-architect-auto-heal`,
            role: 'user',
            content: payload,
          });

          appendArchitectTimelineEvent({
            type: 'step-end',
            stepIndex: attemptNumber,
            description: `${ARCHITECT_NAME} auto-heal dispatched`,
            exitCode: 0,
          });
        } catch (error) {
          appendArchitectTimelineEvent({
            type: 'error',
            stepIndex: attemptNumber,
            description: `${ARCHITECT_NAME} auto-heal failed`,
            error: error instanceof Error ? error.message : 'Unknown auto-heal dispatch error',
          });
          toast.error(error instanceof Error ? error.message : `${ARCHITECT_NAME} auto-heal failed to start`);
        } finally {
          architectInFlightRef.current = false;
          setArchitectAutoHealStatus(null);
        }
      },
      [append, autonomyMode, model, provider.name],
    );

    useEffect(() => {
      if (!actionAlert || architectInFlightRef.current) {
        return undefined;
      }

      let cancelled = false;

      const evaluateArchitectAutoHeal = async () => {
        const { decideArchitectAutoHeal, decideStarterContinuationPrecedence, diagnoseArchitectIssue } =
          await loadArchitectModule();
        const diagnosis = diagnoseArchitectIssue(actionAlert);

        if (!diagnosis || cancelled) {
          return;
        }

        const alertKey = buildActionAlertKey(actionAlert);

        if (hostedRuntimeEnabled && provider.name === 'FREE') {
          appendArchitectTimelineEvent({
            type: 'telemetry',
            description: `${ARCHITECT_NAME} auto-heal skipped`,
            output: `${diagnosis.title} (${diagnosis.issueId}) is handled by hosted FREE server-side recovery.`,
          });
          setPendingArchitectAutoHeal(null);
          setArchitectAutoHealStatus(null);

          return;
        }

        const alertPromptGeneration =
          architectAlertPromptGenerationRef.current[alertKey] ?? manualPromptGenerationRef.current;
        architectAlertPromptGenerationRef.current[alertKey] = alertPromptGeneration;

        if (pendingArchitectAutoHeal?.alertKey === alertKey) {
          return;
        }

        if (alertPromptGeneration !== manualPromptGenerationRef.current) {
          appendArchitectTimelineEvent({
            type: 'telemetry',
            description: `${ARCHITECT_NAME} auto-heal skipped`,
            output: `${diagnosis.title} (${diagnosis.issueId}) was superseded by a newer user prompt.`,
          });

          return;
        }

        const starterContinuationDecision = decideStarterContinuationPrecedence({
          diagnosis,
          hasPendingStarterRequest: Boolean(pendingStarterContinuationRef.current),
          starterContinuationAlreadyTriggered: starterContinuationTriggeredRef.current,
        });

        if (starterContinuationDecision.shouldDispatchStarterContinuation) {
          appendArchitectTimelineEvent({
            type: 'telemetry',
            description: 'Starter continuation takes precedence over Architect auto-heal',
            output: `${diagnosis.title} (${diagnosis.issueId})`,
          });

          if (!isLoading) {
            starterContinuationTriggeredRef.current = false;
            dispatchStarterContinuation('stream-finished');
          }

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

        if (isLoading) {
          setPendingArchitectAutoHeal({
            alert: actionAlert,
            diagnosis,
            alertKey,
            promptGeneration: alertPromptGeneration,
          });
          setArchitectAutoHealStatus('queued');
          appendArchitectTimelineEvent({
            type: 'telemetry',
            description: `${ARCHITECT_NAME} auto-heal queued`,
            output: `${diagnosis.title} (${diagnosis.issueId})`,
          });

          return;
        }

        void dispatchArchitectAutoHeal(actionAlert, diagnosis);
      };

      void evaluateArchitectAutoHeal();

      return () => {
        cancelled = true;
      };
    }, [
      actionAlert,
      append,
      autonomyMode,
      dispatchArchitectAutoHeal,
      dispatchStarterContinuation,
      hostedRuntimeEnabled,
      isLoading,
      pendingArchitectAutoHeal,
      provider.name,
    ]);

    useEffect(() => {
      if (!pendingArchitectAutoHeal || isLoading || architectInFlightRef.current) {
        return;
      }

      if (hostedRuntimeEnabled && provider.name === 'FREE') {
        setPendingArchitectAutoHeal(null);
        setArchitectAutoHealStatus(null);

        appendArchitectTimelineEvent({
          type: 'telemetry',
          description: `${ARCHITECT_NAME} auto-heal skipped`,
          output: `${pendingArchitectAutoHeal.diagnosis.title} (${pendingArchitectAutoHeal.diagnosis.issueId}) is handled by hosted FREE server-side recovery.`,
        });

        return;
      }

      if (pendingArchitectAutoHeal.promptGeneration !== manualPromptGenerationRef.current) {
        setPendingArchitectAutoHeal(null);
        setArchitectAutoHealStatus(null);

        appendArchitectTimelineEvent({
          type: 'telemetry',
          description: `${ARCHITECT_NAME} auto-heal skipped`,
          output: `${pendingArchitectAutoHeal.diagnosis.title} (${pendingArchitectAutoHeal.diagnosis.issueId}) was superseded by a newer user prompt.`,
        });

        return;
      }

      void dispatchArchitectAutoHeal(pendingArchitectAutoHeal.alert, pendingArchitectAutoHeal.diagnosis);
    }, [dispatchArchitectAutoHeal, hostedRuntimeEnabled, isLoading, pendingArchitectAutoHeal, provider.name]);

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
        setApiKeysCookie(updatedApiKeys, CHAT_SELECTION_COOKIE_EXPIRY_DAYS);

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

    const handleProviderSelection = (newProvider: ProviderInfo, preferredModel?: string) => {
      setProvider(newProvider);
      Cookies.set('selectedProvider', newProvider.name, { expires: CHAT_SELECTION_COOKIE_EXPIRY_DAYS });

      if (typeof window !== 'undefined') {
        rememberInstanceSelection({
          hostname: window.location.hostname,
          providerName: newProvider.name,
        });
        recordProviderHistory(newProvider.name);
      }

      if (!preferredModel) {
        return;
      }

      setModel(preferredModel);
      Cookies.set('selectedModel', preferredModel, { expires: CHAT_SELECTION_COOKIE_EXPIRY_DAYS });
      rememberProviderModelSelection(newProvider.name, preferredModel);

      if (typeof window !== 'undefined') {
        rememberInstanceSelection({
          hostname: window.location.hostname,
          providerName: newProvider.name,
          modelName: preferredModel,
        });
      }
    };

    const handleProviderChange = (newProvider: ProviderInfo) => {
      handleProviderSelection(newProvider);
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
    const actionAlertAutoFixState =
      actionAlert && pendingArchitectAutoHeal?.alertKey === buildActionAlertKey(actionAlert)
        ? architectAutoHealStatus || 'queued'
        : undefined;

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
        provider={provider || (DEFAULT_PROVIDER as ProviderInfo)}
        setProvider={handleProviderChange}
        onProviderSelection={handleProviderSelection}
        providerList={activeProviders.length > 0 ? activeProviders : [DEFAULT_PROVIDER as ProviderInfo]}
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
            content: parsedMessages?.[i] ?? '',
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
        actionAlertAutoFixState={actionAlertAutoFixState}
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
