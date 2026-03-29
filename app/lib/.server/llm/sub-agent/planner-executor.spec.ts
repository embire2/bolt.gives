import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPlannerExecutor } from './planner-executor';
import { streamText } from '~/lib/.server/llm/stream-text';

vi.mock('~/lib/.server/llm/stream-text', () => ({
  streamText: vi.fn(),
}));

function createTextStream(chunks: string[]) {
  return (async function* () {
    for (const chunk of chunks) {
      yield chunk;
    }
  })();
}

describe('createPlannerExecutor', () => {
  beforeEach(() => {
    vi.mocked(streamText).mockReset();
  });

  it('keeps planner model/provider on the synthetic planner prompt', async () => {
    vi.mocked(streamText).mockResolvedValue({
      textStream: createTextStream(['- Step 1']),
      usage: Promise.resolve({
        promptTokens: 11,
        completionTokens: 7,
        totalTokens: 18,
      }),
    } as any);

    const executor = createPlannerExecutor(async () => ({
      env: {},
      options: {
        maxSteps: 1,
        tools: {},
      },
      apiKeys: {},
      files: {},
      providerSettings: {},
      contextOptimization: false,
      messageSliceId: 0,
      chatMode: 'discuss',
    }));

    const result = await executor(
      'planner-agent-1',
      [
        {
          id: 'user-1',
          role: 'user',
          content: '[Model: gpt-5-codex]\n\n[Provider: OpenAI]\n\nBuild a calendar website.',
        },
      ] as any,
      {
        type: 'planner',
        model: 'gpt-5-codex',
        provider: 'OpenAI',
      },
    );

    const streamCall = vi.mocked(streamText).mock.calls[0]?.[0];
    const plannerPrompt = streamCall.messages[streamCall.messages.length - 1].content as string;

    expect(plannerPrompt).toContain('[Model: gpt-5-codex]');
    expect(plannerPrompt).toContain('[Provider: OpenAI]');
    expect(result.metadata.model).toBe('gpt-5-codex');
    expect(result.metadata.provider).toBe('OpenAI');
  });
});
