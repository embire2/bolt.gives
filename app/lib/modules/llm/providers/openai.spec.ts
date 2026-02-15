import { beforeEach, describe, expect, it, vi } from 'vitest';

const chatCalls: string[] = [];
const responsesCalls: string[] = [];

vi.mock('@ai-sdk/openai', () => {
  return {
    createOpenAI: vi.fn(() => {
      const fn: any = (modelId: string) => {
        chatCalls.push(modelId);
        return { _kind: 'chat', modelId };
      };

      fn.responses = (modelId: string) => {
        responsesCalls.push(modelId);
        return { _kind: 'responses', modelId };
      };

      return fn;
    }),
  };
});

import OpenAIProvider from './openai';

describe('OpenAIProvider', () => {
  beforeEach(() => {
    chatCalls.length = 0;
    responsesCalls.length = 0;
    vi.unstubAllGlobals();
  });

  it('includes codex-* models from the OpenAI /v1/models list', async () => {
    const provider = new OpenAIProvider();

    const fetchMock = vi.fn(async () => {
      return {
        async json() {
          return {
            data: [
              { object: 'model', id: 'gpt-4o' },
              { object: 'model', id: 'codex-mini-latest' },
              { object: 'model', id: 'text-embedding-3-small' }, // should be filtered out
            ],
          };
        },
      } as any;
    });

    vi.stubGlobal('fetch', fetchMock);

    const models = await provider.getDynamicModels({ OpenAI: 'sk-test' }, undefined, { OPENAI_API_KEY: 'sk-test' });

    expect(models.some((m) => m.name === 'codex-mini-latest')).toBe(true);
    expect(models.some((m) => m.name === 'text-embedding-3-small')).toBe(false);
  });

  it('uses the OpenAI Responses API model for codex models', () => {
    const provider = new OpenAIProvider();

    provider.getModelInstance({
      model: 'gpt-5.1-codex-mini',
      serverEnv: { OPENAI_API_KEY: 'sk-test' } as any,
    });

    expect(responsesCalls).toEqual(['gpt-5.1-codex-mini']);
    expect(chatCalls).toEqual([]);
  });

  it('uses the OpenAI chat model for non-codex models', () => {
    const provider = new OpenAIProvider();

    provider.getModelInstance({
      model: 'gpt-4o',
      serverEnv: { OPENAI_API_KEY: 'sk-test' } as any,
    });

    expect(chatCalls).toEqual(['gpt-4o']);
    expect(responsesCalls).toEqual([]);
  });
});
