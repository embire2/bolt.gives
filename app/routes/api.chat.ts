import { type ActionFunctionArgs } from '@remix-run/cloudflare';
import { createDataStream, generateId } from 'ai';
import { MAX_RESPONSE_SEGMENTS, MAX_TOKENS, type FileMap } from '~/lib/.server/llm/constants';
import { CONTINUE_PROMPT } from '~/lib/common/prompts/prompts';
import { streamText, type Messages, type StreamingOptions } from '~/lib/.server/llm/stream-text';
import SwitchableStream from '~/lib/.server/llm/switchable-stream';
import type { IProviderSetting } from '~/types/model';
import { createScopedLogger } from '~/utils/logger';
import { getFilePaths, selectContext } from '~/lib/.server/llm/select-context';
import type {
  AgentCommentaryAnnotation,
  AgentCommentaryPhase,
  AgentRunMetricsDataEvent,
  CheckpointDataEvent,
  ContextAnnotation,
  ProjectMemoryDataEvent,
  ProgressAnnotation,
  SubAgentEvent,
  UsageDataEvent,
} from '~/types/context';
import { WORK_DIR } from '~/utils/constants';
import { createSummary } from '~/lib/.server/llm/create-summary';
import { extractPropertiesFromMessage } from '~/lib/.server/llm/utils';
import type { DesignScheme } from '~/types/design-scheme';
import { MCPService } from '~/lib/services/mcpService';
import { AgentRecoveryController } from '~/lib/.server/llm/agent-recovery';
import { StreamRecoveryManager } from '~/lib/.server/llm/stream-recovery';
import { recordAgentRunMetrics } from '~/lib/.server/llm/run-metrics';
import { deriveProjectMemoryKey, getProjectMemory, upsertProjectMemory } from '~/lib/.server/llm/project-memory';
import { analyzeRunContinuation, synthesizeRunHandoff } from '~/lib/.server/llm/run-continuation';
import { SubAgentManager, type SubAgentConfig, type SubAgentState } from '~/lib/.server/llm/sub-agent';
import { createPlannerExecutor } from '~/lib/.server/llm/sub-agent/planner-executor';
import { resolveRuntimeEnvFromContext } from '~/lib/.server/runtime-env';
import { addUsageTotals } from '~/lib/runtime/usage';
import { enforceCommentaryContract } from '~/lib/runtime/commentary-contract';
import { extractCheckpointEvents, extractExecutionFailure } from '~/lib/runtime/checkpoint-events';
import { COMMENTARY_HEARTBEAT_INTERVAL_MS, buildCommentaryHeartbeat } from '~/lib/runtime/commentary-heartbeat';
import { LLMManager } from '~/lib/modules/llm/manager';
import { hydrateApiKeysFromRuntimeEnv, mergeAndSanitizeApiKeys } from '~/lib/.server/llm/api-key-utils';
import {
  isHostedFreeRelayRequest,
  relayHostedFreeRequest,
  resolveHostedFreeRelayOrigin,
  verifyHostedFreeRelayAuthorization,
} from '~/lib/.server/llm/hosted-free-relay';
import {
  ensureLatestUserMessageSelectionEnvelope,
  resolvePreferredModelProvider,
  sanitizeSelectionWithApiKeys,
} from '~/lib/.server/llm/message-selection';
import {
  fetchHostedRuntimeSnapshotForRequest,
  waitForHostedRuntimePreviewVerificationForRequest,
} from '~/lib/.server/hosted-runtime-snapshot';
import { applyHostedRuntimeAssistantActions } from '~/lib/.server/hosted-runtime-handoff';

export async function action(args: ActionFunctionArgs) {
  return chatAction(args);
}

const logger = createScopedLogger('api.chat');
const MAX_RUN_CONTINUATION_ATTEMPTS = 5;
const LONG_THINK_MODEL_RE = /\b(gpt-5|codex|o1|o3)\b/i;

function parseBooleanEnv(value: string | undefined, defaultValue: boolean): boolean {
  if (typeof value !== 'string') {
    return defaultValue;
  }

  const normalized = value.trim().toLowerCase();

  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }

  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  return defaultValue;
}

function extractLatestUserGoal(messages: Messages): string {
  const lastUser = [...messages].reverse().find((message) => message.role === 'user');

  if (!lastUser) {
    return '';
  }

  const { content } = extractPropertiesFromMessage(lastUser);

  return content || lastUser.content || '';
}

function summarizeGoalForCommentary(goal: string | undefined): string {
  const normalized = String(goal || '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) {
    return 'your request';
  }

  return normalized.length > 96 ? `${normalized.slice(0, 93).trimEnd()}...` : normalized;
}

function withGoal(message: string, goal: string | undefined): string {
  return message.replace(/\{goal\}/g, summarizeGoalForCommentary(goal));
}

function detectManualIntervention(messages: Messages): boolean {
  const lastUser = [...messages].reverse().find((message) => message.role === 'user');

  if (!lastUser) {
    return false;
  }

  const text = (lastUser.content || '').toLowerCase();
  const hasContinueCue =
    text.includes('\ncontinue') ||
    text.includes('please continue') ||
    text.includes('go on') ||
    text.includes('resume from');

  const partIntervention =
    Array.isArray(lastUser.parts) &&
    lastUser.parts.some((part) => {
      if (part.type !== 'tool-invocation') {
        return false;
      }

      return part.toolInvocation?.state === 'result';
    });

  return hasContinueCue || partIntervention;
}

export function resolveContinuationFiles(options: {
  requestFiles?: FileMap;
  hostedRuntimeSnapshot?: FileMap | null;
}): FileMap | undefined {
  const { requestFiles, hostedRuntimeSnapshot } = options;

  if (hostedRuntimeSnapshot && Object.keys(hostedRuntimeSnapshot).length > 0) {
    return hostedRuntimeSnapshot;
  }

  return requestFiles;
}

function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};

  const items = cookieHeader.split(';').map((cookie) => cookie.trim());

  items.forEach((item) => {
    const [name, ...rest] = item.split('=');

    if (name && rest) {
      const decodedName = decodeURIComponent(name.trim());
      const decodedValue = decodeURIComponent(rest.join('=').trim());
      cookies[decodedName] = decodedValue;
    }
  });

  return cookies;
}

function parseJsonObject<T extends Record<string, any>>(raw: string | undefined, fallback: T): T {
  if (!raw) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(raw);

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return fallback;
    }

    return parsed as T;
  } catch {
    return fallback;
  }
}

async function chatAction({ context, request }: ActionFunctionArgs) {
  const requestUrl = new URL(request.url);
  const requestPayload = await request.json<{
    messages: Messages;
    files: any;
    hostedRuntimeSessionId?: string;
    promptId?: string;
    contextOptimization: boolean;
    chatMode: 'discuss' | 'build';
    designScheme?: DesignScheme;
    supabase?: {
      isConnected: boolean;
      hasSelectedProject: boolean;
      credentials?: {
        anonKey?: string;
        supabaseUrl?: string;
      };
    };
    maxLLMSteps: number;
    projectMemory?: {
      projectKey: string;
      summary: string;
      architecture: string;
      latestGoal: string;
      runCount: number;
      updatedAt: string;
    } | null;
    apiKeys?: Record<string, string>;
    providerSettings?: Record<string, IProviderSetting>;
    selectedModel?: string;
    selectedProvider?: string;
  }>();
  const {
    messages,
    files: requestFiles,
    hostedRuntimeSessionId,
    promptId,
    contextOptimization,
    supabase,
    chatMode,
    designScheme,
    maxLLMSteps,
    projectMemory,
    apiKeys: bodyApiKeys = {},
    providerSettings: bodyProviderSettings = {},
    selectedModel: selectedModelBody,
    selectedProvider: selectedProviderBody,
  } = requestPayload;

  let files = requestFiles;
  const cookieHeader = request.headers.get('Cookie');
  const parsedCookies = parseCookies(cookieHeader || '');
  const cookieApiKeys = parseJsonObject<Record<string, string>>(parsedCookies.apiKeys, {});
  const cookieProviderSettings = parseJsonObject<Record<string, IProviderSetting>>(parsedCookies.providers, {});
  const selectedModelCookie = parsedCookies.selectedModel;

  if (typeof hostedRuntimeSessionId === 'string' && hostedRuntimeSessionId.trim().length > 0) {
    try {
      const hostedRuntimeSnapshot = await fetchHostedRuntimeSnapshotForRequest({
        requestUrl: request.url,
        sessionId: hostedRuntimeSessionId,
      });

      if (hostedRuntimeSnapshot) {
        files = hostedRuntimeSnapshot;
        logger.info('Using hosted runtime snapshot as canonical chat file state', {
          hostedRuntimeSessionId,
          fileCount: Object.keys(hostedRuntimeSnapshot).length,
        });
      }
    } catch (error) {
      logger.warn('Failed to load hosted runtime snapshot for chat request', {
        hostedRuntimeSessionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const selectedProviderCookie = parsedCookies.selectedProvider;
  const selectedModel = selectedModelBody || selectedModelCookie;
  const selectedProvider = selectedProviderBody || selectedProviderCookie;
  const runtimeEnv = resolveRuntimeEnvFromContext(context);
  const llmManager = LLMManager.getInstance(runtimeEnv as any);
  const serverManagedProviderNames = llmManager
    .getAllProviders()
    .filter((provider) => provider.allowsUserApiKey === false)
    .map((provider) => provider.name);
  const providerTokenKeyByName = Object.fromEntries(
    llmManager.getAllProviders().map((provider) => [provider.name, provider.config.apiTokenKey]),
  );
  const mergedApiKeys = mergeAndSanitizeApiKeys({
    cookieApiKeys,
    bodyApiKeys,
  });
  const apiKeys = hydrateApiKeysFromRuntimeEnv({
    apiKeys: mergedApiKeys,
    runtimeEnv,
    providerTokenKeyByName,
    serverManagedProviderNames,
  });
  const hostedFreeRelayOrigin = resolveHostedFreeRelayOrigin({
    requestUrl,
    providerName: selectedProvider,
    apiKey: selectedProvider ? apiKeys[selectedProvider] : undefined,
    runtimeEnv,
  });

  if (
    isHostedFreeRelayRequest(request) &&
    !(await verifyHostedFreeRelayAuthorization({
      request,
      runtimeEnv,
      providerName: selectedProvider,
    }))
  ) {
    return new Response('Invalid hosted FREE relay credentials.', { status: 403 });
  }

  if (hostedFreeRelayOrigin) {
    return relayHostedFreeRequest({
      request,
      requestUrl,
      relayOrigin: hostedFreeRelayOrigin,
      body: requestPayload,
      runtimeEnv,
    });
  }

  const providerSettings: Record<string, IProviderSetting> = {
    ...cookieProviderSettings,
    ...bodyProviderSettings,
  };

  const stream = new SwitchableStream();

  const cumulativeUsage = {
    completionTokens: 0,
    promptTokens: 0,
    totalTokens: 0,
  };
  const requestStartedAt = Date.now();
  const runId = generateId();
  const requestDebugContext = {
    runId,
    route: requestUrl.pathname,
    messageCount: messages.length,
    latestRole: messages[messages.length - 1]?.role,
    selectedModel,
    selectedProvider,
    hasCookieApiKeys: Object.keys(cookieApiKeys).length > 0,
    hasBodyApiKeys: Object.keys(bodyApiKeys).length > 0,
    hasMergedApiKeys: Object.keys(mergedApiKeys).length > 0,
    hasResolvedApiKeys: Object.keys(apiKeys).length > 0,
    hasOpenAIEnvKey: Boolean(runtimeEnv.OPENAI_API_KEY),
    chatMode,
    maxLLMSteps,
  };
  let resolvedSelectionForLogs: {
    provider?: string;
    model?: string;
  } = {
    provider: selectedProvider,
    model: selectedModel,
  };
  const manualInterventionDetected = detectManualIntervention(messages);
  const latestUserGoal = extractLatestUserGoal(messages);
  const projectKey = deriveProjectMemoryKey(files);
  const cachedProjectMemory = getProjectMemory(projectKey);
  const effectiveProjectMemory =
    projectMemory && projectMemory.projectKey === projectKey ? projectMemory : cachedProjectMemory;
  const envVars = runtimeEnv as Record<string, string | undefined>;
  const subAgentManager = SubAgentManager.getInstance();
  const encoder: TextEncoder = new TextEncoder();
  let progressCounter: number = 1;
  let stopCommentaryHeartbeatHandle: (() => void) | null = null;
  const stopHeartbeatIfRunning = () => {
    if (typeof stopCommentaryHeartbeatHandle === 'function') {
      stopCommentaryHeartbeatHandle();
    }

    stopCommentaryHeartbeatHandle = null;
  };

  try {
    logger.info(`chat request started ${JSON.stringify(requestDebugContext)}`);

    const mcpService = MCPService.getInstance();
    const totalMessageContent = messages.reduce((acc, message) => acc + message.content, '');
    logger.debug(`Total message length: ${totalMessageContent.split(' ').length}, words`);

    let lastChunk: string | undefined = undefined;

    const dataStream = createDataStream({
      async execute(dataStream) {
        let firstCommentaryAt: number | null = null;
        let lastCommentaryPhase: AgentCommentaryPhase = 'plan';
        let commentaryHeartbeat: ReturnType<typeof setInterval> | null = null;
        let streamRecovery: StreamRecoveryManager | null = null;
        let recoveryTriggered = false;
        let recoverySucceeded = false;
        let completionEmitted = false;
        let hasExecutionFailures = false;
        let latestExecutionFailure: ReturnType<typeof extractExecutionFailure> = null;
        let previewCheckpointObserved = false;
        let lastVisibleResultForHeartbeat = '';
        let lastProgressMessageForHeartbeat = '';
        const effectiveChatMode = chatMode || 'build';

        const stopCommentaryHeartbeat = () => {
          if (commentaryHeartbeat) {
            clearInterval(commentaryHeartbeat);
            commentaryHeartbeat = null;
          }
        };
        stopCommentaryHeartbeatHandle = stopCommentaryHeartbeat;

        const markRunActivity = () => {
          streamRecovery?.updateActivity();
        };

        const beginRunMonitors = () => {
          streamRecovery?.startMonitoring();
          markRunActivity();
        };

        const writeCommentary = (
          phase: AgentCommentaryPhase,
          message: string,
          status: AgentCommentaryAnnotation['status'] = 'in-progress',
          detail?: string,
          options?: {
            usePool?: boolean;
          },
        ) => {
          if (firstCommentaryAt === null) {
            firstCommentaryAt = Date.now();
          }

          lastCommentaryPhase = phase;

          const order = progressCounter++;
          const fallbackMessage = message || 'I am still working and will post another update shortly.';
          const effectiveMessage = options?.usePool === true ? fallbackMessage : fallbackMessage;

          const contracted = enforceCommentaryContract({
            phase,
            message: effectiveMessage,
            detail,
          });
          const keyChanges = contracted.detail.match(/Key changes:\s*([\s\S]*?)(?=\nNext:|$)/i)?.[1]?.trim();
          const nextStep = contracted.detail.match(/Next:\s*([\s\S]*?)$/i)?.[1]?.trim();

          const payload: AgentCommentaryAnnotation = {
            type: 'agent-commentary',
            phase,
            status,
            order,
            message: contracted.message,
            timestamp: new Date().toISOString(),
            detail: contracted.detail,
          };

          if (keyChanges) {
            lastVisibleResultForHeartbeat = keyChanges;
          } else {
            lastVisibleResultForHeartbeat = contracted.message;
          }

          if (nextStep) {
            lastProgressMessageForHeartbeat = nextStep;
          }

          dataStream.writeData({
            ...payload,
          });
        };

        const startCommentaryHeartbeat = () => {
          if (commentaryHeartbeat) {
            return;
          }

          commentaryHeartbeat = setInterval(() => {
            const heartbeat = buildCommentaryHeartbeat(Date.now() - requestStartedAt, lastCommentaryPhase, {
              goal: latestUserGoal,
              currentStep: lastProgressMessageForHeartbeat,
              lastVisibleResult: lastVisibleResultForHeartbeat,
            });
            writeCommentary(heartbeat.phase, heartbeat.message, 'in-progress', heartbeat.detail, { usePool: true });
          }, COMMENTARY_HEARTBEAT_INTERVAL_MS);
        };

        const recoveryController = new AgentRecoveryController();
        let pendingRecoveryReason: string | undefined = undefined;
        let pendingRecoveryBackoffMs = 0;
        let forceFinalizeRequested = false;

        const emitRunCompletionEvents = (finalAssistantText: string, model: string, provider: string) => {
          if (completionEmitted) {
            return;
          }

          stopCommentaryHeartbeat();
          completionEmitted = true;

          const commentaryFirstEventLatencyMs =
            firstCommentaryAt === null ? null : firstCommentaryAt - requestStartedAt;
          const projectMemoryEntry = upsertProjectMemory({
            projectKey,
            files,
            latestGoal: latestUserGoal,
            summary: summary || finalAssistantText,
          });
          const aggregate = recordAgentRunMetrics({
            runId,
            provider,
            model,
            commentaryFirstEventLatencyMs,
            recoveryTriggered,
            recoverySucceeded,
            manualIntervention: manualInterventionDetected,
            timestamp: new Date().toISOString(),
          });

          const usageDataEvent: UsageDataEvent = {
            type: 'usage',
            completionTokens: cumulativeUsage.completionTokens,
            promptTokens: cumulativeUsage.promptTokens,
            totalTokens: cumulativeUsage.totalTokens,
            timestamp: new Date().toISOString(),
          };
          const runMetricsEvent: AgentRunMetricsDataEvent = {
            type: 'run-metrics',
            runId,
            provider,
            model,
            commentaryFirstEventLatencyMs,
            recoveryTriggered,
            recoverySucceeded,
            manualIntervention: manualInterventionDetected,
            timestamp: new Date().toISOString(),
            aggregate,
          };
          const projectMemoryEvent: ProjectMemoryDataEvent = {
            type: 'project-memory',
            projectKey: projectMemoryEntry.projectKey,
            summary: projectMemoryEntry.summary,
            architecture: projectMemoryEntry.architecture,
            latestGoal: projectMemoryEntry.latestGoal,
            runCount: projectMemoryEntry.runCount,
            updatedAt: projectMemoryEntry.updatedAt,
          };

          dataStream.writeData({ ...usageDataEvent });
          dataStream.writeMessageAnnotation({
            type: 'usage',
            value: {
              completionTokens: cumulativeUsage.completionTokens,
              promptTokens: cumulativeUsage.promptTokens,
              totalTokens: cumulativeUsage.totalTokens,
            },
          });
          dataStream.writeData({ ...runMetricsEvent });
          dataStream.writeData({ ...projectMemoryEvent });

          const responseMessage =
            effectiveChatMode === 'build' && !previewCheckpointObserved && !hasExecutionFailures
              ? 'Response Generated (preview not yet verified)'
              : hasExecutionFailures
                ? 'Response Generated (with execution failures)'
                : 'Response Generated';
          dataStream.writeData({
            type: 'progress',
            label: 'response',
            status: 'complete',
            order: progressCounter++,
            message: responseMessage,
          } satisfies ProgressAnnotation);
        };

        const emitFinalNextStepCommentary = () => {
          if (hasExecutionFailures && latestExecutionFailure) {
            writeCommentary(
              'next-step',
              'Work finished, but one step still needs attention.',
              'warning',
              `Key changes: A previous step did not finish successfully.
Next: I am returning clear recovery instructions to help you resolve it quickly.`,
            );

            return;
          }

          if (effectiveChatMode === 'build' && !previewCheckpointObserved) {
            writeCommentary(
              'next-step',
              'Preview startup is still being verified.',
              'warning',
              `Key changes: Code generation completed, but the hosted preview has not emitted a verified ready checkpoint yet.
Next: Keep the Workspace open while the preview retries and switches to the generated app.`,
            );

            return;
          }

          writeCommentary('next-step', 'Final response generated and ready for delivery.', 'complete');
        };

        const longThinkSelection = resolvedSelectionForLogs.model || selectedModel || '';
        const defaultStreamTimeoutMs = LONG_THINK_MODEL_RE.test(longThinkSelection) ? 300000 : 180000;
        const configuredStreamTimeoutMs = Number(
          envVars?.BOLT_STREAM_TIMEOUT_MS || process?.env?.BOLT_STREAM_TIMEOUT_MS || defaultStreamTimeoutMs,
        );
        const configuredStreamMaxRetries = Number(
          envVars?.BOLT_STREAM_RECOVERY_MAX_RETRIES || process?.env?.BOLT_STREAM_RECOVERY_MAX_RETRIES || 2,
        );
        const streamTimeoutMs =
          Number.isFinite(configuredStreamTimeoutMs) && configuredStreamTimeoutMs >= 30000
            ? configuredStreamTimeoutMs
            : 180000;
        const streamMaxRetries =
          Number.isFinite(configuredStreamMaxRetries) && configuredStreamMaxRetries >= 0
            ? configuredStreamMaxRetries
            : 2;

        let activeStreamAbortController: AbortController | null = null;
        const createStreamAbortSignal = () => {
          activeStreamAbortController = new AbortController();
          return activeStreamAbortController.signal;
        };
        const stopRunMonitors = () => {
          streamRecovery?.stop();
          stopCommentaryHeartbeat();
          activeStreamAbortController = null;
        };
        streamRecovery = new StreamRecoveryManager({
          timeout: streamTimeoutMs,
          maxRetries: streamMaxRetries,
          onTimeout: () => {
            const signal = recoveryController.registerTimeout();
            pendingRecoveryReason = pendingRecoveryReason || signal.reason;
            pendingRecoveryBackoffMs = Math.max(pendingRecoveryBackoffMs, signal.backoffMs);
            forceFinalizeRequested = forceFinalizeRequested || signal.forceFinalize;
            recoveryTriggered = true;
            writeCommentary('recovery', signal.message, 'warning', signal.detail);
            logger.warn('Stream timeout - attempting recovery');

            if (activeStreamAbortController && !activeStreamAbortController.signal.aborted) {
              activeStreamAbortController.abort(
                new Error(`BOLT_STREAM_TIMEOUT: no stream activity for ${streamTimeoutMs}ms`),
              );
            }
          },
        });

        const filePaths = getFilePaths(files || {});
        let filteredFiles: FileMap | undefined = undefined;
        let summary: string | undefined = undefined;
        let messageSliceId = 0;
        const processedMessages = await mcpService.processToolInvocations(messages, dataStream);
        const preferredSelection = resolvePreferredModelProvider(processedMessages, selectedModel, selectedProvider);
        const sanitizedSelection = sanitizeSelectionWithApiKeys({
          selection: preferredSelection,
          apiKeys,
          selectedProviderCookie: selectedProvider,
        });
        resolvedSelectionForLogs = {
          provider: sanitizedSelection.provider,
          model: sanitizedSelection.model,
        };
        ensureLatestUserMessageSelectionEnvelope(processedMessages, sanitizedSelection);

        const collectedToolOutputs: string[] = [];
        let forceFinalizeAttempted = false;
        let runContinuationAttempts = 0;

        writeCommentary(
          'plan',
          withGoal('I am reviewing {goal} and mapping out the first concrete steps.', latestUserGoal),
        );
        startCommentaryHeartbeat();

        if (processedMessages.length > 3) {
          messageSliceId = processedMessages.length - 3;
        }

        if (filePaths.length > 0 && contextOptimization) {
          logger.debug('Generating Chat Summary');
          writeCommentary(
            'plan',
            withGoal(
              'I am quickly summarizing the recent context for {goal} so the implementation stays on track.',
              latestUserGoal,
            ),
          );
          dataStream.writeData({
            type: 'progress',
            label: 'summary',
            status: 'in-progress',
            order: progressCounter++,
            message: 'Analysing Request',
          } satisfies ProgressAnnotation);
          lastProgressMessageForHeartbeat = 'Summarising the recent context and existing files.';

          // Create a summary of the chat
          console.log(`Messages count: ${processedMessages.length}`);

          summary = await createSummary({
            messages: [...processedMessages],
            env: runtimeEnv as any,
            apiKeys,
            providerSettings,
            promptId,
            contextOptimization,
            onFinish(resp) {
              if (resp.usage) {
                logger.debug('createSummary token usage', JSON.stringify(resp.usage));
                addUsageTotals(cumulativeUsage, resp.usage as any);
              }
            },
          });
          dataStream.writeData({
            type: 'progress',
            label: 'summary',
            status: 'complete',
            order: progressCounter++,
            message: 'Analysis Complete',
          } satisfies ProgressAnnotation);
          lastVisibleResultForHeartbeat = 'Context summary completed successfully.';

          dataStream.writeMessageAnnotation({
            type: 'chatSummary',
            summary,
            chatId: processedMessages.slice(-1)?.[0]?.id,
          } as ContextAnnotation);

          // Update context buffer
          logger.debug('Updating Context Buffer');
          writeCommentary('plan', withGoal('I am selecting the files that matter for {goal}.', latestUserGoal));
          dataStream.writeData({
            type: 'progress',
            label: 'context',
            status: 'in-progress',
            order: progressCounter++,
            message: 'Determining Files to Read',
          } satisfies ProgressAnnotation);
          lastProgressMessageForHeartbeat = 'Selecting the files and folders that matter for this task.';

          // Select context files
          console.log(`Messages count: ${processedMessages.length}`);
          filteredFiles = await selectContext({
            messages: [...processedMessages],
            env: runtimeEnv as any,
            apiKeys,
            files,
            providerSettings,
            promptId,
            contextOptimization,
            summary,
            onFinish(resp) {
              if (resp.usage) {
                logger.debug('selectContext token usage', JSON.stringify(resp.usage));
                addUsageTotals(cumulativeUsage, resp.usage as any);
              }
            },
          });

          if (filteredFiles) {
            logger.debug(`files in context : ${JSON.stringify(Object.keys(filteredFiles))}`);
          }

          dataStream.writeMessageAnnotation({
            type: 'codeContext',
            files: Object.keys(filteredFiles).map((key) => {
              let path = key;

              if (path.startsWith(WORK_DIR)) {
                path = path.replace(WORK_DIR, '');
              }

              return path;
            }),
          } as ContextAnnotation);

          dataStream.writeData({
            type: 'progress',
            label: 'context',
            status: 'complete',
            order: progressCounter++,
            message: 'Code Files Selected',
          } satisfies ProgressAnnotation);
          lastVisibleResultForHeartbeat = 'Relevant files were selected for execution.';

          // logger.debug('Code Files Selected');
        }

        let subAgentPlan: string | undefined = undefined;
        let plannerAgentId: string | undefined = undefined;

        if (effectiveChatMode === 'build') {
          writeCommentary(
            'plan',
            withGoal('I am drafting a clear build plan for {goal} before I touch the code.', latestUserGoal),
          );

          const latestPlannerSourceMessage = [...processedMessages]
            .reverse()
            .find((message) => message.role === 'user');

          const plannerSelection = latestPlannerSourceMessage
            ? extractPropertiesFromMessage(latestPlannerSourceMessage)
            : undefined;
          const plannerModel = plannerSelection?.model;
          const plannerProvider = plannerSelection?.provider;
          const plannerFeatureEnabled = parseBooleanEnv(
            envVars?.BOLT_PLANNER_SUBAGENT_ENABLED || process?.env?.BOLT_PLANNER_SUBAGENT_ENABLED,
            true,
          );
          const plannerAllowedForLongThink = parseBooleanEnv(
            envVars?.BOLT_PLANNER_LONG_THINK_ENABLED || process?.env?.BOLT_PLANNER_LONG_THINK_ENABLED,
            false,
          );
          const effectivePlannerModel = plannerModel || selectedModel || '';
          const effectivePlannerProvider = plannerProvider || selectedProvider || '';
          const isLongThinkModel = LONG_THINK_MODEL_RE.test(effectivePlannerModel);
          const shouldSkipPlannerForHostedFree = effectivePlannerProvider === 'FREE';
          const shouldRunPlanner =
            plannerFeatureEnabled &&
            !shouldSkipPlannerForHostedFree &&
            (plannerAllowedForLongThink || !isLongThinkModel);

          if (!shouldRunPlanner) {
            const reason = !plannerFeatureEnabled
              ? 'disabled by configuration'
              : shouldSkipPlannerForHostedFree
                ? 'skipped for the hosted FREE provider to reduce stall risk and start coding immediately'
                : `skipped for ${effectivePlannerModel || 'current model'} to reduce stall risk`;
            writeCommentary(
              'plan',
              'I am skipping the planning helper and moving directly into executable steps.',
              'in-progress',
              `Key changes: Planner sub-agent ${reason}.
Next: I will execute actions directly for faster progress.`,
            );
          }

          const getPlannerParams = async (_messages: Messages, _config: SubAgentConfig) => ({
            env: runtimeEnv as any,
            options: {
              maxSteps: 1,
              tools: {},
              toolChoice: undefined,
            } as StreamingOptions,
            apiKeys,
            files,
            providerSettings,
            promptId,
            contextOptimization,
            contextFiles: filteredFiles,
            summary,
            messageSliceId,
            chatMode: 'discuss',
            designScheme,
            projectMemory: effectiveProjectMemory || undefined,
          });

          if (shouldRunPlanner) {
            const plannerExecutor = createPlannerExecutor(getPlannerParams);
            subAgentManager.registerExecutor('planner', plannerExecutor);

            try {
              plannerAgentId = await subAgentManager.spawn(undefined, {
                type: 'planner',
                model: plannerModel,
                provider: plannerProvider,
              });

              const onProgress = (state: SubAgentState, _output: string) => {
                if (state === 'planning') {
                  writeCommentary('plan', withGoal('I am breaking {goal} into practical build steps.', latestUserGoal));
                } else if (state === 'executing') {
                  writeCommentary(
                    'plan',
                    withGoal('I am finalizing the plan for {goal} and preparing to execute it.', latestUserGoal),
                  );
                }
              };

              const plannerResult = await subAgentManager.start(plannerAgentId, processedMessages, onProgress);

              if (plannerResult.metadata.tokenUsage) {
                addUsageTotals(cumulativeUsage, plannerResult.metadata.tokenUsage);
              }

              if (plannerResult.success && plannerResult.output) {
                subAgentPlan = plannerResult.output;

                const subAgentEvent: SubAgentEvent = {
                  type: 'sub-agent',
                  agentId: plannerResult.metadata.id,
                  agentType: plannerResult.metadata.type,
                  state: plannerResult.metadata.state,
                  model: plannerResult.metadata.model,
                  provider: plannerResult.metadata.provider,
                  plan: plannerResult.metadata.plan,
                  createdAt: plannerResult.metadata.createdAt,
                  startedAt: plannerResult.metadata.startedAt,
                  completedAt: plannerResult.metadata.completedAt,
                  tokenUsage: plannerResult.metadata.tokenUsage,
                };

                dataStream.writeData(subAgentEvent);

                writeCommentary(
                  'plan',
                  withGoal('Planning is complete. I am moving into execution for {goal} now.', latestUserGoal),
                  'complete',
                  subAgentPlan.slice(0, 260),
                );
              }
            } catch {
              writeCommentary(
                'recovery',
                'Planning helper had an issue, so I am continuing directly.',
                'warning',
                `Key changes: The planning helper could not complete this step, so I switched to direct execution.
Next: I am continuing with the main coding flow and will keep you updated.`,
              );
            }
          }
        }

        const options: StreamingOptions = {
          supabaseConnection: supabase,
          toolChoice: 'auto',
          tools: mcpService.toolsWithoutExecute,
          maxSteps: maxLLMSteps,
          onChunk: () => {
            markRunActivity();
          },
          onError: ({ error }) => {
            logger.error('Streaming error:', error);
          },
          onStepFinish: ({ toolCalls, toolResults }) => {
            markRunActivity();

            // add tool call annotations for frontend processing
            toolCalls.forEach((toolCall) => {
              mcpService.processToolCall(toolCall, dataStream);
            });

            const normalizedToolResults = (toolResults as Array<Record<string, unknown>> | undefined) ?? [];

            if (toolCalls.length > 0 || (toolResults?.length ?? 0) > 0) {
              const toolNames = toolCalls.map((call) => call.toolName).join(', ');
              writeCommentary(
                'verification',
                toolNames
                  ? `I finished ${toolNames} and I am checking the result before continuing.`
                  : 'I finished a step and I am checking the result before continuing.',
                'in-progress',
                toolNames
                  ? `Key changes: Finished actions (${toolNames}) and collected ${(toolResults?.length ?? 0).toString()} updates.
Next: I am confirming everything still works before the next step.`
                  : `Key changes: Finished one step and collected ${(toolResults?.length ?? 0).toString()} updates.
Next: I am confirming everything still works before moving on.`,
              );
            }

            const checkpointEvents = extractCheckpointEvents({
              toolCalls: toolCalls as Array<{ toolName?: string; toolCallId?: string; args?: unknown }>,
              toolResults: normalizedToolResults as Array<{
                toolName?: string;
                toolCallId?: string;
                result?: unknown;
              }>,
            });

            checkpointEvents.forEach((event) => dataStream.writeData({ ...(event as CheckpointDataEvent) }));
            previewCheckpointObserved =
              previewCheckpointObserved ||
              checkpointEvents.some((event) => event.checkpointType === 'preview-ready' && event.status === 'complete');

            const executionFailure = extractExecutionFailure({
              toolCalls: toolCalls as Array<{ toolName?: string; toolCallId?: string; args?: unknown }>,
              toolResults: normalizedToolResults as Array<{
                toolName?: string;
                toolCallId?: string;
                result?: unknown;
              }>,
            });

            if (executionFailure) {
              hasExecutionFailures = true;
              latestExecutionFailure = executionFailure;
              recoveryTriggered = true;
              writeCommentary(
                'recovery',
                'A step failed. I am checking it now and applying a fix automatically.',
                'warning',
                `Key changes: One of the recent actions did not succeed.
Next: I will recover and continue from the latest stable point.`,
              );
            }

            const recoverySignal = recoveryController.analyzeStep(
              toolCalls.map((call) => ({ toolName: call.toolName, args: call.args })),
              normalizedToolResults.length,
            );

            if (recoverySignal) {
              pendingRecoveryReason = pendingRecoveryReason || recoverySignal.reason;
              pendingRecoveryBackoffMs = Math.max(pendingRecoveryBackoffMs, recoverySignal.backoffMs);
              forceFinalizeRequested = forceFinalizeRequested || recoverySignal.forceFinalize;
              recoveryTriggered = true;
              writeCommentary('recovery', recoverySignal.message, 'warning', recoverySignal.detail);
            }

            if (normalizedToolResults.length) {
              for (const toolResult of normalizedToolResults) {
                collectedToolOutputs.push(
                  JSON.stringify({
                    toolName: toolResult.toolName,
                    toolCallId: toolResult.toolCallId,
                    result: toolResult.result,
                  }),
                );
              }
            }
          },
          onFinish: async ({ text: content, finishReason, usage }) => {
            logger.debug('usage', JSON.stringify(usage));

            if (usage) {
              addUsageTotals(cumulativeUsage, usage as any);
            }

            const lastUserMessage = processedMessages.filter((x) => x.role == 'user').slice(-1)[0];

            if (!lastUserMessage) {
              logger.warn('No user message found when finalizing chat');
              return;
            }

            const extractedLastUser = extractPropertiesFromMessage(lastUserMessage);
            const { model, provider } = extractedLastUser;
            const lastUserContent =
              typeof extractedLastUser.content === 'string'
                ? extractedLastUser.content
                : JSON.stringify(extractedLastUser.content);
            const shouldForceFinalize = finishReason === 'tool-calls' || forceFinalizeRequested;

            if (shouldForceFinalize && !forceFinalizeAttempted) {
              forceFinalizeAttempted = true;

              if (pendingRecoveryBackoffMs > 0) {
                writeCommentary(
                  'recovery',
                  'I am taking a short recovery pause before the next step.',
                  'warning',
                  `Key changes: A quick safety pause is in progress.
Next: I will continue automatically right after this pause.`,
                );
                await new Promise((resolve) => setTimeout(resolve, pendingRecoveryBackoffMs));
              }

              writeCommentary(
                'next-step',
                pendingRecoveryReason
                  ? withGoal('Recovery is complete. I am preparing the final result for {goal} now.', latestUserGoal)
                  : withGoal('Execution is complete. I am preparing the final result for {goal} now.', latestUserGoal),
                pendingRecoveryReason ? 'recovered' : 'in-progress',
              );

              const toolSummary =
                collectedToolOutputs.length > 0
                  ? collectedToolOutputs.slice(-6).join('\n')
                  : '(no tool results captured)';

              processedMessages.push({ id: generateId(), role: 'assistant', content });
              processedMessages.push({
                id: generateId(),
                role: 'user',
                content: `[Model: ${model}]

[Provider: ${provider}]

You already gathered tool outputs. Now provide the final answer without any more tool calls.
If the user asked for a markdown file, create it using <boltAction type="file">.
${pendingRecoveryReason ? `Recovery reason: ${pendingRecoveryReason}. Summarize progress and continue.` : ''}

Tool outputs:
${toolSummary}`,
              });

              const finalizeOptions: StreamingOptions = {
                ...options,
                maxSteps: 1,
                tools: {},
                toolChoice: undefined,
                onStepFinish: undefined,
                onFinish: ({ text: finalContent, usage: finalizeUsage }) => {
                  if (finalizeUsage) {
                    addUsageTotals(cumulativeUsage, finalizeUsage as any);
                  }

                  if (pendingRecoveryReason) {
                    recoverySucceeded = true;
                    writeCommentary(
                      'recovery',
                      'Recovery finished successfully.',
                      'recovered',
                      `Key changes: Recovery completed and the workflow is stable again.
Next: I am sending the final result now.`,
                    );
                    pendingRecoveryReason = undefined;
                    pendingRecoveryBackoffMs = 0;
                    forceFinalizeRequested = false;
                  }

                  emitFinalNextStepCommentary();

                  stopRunMonitors();
                  emitRunCompletionEvents(finalContent, model, provider);
                },
              };

              beginRunMonitors();

              const result = await streamText({
                messages: [...processedMessages],
                env: runtimeEnv as any,
                options: {
                  ...finalizeOptions,
                  abortSignal: createStreamAbortSignal(),
                },
                apiKeys,
                files,
                providerSettings,
                promptId,
                contextOptimization,
                contextFiles: filteredFiles,
                summary,
                messageSliceId,
                chatMode,
                designScheme,
                projectMemory: effectiveProjectMemory || undefined,
                subAgentPlan,
              });

              markRunActivity();
              result.mergeIntoDataStream(dataStream);

              return;
            }

            const hostedRuntimeSnapshot =
              effectiveChatMode === 'build' &&
              typeof hostedRuntimeSessionId === 'string' &&
              hostedRuntimeSessionId.trim().length > 0
                ? await fetchHostedRuntimeSnapshotForRequest({
                    requestUrl: request.url,
                    sessionId: hostedRuntimeSessionId,
                  }).catch(() => null)
                : null;
            const continuationFiles = resolveContinuationFiles({
              requestFiles: files,
              hostedRuntimeSnapshot,
            });

            const runContinuationDecision = analyzeRunContinuation({
              chatMode: chatMode || 'build',
              lastUserContent,
              assistantContent: content,
              alreadyAttempted: runContinuationAttempts >= MAX_RUN_CONTINUATION_ATTEMPTS,
              currentFiles: continuationFiles,
            });
            logger.info(
              `run continuation analysis ${JSON.stringify({
                runId,
                provider,
                model,
                reason: runContinuationDecision.reason,
                shouldContinue: runContinuationDecision.shouldContinue,
                attempt: runContinuationAttempts,
                maxAttempts: MAX_RUN_CONTINUATION_ATTEMPTS,
                previewCheckpointObserved,
                hasExecutionFailures,
                starterEntryFilePath: runContinuationDecision.starterEntryFilePath || null,
                continuationFileSource:
                  hostedRuntimeSnapshot && Object.keys(hostedRuntimeSnapshot).length > 0 ? 'hosted-runtime' : 'request',
              })}`,
            );

            const shouldContinueForRunIntent = runContinuationDecision.shouldContinue;
            const shouldContinueForUnverifiedPreview =
              effectiveChatMode === 'build' &&
              !previewCheckpointObserved &&
              !hasExecutionFailures &&
              runContinuationAttempts < MAX_RUN_CONTINUATION_ATTEMPTS;

            if (shouldContinueForRunIntent || shouldContinueForUnverifiedPreview) {
              const continuationReason = shouldContinueForRunIntent
                ? runContinuationDecision.reason
                : 'preview-not-verified';
              const starterEntryTarget =
                runContinuationDecision.starterEntryFilePath || 'src/App.tsx or the active entry UI file';
              const synthesizedRunHandoff = await synthesizeRunHandoff({
                assistantContent: content,
                currentFiles: continuationFiles,
              });

              if (
                synthesizedRunHandoff &&
                (continuationReason === 'run-intent-without-start' ||
                  continuationReason === 'preview-not-verified' ||
                  continuationReason === 'bootstrap-only-shell-actions')
              ) {
                if (typeof hostedRuntimeSessionId === 'string' && hostedRuntimeSessionId.trim().length > 0) {
                  try {
                    const hostedHandoffResult = await applyHostedRuntimeAssistantActions({
                      requestUrl: request.url,
                      sessionId: hostedRuntimeSessionId,
                      assistantContent: content,
                      synthesizedRunHandoff,
                    });

                    if (hostedHandoffResult) {
                      writeCommentary(
                        'action',
                        synthesizedRunHandoff.followupMessage,
                        'in-progress',
                        `Key changes: The server applied ${hostedHandoffResult.appliedFilePaths.length.toString()} file update${hostedHandoffResult.appliedFilePaths.length === 1 ? '' : 's'} and replayed the workspace commands directly.
Next: I am waiting for the hosted preview to confirm the updated app is running.`,
                      );
                      logger.info(
                        `run continuation applied on hosted runtime ${JSON.stringify({
                          runId,
                          reason: continuationReason,
                          provider,
                          model,
                          hostedRuntimeSessionId,
                          appliedFilePaths: hostedHandoffResult.appliedFilePaths,
                          setupExitCode: hostedHandoffResult.setup?.exitCode ?? null,
                          startExitCode: hostedHandoffResult.start.exitCode,
                          previewBaseUrl: hostedHandoffResult.start.previewBaseUrl,
                        })}`,
                      );

                      const hostedPreviewVerificationTimeoutMs = Number(
                        envVars?.BOLT_HOSTED_PREVIEW_VERIFY_TIMEOUT_MS ||
                          process?.env?.BOLT_HOSTED_PREVIEW_VERIFY_TIMEOUT_MS ||
                          60_000,
                      );
                      const hostedPreviewVerificationPollIntervalMs = Number(
                        envVars?.BOLT_HOSTED_PREVIEW_VERIFY_POLL_INTERVAL_MS ||
                          process?.env?.BOLT_HOSTED_PREVIEW_VERIFY_POLL_INTERVAL_MS ||
                          1_000,
                      );
                      let lastHostedPreviewVerificationCommentaryAt = 0;
                      let lastHostedPreviewVerificationStatus = '';
                      const hostedPreviewVerification = await waitForHostedRuntimePreviewVerificationForRequest({
                        requestUrl: request.url,
                        sessionId: hostedRuntimeSessionId,
                        timeoutMs:
                          Number.isFinite(hostedPreviewVerificationTimeoutMs) && hostedPreviewVerificationTimeoutMs > 0
                            ? hostedPreviewVerificationTimeoutMs
                            : 60_000,
                        pollIntervalMs:
                          Number.isFinite(hostedPreviewVerificationPollIntervalMs) &&
                          hostedPreviewVerificationPollIntervalMs >= 0
                            ? hostedPreviewVerificationPollIntervalMs
                            : 1_000,
                        onPoll: async (status, elapsedMs) => {
                          const nextStatus = status?.status || 'starting';
                          const shouldEmitCommentary =
                            nextStatus !== lastHostedPreviewVerificationStatus ||
                            elapsedMs - lastHostedPreviewVerificationCommentaryAt >= 5_000;

                          if (!shouldEmitCommentary) {
                            return;
                          }

                          lastHostedPreviewVerificationStatus = nextStatus;
                          lastHostedPreviewVerificationCommentaryAt = elapsedMs;

                          const elapsedSeconds = Math.max(1, Math.round(elapsedMs / 1000));
                          const previewBaseUrl =
                            status?.preview?.baseUrl ||
                            hostedHandoffResult.start.previewBaseUrl ||
                            'the hosted preview';
                          const progressMessage =
                            nextStatus === 'ready'
                              ? `Key changes: The runtime reports the preview as ready at ${previewBaseUrl}.
Next: I am syncing the workspace and confirming the browser switches from the starter shell to the generated app.`
                              : nextStatus === 'error'
                                ? `Key changes: The preview reported an error while starting.
Next: I am checking the recent preview output and will retry automatically if it is transient.`
                                : `Key changes: The runtime is still warming the preview (${elapsedSeconds}s elapsed).
Next: I am waiting for the hosted browser preview to switch from the starter shell to the generated app.`;

                          writeCommentary(
                            'verification',
                            nextStatus === 'ready'
                              ? 'Hosted preview is up. I am confirming the generated app is visible.'
                              : nextStatus === 'error'
                                ? 'Hosted preview reported a startup problem. I am checking it now.'
                                : 'Hosted preview is still starting. I am waiting for the generated app to appear.',
                            nextStatus === 'error' ? 'warning' : 'in-progress',
                            progressMessage,
                          );
                        },
                      });

                      logger.info(
                        `hosted runtime preview verification ${JSON.stringify({
                          runId,
                          provider,
                          model,
                          hostedRuntimeSessionId,
                          outcome: hostedPreviewVerification.outcome,
                          status: hostedPreviewVerification.status?.status ?? null,
                          healthy: hostedPreviewVerification.status?.healthy ?? null,
                          previewBaseUrl:
                            hostedPreviewVerification.status?.preview?.baseUrl ??
                            hostedHandoffResult.start.previewBaseUrl ??
                            null,
                          recoveryState: hostedPreviewVerification.status?.recovery?.state ?? null,
                        })}`,
                      );

                      if (hostedPreviewVerification.outcome === 'ready') {
                        previewCheckpointObserved = true;
                        dataStream.writeData({
                          type: 'checkpoint',
                          checkpointType: 'preview-ready',
                          status: 'complete',
                          message: 'Preview ready and verified.',
                          timestamp: new Date().toISOString(),
                          command: synthesizedRunHandoff.startCommand,
                          exitCode: hostedHandoffResult.start.exitCode,
                        } satisfies CheckpointDataEvent);
                        writeCommentary(
                          'verification',
                          'Hosted preview verified successfully.',
                          'complete',
                          `Key changes: The updated app responded successfully at ${
                            hostedPreviewVerification.status?.preview?.baseUrl ||
                            hostedHandoffResult.start.previewBaseUrl ||
                            'the hosted preview URL'
                          }.
Next: I am returning the finished result with the verified preview ready for inspection.`,
                        );
                      } else if (hostedPreviewVerification.outcome === 'error') {
                        const previewAlertMessage =
                          hostedPreviewVerification.status?.alert?.description ||
                          hostedPreviewVerification.status?.recentLogs?.find(Boolean) ||
                          'The hosted preview reported an error after the runtime handoff.';
                        writeCommentary(
                          'verification',
                          'Hosted preview reported an error after start.',
                          'warning',
                          `Key changes: The runtime replay finished, but preview verification failed.
Next: Review the hosted preview output: ${previewAlertMessage}`,
                        );
                      } else {
                        writeCommentary(
                          'verification',
                          'Preview startup is taking longer than expected.',
                          'warning',
                          `Key changes: The runtime handoff completed, but the hosted preview did not confirm readiness within ${
                            Number.isFinite(hostedPreviewVerificationTimeoutMs) &&
                            hostedPreviewVerificationTimeoutMs > 0
                              ? Math.round(hostedPreviewVerificationTimeoutMs / 1000)
                              : 60
                          }s.
Next: The workspace preview will keep retrying automatically while I return the current run state.`,
                        );
                      }

                      emitFinalNextStepCommentary();

                      stopRunMonitors();
                      emitRunCompletionEvents(content, model, provider);
                      await new Promise((resolve) => setTimeout(resolve, 0));

                      return;
                    }
                  } catch (error) {
                    logger.warn(
                      `hosted runtime handoff replay failed ${JSON.stringify({
                        runId,
                        reason: continuationReason,
                        provider,
                        model,
                        hostedRuntimeSessionId,
                        error: error instanceof Error ? error.message : String(error),
                      })}`,
                    );
                  }
                }

                writeCommentary(
                  'action',
                  synthesizedRunHandoff.followupMessage,
                  'in-progress',
                  `Key changes: The server inferred the missing runtime commands (${synthesizedRunHandoff.startCommand}) from the generated project files.
Next: I am handing those commands to the workspace runner so preview can start without waiting for another model response.`,
                );
                dataStream.writeData({
                  type: 'synthetic-run-handoff',
                  handoffId: `${runId}-handoff-${runContinuationAttempts + 1}`,
                  messageId: generateId(),
                  reason: continuationReason,
                  startCommand: synthesizedRunHandoff.startCommand,
                  assistantContent: synthesizedRunHandoff.assistantContent,
                  timestamp: new Date().toISOString(),
                  ...(synthesizedRunHandoff.setupCommand ? { setupCommand: synthesizedRunHandoff.setupCommand } : {}),
                });
                logger.info(
                  `run continuation synthesized ${JSON.stringify({
                    runId,
                    reason: continuationReason,
                    provider,
                    model,
                    startCommand: synthesizedRunHandoff.startCommand,
                    setupCommand: synthesizedRunHandoff.setupCommand || null,
                  })}`,
                );

                emitFinalNextStepCommentary();

                stopRunMonitors();
                emitRunCompletionEvents(content, model, provider);
                await new Promise((resolve) => setTimeout(resolve, 0));

                return;
              }

              runContinuationAttempts += 1;

              const continuationAttemptLabel = `${runContinuationAttempts}/${MAX_RUN_CONTINUATION_ATTEMPTS}`;
              writeCommentary(
                'recovery',
                shouldContinueForRunIntent
                  ? 'I detected that setup finished but the requested app is not ready yet. I will continue automatically.'
                  : 'The run finished without a preview-ready checkpoint. I will keep going until the app is verifiably running.',
                'warning',
                shouldContinueForRunIntent
                  ? `Key changes: Continuation triggered (${continuationReason}, attempt ${continuationAttemptLabel}). I detected a starter/bootstrap-only response.
Next: I will continue from the existing project state, implement the requested app, and run it.`
                  : `Key changes: Continuation triggered (${continuationReason}, attempt ${continuationAttemptLabel}). The run ended without any preview-ready checkpoint.
Next: I will keep working from the existing project state until the app is running and the preview is verified.`,
              );
              logger.info(
                `run continuation triggered ${JSON.stringify({
                  runId,
                  reason: continuationReason,
                  provider,
                  model,
                  attempt: runContinuationAttempts,
                  maxAttempts: MAX_RUN_CONTINUATION_ATTEMPTS,
                  assistantChars: content.length,
                  assistantPreview: content.replace(/\s+/g, ' ').slice(0, 220),
                })}`,
              );

              processedMessages.push({ id: generateId(), role: 'assistant', content });
              processedMessages.push({
                id: generateId(),
                role: 'user',
                content: shouldContinueForRunIntent
                  ? `[Model: ${model}]

[Provider: ${provider}]

You scaffolded a project but did not complete the requested implementation.
Continue now and do ALL of the following:
1) continue from the current project files (do NOT re-run create-vite/create-react-app if package.json already exists).
2) implement the requested product requirements from the original user request:
   ${lastUserContent}
3) your FIRST executable action must be a <boltAction type="file"> that replaces ${starterEntryTarget} if the starter placeholder is still present there.
4) install dependencies only if missing.
5) include a <boltAction type="start"> command that launches the dev server.
6) if a command fails, self-heal and retry with a corrected command.
7) your response must start with executable <boltAction> steps (no plan-only prose).
8) do NOT emit ls, pwd, cat, find, echo, or other inspection-only shell commands unless they are required to fix a failing command.
9) do NOT re-scaffold or re-bootstrap the starter when package.json already exists.
10) keep the final response concise and execution-focused.
`
                  : `[Model: ${model}]

[Provider: ${provider}]

The previous run ended without a preview-ready checkpoint.
Continue from the current project state right now and do ALL of the following:
1) do not re-scaffold the project if package.json or app files already exist.
2) implement the original user request fully:
   ${lastUserContent}
3) if the starter placeholder is still present, replace ${starterEntryTarget} before any additional prose.
4) run whatever install or fix steps are still required.
5) emit executable <boltAction> steps immediately.
6) launch the dev server and do not finish until a preview-ready checkpoint is produced.
7) do NOT emit ls, pwd, cat, find, echo, or other inspection-only shell commands unless they are required to fix a failing command.
8) if a command fails, self-heal and retry with the corrected command.
9) finish with a concise summary only after the requested app is actually running in preview.
`,
              });

              beginRunMonitors();

              const result = await streamText({
                messages: [...processedMessages],
                env: runtimeEnv as any,
                options: {
                  ...options,
                  abortSignal: createStreamAbortSignal(),
                },
                apiKeys,
                files,
                providerSettings,
                promptId,
                contextOptimization,
                contextFiles: filteredFiles,
                chatMode,
                designScheme,
                summary,
                messageSliceId,
                projectMemory: effectiveProjectMemory || undefined,
                subAgentPlan,
              });

              markRunActivity();
              result.mergeIntoDataStream(dataStream);

              return;
            }

            logger.debug(
              `run continuation not required ${JSON.stringify({
                runId,
                reason: runContinuationDecision.reason,
                provider,
                model,
                continuationAttempts: runContinuationAttempts,
              })}`,
            );

            if (finishReason !== 'length') {
              if (pendingRecoveryReason) {
                recoverySucceeded = true;
                writeCommentary(
                  'recovery',
                  'Recovery finished successfully.',
                  'recovered',
                  `Key changes: Recovery completed and the workflow is stable again.
Next: I am sending the final result now.`,
                );
                pendingRecoveryReason = undefined;
                pendingRecoveryBackoffMs = 0;
                forceFinalizeRequested = false;
              }

              emitFinalNextStepCommentary();

              stopRunMonitors();
              emitRunCompletionEvents(content, model, provider);
              await new Promise((resolve) => setTimeout(resolve, 0));

              return;
            }

            if (stream.switches >= MAX_RESPONSE_SEGMENTS) {
              throw Error('Cannot continue message: Maximum segments reached');
            }

            const switchesLeft = MAX_RESPONSE_SEGMENTS - stream.switches;

            logger.info(`Reached max token limit (${MAX_TOKENS}): Continuing message (${switchesLeft} switches left)`);

            processedMessages.push({ id: generateId(), role: 'assistant', content });
            processedMessages.push({
              id: generateId(),
              role: 'user',
              content: `[Model: ${model}]\n\n[Provider: ${provider}]\n\n${CONTINUE_PROMPT}`,
            });

            beginRunMonitors();

            const result = await streamText({
              messages: [...processedMessages],
              env: runtimeEnv as any,
              options: {
                ...options,
                abortSignal: createStreamAbortSignal(),
              },
              apiKeys,
              files,
              providerSettings,
              promptId,
              contextOptimization,
              contextFiles: filteredFiles,
              chatMode,
              designScheme,
              summary,
              messageSliceId,
              projectMemory: effectiveProjectMemory || undefined,
              subAgentPlan,
            });

            markRunActivity();
            result.mergeIntoDataStream(dataStream);

            return;
          },
        };

        dataStream.writeData({
          type: 'progress',
          label: 'response',
          status: 'in-progress',
          order: progressCounter++,
          message: 'Generating Response',
        } satisfies ProgressAnnotation);
        writeCommentary(
          'action',
          withGoal('I am now implementing {goal} and streaming each visible step as I go.', latestUserGoal),
        );
        lastProgressMessageForHeartbeat = 'Writing files, running commands, and verifying the preview.';

        beginRunMonitors();

        const result = await streamText({
          messages: [...processedMessages],
          env: runtimeEnv as any,
          options: {
            ...options,
            abortSignal: createStreamAbortSignal(),
          },
          apiKeys,
          files,
          providerSettings,
          promptId,
          contextOptimization,
          contextFiles: filteredFiles,
          chatMode,
          designScheme,
          summary,
          messageSliceId,
          projectMemory: effectiveProjectMemory || undefined,
          subAgentPlan,
        });

        markRunActivity();
        result.mergeIntoDataStream(dataStream);
      },
      onError: (error: any) => {
        stopHeartbeatIfRunning();

        const elapsedMs = Date.now() - requestStartedAt;
        logger.error(
          `chat stream onError ${JSON.stringify({
            ...requestDebugContext,
            elapsedMs,
            resolvedProvider: resolvedSelectionForLogs.provider,
            resolvedModel: resolvedSelectionForLogs.model,
            errorName: error?.name,
            errorMessage: error?.message || String(error),
          })}`,
        );

        // Provide more specific error messages for common issues
        const errorMessage = error.message || 'Unknown error';

        if (errorMessage.includes('model') && errorMessage.includes('not found')) {
          return 'Custom error: Invalid model selected. Please check that the model name is correct and available.';
        }

        if (errorMessage.includes('BOLT_STREAM_TIMEOUT')) {
          return 'Custom error: Generation stream timed out while waiting for model output. The run was stopped so recovery can continue safely.';
        }

        if (errorMessage.includes('Invalid JSON response')) {
          return 'Custom error: The AI service returned an invalid response. This may be due to an invalid model name, API rate limiting, or server issues. Try selecting a different model or check your API key.';
        }

        if (
          errorMessage.includes('Invalid AWS Bedrock configuration format') ||
          errorMessage.includes('Missing required AWS credentials')
        ) {
          return 'Custom error: Bedrock credentials are invalid. Switch to a configured provider or update Bedrock JSON credentials in Settings.';
        }

        if (errorMessage.includes('Missing API key for')) {
          return 'Custom error: The selected provider is not configured for this instance yet. Select a provider with a valid key and retry.';
        }

        if (errorMessage.includes('FREE_PROVIDER_RATE_LIMITED')) {
          return 'Custom error: The hosted FREE coder is temporarily rate-limited upstream. Please retry shortly, or switch to OpenRouter with your own key for uninterrupted access.';
        }

        if (errorMessage.includes('FREE_PROVIDER_CREDITS_EXHAUSTED')) {
          return 'Custom error: The hosted FREE model on this server is out of operator credits. Use OpenRouter with your own key right now, or ask the operator to replenish the hosted FREE route.';
        }

        if (errorMessage.includes('FREE_PROVIDER_UNAVAILABLE')) {
          return 'Custom error: The hosted FREE coder is temporarily unavailable upstream. Please retry shortly, or switch to OpenRouter with your own key.';
        }

        if (
          errorMessage.includes('API key') ||
          errorMessage.includes('unauthorized') ||
          errorMessage.includes('authentication')
        ) {
          return 'Custom error: Invalid or missing API key. Please check your API key configuration.';
        }

        if (errorMessage.includes('token') && errorMessage.includes('limit')) {
          return 'Custom error: Token limit exceeded. The conversation is too long for the selected model. Try using a model with larger context window or start a new conversation.';
        }

        if (errorMessage.includes('rate limit') || errorMessage.includes('429')) {
          return 'Custom error: API rate limit exceeded. Please wait a moment before trying again.';
        }

        if (errorMessage.includes('network') || errorMessage.includes('timeout')) {
          return 'Custom error: Network error. Please check your internet connection and try again.';
        }

        return `Custom error: ${errorMessage}`;
      },
    }).pipeThrough(
      new TransformStream({
        transform: (chunk, controller) => {
          if (!lastChunk) {
            lastChunk = ' ';
          }

          if (typeof chunk === 'string') {
            if (chunk.startsWith('g') && !lastChunk.startsWith('g')) {
              controller.enqueue(encoder.encode(`0: "<div class=\\"__boltThought__\\">"\n`));
            }

            if (lastChunk.startsWith('g') && !chunk.startsWith('g')) {
              controller.enqueue(encoder.encode(`0: "</div>\\n"\n`));
            }
          }

          lastChunk = chunk;

          let transformedChunk = chunk;

          if (typeof chunk === 'string' && chunk.startsWith('g')) {
            let content = chunk.split(':').slice(1).join(':');

            if (content.endsWith('\n')) {
              content = content.slice(0, content.length - 1);
            }

            transformedChunk = `0:${content}\n`;
          }

          // Convert the string stream to a byte stream
          const str = typeof transformedChunk === 'string' ? transformedChunk : JSON.stringify(transformedChunk);
          controller.enqueue(encoder.encode(str));
        },
      }),
    );

    return new Response(dataStream, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        Connection: 'keep-alive',
        'Cache-Control': 'no-cache',
        'Text-Encoding': 'chunked',
      },
    });
  } catch (error: any) {
    stopHeartbeatIfRunning();

    const elapsedMs = Date.now() - requestStartedAt;
    logger.error('chat request failed before stream completion', {
      ...requestDebugContext,
      elapsedMs,
      resolvedProvider: resolvedSelectionForLogs.provider,
      resolvedModel: resolvedSelectionForLogs.model,
      errorName: error?.name,
      errorMessage: error?.message || String(error),
      errorStack: error?.stack,
    });

    const errorResponse = {
      error: true,
      message: error.message || 'An unexpected error occurred',
      statusCode: error.statusCode || 500,
      isRetryable: error.isRetryable !== false, // Default to retryable unless explicitly false
      provider: error.provider || 'unknown',
    };

    if (error.message?.includes('API key')) {
      return new Response(
        JSON.stringify({
          ...errorResponse,
          message: 'Invalid or missing API key',
          statusCode: 401,
          isRetryable: false,
        }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
          statusText: 'Unauthorized',
        },
      );
    }

    return new Response(JSON.stringify(errorResponse), {
      status: errorResponse.statusCode,
      headers: { 'Content-Type': 'application/json' },
      statusText: 'Error',
    });
  }
}
