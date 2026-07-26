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

vi.mock('@bolt/agent/lib/modules/llm/manager', () => ({
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

  it('falls back to relevant core files when the selector response is malformed', async () => {
    const onFinish = vi.fn();
    vi.mocked(generateText).mockResolvedValue({
      text: 'I cannot provide that envelope.',
      usage: {
        promptTokens: 1,
        completionTokens: 1,
        totalTokens: 2,
      },
    } as Awaited<ReturnType<typeof generateText>>);

    const result = await selectContext({
      messages: [{ id: 'user-1', role: 'user', content: 'Improve the calendar app.' }],
      files: {
        '/home/project/src/App.tsx': { type: 'file', content: 'export default App', isBinary: false },
        '/home/project/src/calendar.ts': { type: 'file', content: 'export const calendar = true', isBinary: false },
        '/home/project/src/main.tsx': { type: 'file', content: 'render()', isBinary: false },
        '/home/project/package.json': { type: 'file', content: '{}', isBinary: false },
        '/home/project/index.html': { type: 'file', content: '<main />', isBinary: false },
        '/home/project/src/unrelated.ts': { type: 'file', content: 'export {}', isBinary: false },
      },
      summary: '',
      onFinish,
    });

    expect(Object.keys(result)).toHaveLength(5);
    expect(result).toHaveProperty('src/App.tsx');
    expect(result).toHaveProperty('src/calendar.ts');
    expect(onFinish).toHaveBeenCalledOnce();
  });
});
