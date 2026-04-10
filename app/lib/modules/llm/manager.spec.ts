import { describe, expect, it } from 'vitest';
import { LLMManager } from './manager';

describe('LLMManager.updateModelList', () => {
  it('treats missing provider settings entries as enabled', async () => {
    const manager = {
      _providers: new Map([
        [
          'FREE',
          {
            name: 'FREE',
            staticModels: [{ name: 'deepseek/deepseek-v3.2', label: 'DeepSeek V3.2', provider: 'FREE' }],
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

    expect(modelList.map((model) => `${model.provider}:${model.name}`)).toEqual([
      'FREE:deepseek/deepseek-v3.2',
      'OpenAI:gpt-5.4',
    ]);
  });

  it('respects providers explicitly disabled in settings', async () => {
    const manager = {
      _providers: new Map([
        [
          'FREE',
          {
            name: 'FREE',
            staticModels: [{ name: 'deepseek/deepseek-v3.2', label: 'DeepSeek V3.2', provider: 'FREE' }],
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

    expect(modelList.map((model) => `${model.provider}:${model.name}`)).toEqual(['FREE:deepseek/deepseek-v3.2']);
  });
});
