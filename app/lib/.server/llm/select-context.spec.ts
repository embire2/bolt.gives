import { generateText } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { selectContext } from './select-context';

vi.mock('ai', () => ({
  generateText: vi.fn(),
}));

const mockProvider = {
  name: 'MockProvider',
  staticModels: [{ name: 'mock-model' }],
  getModelInstance: vi.fn(() => 'mock-model-instance'),
};

vi.mock('~/lib/modules/llm/manager', () => ({
  LLMManager: {
    getInstance: () => ({
      getProvider: () => mockProvider,
      getStaticModelListFromProvider: () => mockProvider.staticModels,
      getModelListFromProvider: async () => mockProvider.staticModels,
    }),
  },
}));

describe('selectContext', () => {
  beforeEach(() => {
    vi.mocked(generateText).mockReset();
    mockProvider.getModelInstance.mockClear();
  });

  it('continues with an empty context when no files exist yet', async () => {
    await expect(
      selectContext({
        messages: [{ id: 'user-1', role: 'user', content: 'Build a new app.' }],
        files: {},
        summary: '',
      }),
    ).resolves.toEqual({});

    expect(generateText).not.toHaveBeenCalled();
  });

  it('continues with an empty context when the selector includes no files', async () => {
    vi.mocked(generateText).mockResolvedValue({
      text: '<updateContextBuffer></updateContextBuffer>',
      usage: {
        promptTokens: 1,
        completionTokens: 1,
        totalTokens: 2,
      },
    } as Awaited<ReturnType<typeof generateText>>);

    await expect(
      selectContext({
        messages: [{ id: 'user-1', role: 'user', content: 'Build a new app.' }],
        files: {
          '/home/project/package.json': {
            type: 'file',
            content: '{"name":"smoke"}',
            isBinary: false,
          },
        },
        summary: '',
      }),
    ).resolves.toEqual({});
  });
});
