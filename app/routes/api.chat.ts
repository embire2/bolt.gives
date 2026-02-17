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
  ContextAnnotation,
  ProjectMemoryDataEvent,
  ProgressAnnotation,
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

export async function action(args: ActionFunctionArgs) {
  return chatAction(args);
}

const logger = createScopedLogger('api.chat');

function isTruthyFlag(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function extractLatestUserGoal(messages: Messages): string {
  const lastUser = [...messages].reverse().find((message) => message.role === 'user');

  if (!lastUser) {
    return '';
  }

  const { content } = extractPropertiesFromMessage(lastUser);

  return content || lastUser.content || '';
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

async function chatAction({ context, request }: ActionFunctionArgs) {
  const {
    messages,
    files,
    promptId,
    contextOptimization,
    supabase,
    chatMode,
    designScheme,
    maxLLMSteps,
    projectMemory,
  } = await request.json<{
    messages: Messages;
    files: any;
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
  }>();

  const cookieHeader = request.headers.get('Cookie');
  const apiKeys = JSON.parse(parseCookies(cookieHeader || '').apiKeys || '{}');
  const providerSettings: Record<string, IProviderSetting> = JSON.parse(
    parseCookies(cookieHeader || '').providers || '{}',
  );

  const stream = new SwitchableStream();

  const cumulativeUsage = {
    completionTokens: 0,
    promptTokens: 0,
    totalTokens: 0,
  };
  const requestStartedAt = Date.now();
  const runId = generateId();
  const manualInterventionDetected = detectManualIntervention(messages);
  const latestUserGoal = extractLatestUserGoal(messages);
  const projectKey = deriveProjectMemoryKey(files);
  const cachedProjectMemory = getProjectMemory(projectKey);
  const effectiveProjectMemory =
    projectMemory && projectMemory.projectKey === projectKey ? projectMemory : cachedProjectMemory;
  const envVars = context.cloudflare?.env as unknown as Record<string, string | undefined> | undefined;
  const subAgentsEnabled = isTruthyFlag(envVars?.BOLT_SUB_AGENTS_ENABLED || process?.env?.BOLT_SUB_AGENTS_ENABLED);
  const encoder: TextEncoder = new TextEncoder();
  let progressCounter: number = 1;

  try {
    const mcpService = MCPService.getInstance();
    const totalMessageContent = messages.reduce((acc, message) => acc + message.content, '');
    logger.debug(`Total message length: ${totalMessageContent.split(' ').length}, words`);

    let lastChunk: string | undefined = undefined;

    const dataStream = createDataStream({
      async execute(dataStream) {
        let firstCommentaryAt: number | null = null;
        let recoveryTriggered = false;
        let recoverySucceeded = false;
        let completionEmitted = false;

        const writeCommentary = (
          phase: AgentCommentaryPhase,
          message: string,
          status: AgentCommentaryAnnotation['status'] = 'in-progress',
          detail?: string,
        ) => {
          if (firstCommentaryAt === null) {
            firstCommentaryAt = Date.now();
          }

          const payload: AgentCommentaryAnnotation = {
            type: 'agent-commentary',
            phase,
            status,
            order: progressCounter++,
            message,
            timestamp: new Date().toISOString(),
            ...(detail ? { detail } : {}),
          };

          dataStream.writeData({
            ...payload,
          });
        };

        const recoveryController = new AgentRecoveryController();
        let pendingRecoveryReason: string | undefined = undefined;
        let pendingRecoveryBackoffMs = 0;
        let forceFinalizeRequested = false;

        const emitRunCompletionEvents = (finalAssistantText: string, model: string, provider: string) => {
          if (completionEmitted) {
            return;
          }

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
          dataStream.writeData({
            type: 'progress',
            label: 'response',
            status: 'complete',
            order: progressCounter++,
            message: 'Response Generated',
          } satisfies ProgressAnnotation);
        };

        const streamRecovery = new StreamRecoveryManager({
          timeout: 45000,
          maxRetries: 2,
          onTimeout: () => {
            const signal = recoveryController.registerTimeout();
            pendingRecoveryReason = pendingRecoveryReason || signal.reason;
            pendingRecoveryBackoffMs = Math.max(pendingRecoveryBackoffMs, signal.backoffMs);
            forceFinalizeRequested = forceFinalizeRequested || signal.forceFinalize;
            recoveryTriggered = true;
            writeCommentary('recovery', signal.message, 'warning', signal.detail);
            logger.warn('Stream timeout - attempting recovery');
          },
        });
        streamRecovery.startMonitoring();

        const filePaths = getFilePaths(files || {});
        let filteredFiles: FileMap | undefined = undefined;
        let summary: string | undefined = undefined;
        let messageSliceId = 0;
        const processedMessages = await mcpService.processToolInvocations(messages, dataStream);
        const collectedToolOutputs: string[] = [];
        let forceFinalizeAttempted = false;

        writeCommentary('plan', 'Planning the implementation strategy and checking project context.');

        if (processedMessages.length > 3) {
          messageSliceId = processedMessages.length - 3;
        }

        if (filePaths.length > 0 && contextOptimization) {
          logger.debug('Generating Chat Summary');
          writeCommentary('plan', 'Summarizing recent conversation context before coding.');
          dataStream.writeData({
            type: 'progress',
            label: 'summary',
            status: 'in-progress',
            order: progressCounter++,
            message: 'Analysing Request',
          } satisfies ProgressAnnotation);

          // Create a summary of the chat
          console.log(`Messages count: ${processedMessages.length}`);

          summary = await createSummary({
            messages: [...processedMessages],
            env: context.cloudflare?.env,
            apiKeys,
            providerSettings,
            promptId,
            contextOptimization,
            onFinish(resp) {
              if (resp.usage) {
                logger.debug('createSummary token usage', JSON.stringify(resp.usage));
                cumulativeUsage.completionTokens += resp.usage.completionTokens || 0;
                cumulativeUsage.promptTokens += resp.usage.promptTokens || 0;
                cumulativeUsage.totalTokens += resp.usage.totalTokens || 0;
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

          dataStream.writeMessageAnnotation({
            type: 'chatSummary',
            summary,
            chatId: processedMessages.slice(-1)?.[0]?.id,
          } as ContextAnnotation);

          // Update context buffer
          logger.debug('Updating Context Buffer');
          writeCommentary('plan', 'Selecting relevant files for the current request.');
          dataStream.writeData({
            type: 'progress',
            label: 'context',
            status: 'in-progress',
            order: progressCounter++,
            message: 'Determining Files to Read',
          } satisfies ProgressAnnotation);

          // Select context files
          console.log(`Messages count: ${processedMessages.length}`);
          filteredFiles = await selectContext({
            messages: [...processedMessages],
            env: context.cloudflare?.env,
            apiKeys,
            files,
            providerSettings,
            promptId,
            contextOptimization,
            summary,
            onFinish(resp) {
              if (resp.usage) {
                logger.debug('selectContext token usage', JSON.stringify(resp.usage));
                cumulativeUsage.completionTokens += resp.usage.completionTokens || 0;
                cumulativeUsage.promptTokens += resp.usage.promptTokens || 0;
                cumulativeUsage.totalTokens += resp.usage.totalTokens || 0;
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

          // logger.debug('Code Files Selected');
        }

        let subAgentPlan: string | undefined = undefined;

        if (subAgentsEnabled && chatMode === 'build') {
          writeCommentary('plan', 'Planner sub-agent is drafting an execution plan before coding.');

          try {
            const plannerMessages: Messages = [
              ...processedMessages.slice(-4),
              {
                id: generateId(),
                role: 'user',
                content: `You are the planner sub-agent.
Generate a concise implementation plan for the worker agent.
Rules:
- Return 3-7 bullet points.
- Include verification checkpoints.
- No code blocks or file contents.
- Keep total output under 220 words.`,
              },
            ];

            let plannerOutput = '';
            const plannerResult = await streamText({
              messages: plannerMessages,
              env: context.cloudflare?.env,
              options: {
                maxSteps: 1,
                tools: {},
                toolChoice: undefined,
                onFinish(resp) {
                  if (resp.usage) {
                    cumulativeUsage.completionTokens += resp.usage.completionTokens || 0;
                    cumulativeUsage.promptTokens += resp.usage.promptTokens || 0;
                    cumulativeUsage.totalTokens += resp.usage.totalTokens || 0;
                  }
                },
              },
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
              enableBuiltInWebTools: false,
            });

            for await (const textDelta of plannerResult.textStream) {
              plannerOutput += textDelta;
            }

            const normalizedPlan = plannerOutput.trim();

            if (normalizedPlan.length > 0) {
              subAgentPlan = normalizedPlan.length > 3000 ? `${normalizedPlan.slice(0, 2997)}...` : normalizedPlan;
              writeCommentary(
                'plan',
                'Planner sub-agent produced a worker execution plan.',
                'complete',
                subAgentPlan.slice(0, 260),
              );
            }
          } catch (plannerError) {
            writeCommentary(
              'recovery',
              'Planner sub-agent failed. Continuing with direct worker execution.',
              'warning',
              plannerError instanceof Error ? plannerError.message : 'unknown planner error',
            );
          }
        }

        const options: StreamingOptions = {
          supabaseConnection: supabase,
          toolChoice: 'auto',
          tools: mcpService.toolsWithoutExecute,
          maxSteps: maxLLMSteps,
          onStepFinish: ({ toolCalls, toolResults }) => {
            // add tool call annotations for frontend processing
            toolCalls.forEach((toolCall) => {
              mcpService.processToolCall(toolCall, dataStream);
            });

            const normalizedToolResults = (toolResults as Array<Record<string, unknown>> | undefined) ?? [];

            if (toolCalls.length > 0 || (toolResults?.length ?? 0) > 0) {
              const toolNames = toolCalls.map((call) => call.toolName).join(', ');
              writeCommentary(
                'verification',
                'Completed an execution step. Verifying results before continuing.',
                'in-progress',
                toolNames
                  ? `Tools used: ${toolNames}${toolResults?.length ? ` | Results: ${toolResults.length}` : ''}`
                  : `Results: ${toolResults?.length ?? 0}`,
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
              cumulativeUsage.completionTokens += usage.completionTokens || 0;
              cumulativeUsage.promptTokens += usage.promptTokens || 0;
              cumulativeUsage.totalTokens += usage.totalTokens || 0;
            }

            const lastUserMessage = processedMessages.filter((x) => x.role == 'user').slice(-1)[0];
            const { model, provider } = extractPropertiesFromMessage(lastUserMessage);
            const shouldForceFinalize = finishReason === 'tool-calls' || forceFinalizeRequested;

            if (shouldForceFinalize && !forceFinalizeAttempted) {
              forceFinalizeAttempted = true;

              if (pendingRecoveryBackoffMs > 0) {
                writeCommentary(
                  'recovery',
                  'Applying auto-recovery backoff before finalize.',
                  'warning',
                  `Waiting ${pendingRecoveryBackoffMs}ms before continuing.`,
                );
                await new Promise((resolve) => setTimeout(resolve, pendingRecoveryBackoffMs));
              }

              writeCommentary(
                'next-step',
                pendingRecoveryReason
                  ? 'Recovery complete. Producing final response without additional tool calls.'
                  : 'Tool execution finished. Producing a final user response without additional tool calls.',
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
                    cumulativeUsage.completionTokens += finalizeUsage.completionTokens || 0;
                    cumulativeUsage.promptTokens += finalizeUsage.promptTokens || 0;
                    cumulativeUsage.totalTokens += finalizeUsage.totalTokens || 0;
                  }

                  if (pendingRecoveryReason) {
                    recoverySucceeded = true;
                    writeCommentary(
                      'recovery',
                      'Recovery path finished. Delivering stable final output.',
                      'recovered',
                      `Recovery reason: ${pendingRecoveryReason}`,
                    );
                    pendingRecoveryReason = undefined;
                    pendingRecoveryBackoffMs = 0;
                    forceFinalizeRequested = false;
                  }

                  writeCommentary('next-step', 'Final response generated and ready for delivery.', 'complete');
                  emitRunCompletionEvents(finalContent, model, provider);
                },
              };

              const result = await streamText({
                messages: [...processedMessages],
                env: context.cloudflare?.env,
                options: finalizeOptions,
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

              result.mergeIntoDataStream(dataStream);

              return;
            }

            if (finishReason !== 'length') {
              if (pendingRecoveryReason) {
                recoverySucceeded = true;
                writeCommentary(
                  'recovery',
                  'Recovery path finished. Delivering stable final output.',
                  'recovered',
                  `Recovery reason: ${pendingRecoveryReason}`,
                );
                pendingRecoveryReason = undefined;
                pendingRecoveryBackoffMs = 0;
                forceFinalizeRequested = false;
              }

              writeCommentary('next-step', 'Final response generated and ready for delivery.', 'complete');
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

            const result = await streamText({
              messages: [...processedMessages],
              env: context.cloudflare?.env,
              options,
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

            result.mergeIntoDataStream(dataStream);

            (async () => {
              for await (const part of result.fullStream) {
                if (part.type === 'error') {
                  const error: any = part.error;
                  logger.error(`${error}`);

                  return;
                }
              }
            })();

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
        writeCommentary('action', 'Executing the plan now and streaming progress as actions run.');

        const result = await streamText({
          messages: [...processedMessages],
          env: context.cloudflare?.env,
          options,
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

        (async () => {
          for await (const part of result.fullStream) {
            streamRecovery.updateActivity();

            if (part.type === 'error') {
              const error: any = part.error;
              logger.error('Streaming error:', error);
              streamRecovery.stop();

              // Enhanced error handling for common streaming issues
              if (error.message?.includes('Invalid JSON response')) {
                logger.error('Invalid JSON response detected - likely malformed API response');
              } else if (error.message?.includes('token')) {
                logger.error('Token-related error detected - possible token limit exceeded');
              }

              return;
            }
          }
          streamRecovery.stop();
        })();
        result.mergeIntoDataStream(dataStream);
      },
      onError: (error: any) => {
        // Provide more specific error messages for common issues
        const errorMessage = error.message || 'Unknown error';

        if (errorMessage.includes('model') && errorMessage.includes('not found')) {
          return 'Custom error: Invalid model selected. Please check that the model name is correct and available.';
        }

        if (errorMessage.includes('Invalid JSON response')) {
          return 'Custom error: The AI service returned an invalid response. This may be due to an invalid model name, API rate limiting, or server issues. Try selecting a different model or check your API key.';
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
    logger.error(error);

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
