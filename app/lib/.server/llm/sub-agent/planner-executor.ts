import { streamText } from '~/lib/.server/llm/stream-text';
import type { Messages, StreamingOptions } from '~/lib/.server/llm/stream-text';
import { DEFAULT_MODEL, DEFAULT_PROVIDER } from '~/utils/constants';
import type {
  SubAgentConfig,
  SubAgentExecutionResult,
  SubAgentExecutor,
  SubAgentMetadata,
  SubAgentState,
} from './types';

export function createPlannerExecutor(
  getStreamTextParams: (
    messages: Messages,
    config: SubAgentConfig,
  ) => Promise<{
    env: any;
    options: StreamingOptions;
    apiKeys: Record<string, string>;
    files: any;
    providerSettings: Record<string, any>;
    promptId?: string;
    contextOptimization: boolean;
    contextFiles?: any;
    summary?: string;
    messageSliceId: number;
    chatMode: string;
    designScheme?: any;
    projectMemory?: any;
  }>,
): SubAgentExecutor {
  return async function plannerExecutor(
    agentId: string,
    messages: unknown[],
    config: SubAgentConfig,
    _onProgress?: (state: SubAgentState, output: string) => void,
  ): Promise<SubAgentExecutionResult> {
    const normalizedMessages = messages as Messages;
    const streamTextParams = await getStreamTextParams(normalizedMessages, config);
    const plannerModel = config.model || DEFAULT_MODEL;
    const plannerProvider = config.provider || DEFAULT_PROVIDER.name;

    let plannerOutput = '';

    const plannerResult = await streamText({
      messages: [
        ...normalizedMessages.slice(-4),
        {
          id: agentId,
          role: 'user',
          content: `[Model: ${plannerModel}]

[Provider: ${plannerProvider}]

You are the planner sub-agent.
Generate a concise implementation plan for the worker agent.
Rules:
- Return 3-7 bullet points.
- Include verification checkpoints.
- No code blocks or file contents.
- Keep total output under 220 words.`,
        },
      ],
      env: streamTextParams.env,
      options: {
        maxSteps: 1,
        tools: {},
        toolChoice: undefined,
      },
      apiKeys: streamTextParams.apiKeys,
      files: streamTextParams.files,
      providerSettings: streamTextParams.providerSettings,
      promptId: streamTextParams.promptId,
      contextOptimization: streamTextParams.contextOptimization,
      contextFiles: streamTextParams.contextFiles,
      summary: streamTextParams.summary,
      messageSliceId: streamTextParams.messageSliceId,
      chatMode: 'discuss' as const,
      designScheme: streamTextParams.designScheme,
      projectMemory: streamTextParams.projectMemory,
      enableBuiltInWebTools: false,
    });

    for await (const textDelta of plannerResult.textStream) {
      plannerOutput += textDelta;
    }

    const normalizedPlan = plannerOutput.trim();
    const finalPlan =
      normalizedPlan.length > 0
        ? normalizedPlan.length > 3000
          ? `${normalizedPlan.slice(0, 2997)}...`
          : normalizedPlan
        : '';
    const usage = plannerResult.usage ? await plannerResult.usage : undefined;

    const metadata: SubAgentMetadata = {
      id: agentId,
      type: 'planner',
      state: 'completed',
      model: plannerModel,
      provider: plannerProvider,
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      plan: finalPlan,
      tokenUsage: usage
        ? {
            promptTokens: usage.promptTokens || 0,
            completionTokens: usage.completionTokens || 0,
            totalTokens: usage.totalTokens || 0,
          }
        : undefined,
    };

    return {
      success: finalPlan.length > 0,
      output: finalPlan,
      messages: [],
      metadata,
    };
  };
}
