import { describe, expect, it } from 'vitest';
import { LLMManager } from './manager';
import { PROVIDER_CATALOG } from './provider-catalog';

const freeModels = PROVIDER_CATALOG.find((provider) => provider.name === 'FREE')?.staticModels || [];

describe('LLMManager.updateModelList', () => {
  it('treats missing provider settings entries as enabled', async () => {
    const manager = {
      _providers: new Map([
        [
          'FREE',
          {
            name: 'FREE',
            staticModels: freeModels,
          },
        ],
        [
          'OpenAI',
          {
            name: 'OpenAI',
            staticModels: [{ name: 'gpt-5.4', label: 'GPT-5.4', provider: 'OpenAI' }],
          },
        ],
      ]),
      _modelList: [],
    };

    const modelList = await LLMManager.prototype.updateModelList.call(manager, {
      providerSettings: {
        FREE: { enabled: true },
      },
    });

    expect(modelList.map((model) => `${model.provider}:${model.name}`)).toEqual(
      expect.arrayContaining(['OpenAI:gpt-5.4', 'FREE:z-ai/glm-5.3-flash']),
    );
    expect(modelList).toHaveLength(2);
  });

  it('respects providers explicitly disabled in settings', async () => {
    const manager = {
      _providers: new Map([
        [
          'FREE',
          {
            name: 'FREE',
            staticModels: freeModels,
          },
        ],
        [
          'OpenAI',
          {
            name: 'OpenAI',
            staticModels: [{ name: 'gpt-5.4', label: 'GPT-5.4', provider: 'OpenAI' }],
          },
        ],
      ]),
      _modelList: [],
    };

    const modelList = await LLMManager.prototype.updateModelList.call(manager, {
      providerSettings: {
        FREE: { enabled: true },
        OpenAI: { enabled: false },
      },
    });

    expect(modelList.map((model) => `${model.provider}:${model.name}`)).toEqual(
      expect.arrayContaining(['FREE:z-ai/glm-5.3-flash']),
    );
    expect(modelList).toHaveLength(1);
  });
});
