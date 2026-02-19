import type { SubAgentConfig, SubAgentExecutionResult, SubAgentMetadata } from './types';
import { streamText } from '../stream-text';
import type { Messages, StreamingOptions } from '../stream-text';

export type SubAgentExecutor = (
  agentId: string,
  messages: unknown[],
  config: SubAgentConfig,
  onProgress?: (state: SubAgentState, output: string) => void,
) => Promise<SubAgentExecutionResult>;

export async function createPlannerExecutor(
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
) {
  return async function plannerExecutor(
    agentId: string,
    messages: Messages,
    config: SubAgentConfig,
  ): Promise<SubAgentExecutionResult> {
    const streamTextParams = await getStreamTextParams(messages, config);

    let plannerOutput = '';

    const plannerResult = await streamText({
      messages: [
        ...messages.slice(-4),
        {
          id: agentId,
          role: 'user',
          content: `You are the planner sub-agent.
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
        onFinish: (resp) => {},
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
    const finalPlan = normalizedPlan.length > 0
      ? (normalizedPlan.length > 3000 ? `${normalizedPlan.slice(0, 2997)}...` : normalizedPlan)
      : '';

    const metadata: SubAgentMetadata = {
      id: agentId,
      type: 'planner',
      state: 'completed',
      model: streamTextParams.options.model || config.model,
      provider: streamTextParams.options.provider || config.provider,
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      plan: finalPlan,
      tokenUsage: plannerResult.usage ? {
        promptTokens: plannerResult.usage.promptTokens || 0,
        completionTokens: plannerResult.usage.completionTokens || 0,
        totalTokens: plannerResult.usage.totalTokens || 0,
      } : undefined,
    };

    return {
      success: finalPlan.length > 0,
      output: finalPlan,
      messages: [],
      metadata,
    };
  };
}
