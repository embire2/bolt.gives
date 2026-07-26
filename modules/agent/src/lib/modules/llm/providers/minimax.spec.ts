import { beforeEach, describe, expect, it, vi } from 'vitest';

const modelCalls: string[] = [];
const createOpenAICalls: any[] = [];

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn((options) => {
    createOpenAICalls.push(options);

    return (modelId: string) => {
      modelCalls.push(modelId);
      return { modelId };
    };
  }),
}));

import MiniMaxProvider from './minimax';

describe('MiniMaxProvider', () => {
  beforeEach(() => {
    modelCalls.length = 0;
    createOpenAICalls.length = 0;
    vi.unstubAllGlobals();
  });

  it('exposes MiniMax M3 and M2.7 as first-class coding models', () => {
    const provider = new MiniMaxProvider();

    expect(provider.staticModels.map((model) => model.name)).toEqual([
      'MiniMax-M3',
      'MiniMax-M2.7',
      'MiniMax-M2.7-highspeed',
    ]);
    expect(provider.staticModels[0]).toMatchObject({
      maxTokenAllowed: 1000000,
      maxCompletionTokens: 128000,
    });
  });

  it('fetches OpenAI-compatible dynamic MiniMax models when the user configures a token', async () => {
    const provider = new MiniMaxProvider();
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        data: [
          { id: 'MiniMax-M3', object: 'model' },
          { id: 'MiniMax-M2', object: 'model' },
        ],
      }),
    }));

    vi.stubGlobal('fetch', fetchMock);

    const models = await provider.getDynamicModels({ MiniMax: 'sk-test' }, undefined, {});

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.minimax.io/v1/models',
      expect.objectContaining({
        headers: {
          Authorization: 'Bearer sk-test',
        },
      }),
    );
    expect(models).toEqual([
      {
        name: 'MiniMax-M2',
        label: 'MiniMax-M2',
        provider: 'MiniMax',
        maxTokenAllowed: 204800,
        maxCompletionTokens: 128000,
      },
    ]);
  });

  it('creates OpenAI-compatible model instances against the MiniMax endpoint', () => {
    const provider = new MiniMaxProvider();

    provider.getModelInstance({
      model: 'MiniMax-M2.7',
      serverEnv: { MINIMAX_API_KEY: 'sk-test' } as any,
    });

    expect(createOpenAICalls[0]).toMatchObject({
      baseURL: 'https://api.minimax.io/v1',
      apiKey: 'sk-test',
    });
    expect(modelCalls).toEqual(['MiniMax-M2.7']);
  });
});
