import { describe, expect, it, vi } from 'vitest';
import OpenAIProvider from './openai';

describe('OpenAIProvider', () => {
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
});
