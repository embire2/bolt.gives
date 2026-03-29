import { describe, expect, it } from 'vitest';
import { resolvePromptIdForModel } from './prompt-selection';
import type { ModelInfo } from '~/lib/modules/llm/types';

describe('prompt selection', () => {
  it('uses the small prompt for constrained models when promptId is default in build mode', () => {
    const model: ModelInfo = {
      name: 'gpt-3.5-turbo',
      label: 'GPT-3.5 Turbo',
      provider: 'OpenAI',
      maxTokenAllowed: 16000,
      maxCompletionTokens: 4096,
    };

    expect(resolvePromptIdForModel({ promptId: 'default', model, chatMode: 'build' })).toBe('small');
  });

  it('does not override non-default promptIds', () => {
    const model: ModelInfo = {
      name: 'gpt-3.5-turbo',
      label: 'GPT-3.5 Turbo',
      provider: 'OpenAI',
      maxTokenAllowed: 16000,
      maxCompletionTokens: 4096,
    };

    expect(resolvePromptIdForModel({ promptId: 'optimized', model, chatMode: 'build' })).toBe('optimized');
  });

  it('does not override in discuss mode', () => {
    const model: ModelInfo = {
      name: 'gpt-3.5-turbo',
      label: 'GPT-3.5 Turbo',
      provider: 'OpenAI',
      maxTokenAllowed: 16000,
      maxCompletionTokens: 4096,
    };

    expect(resolvePromptIdForModel({ promptId: 'default', model, chatMode: 'discuss' })).toBe('default');
  });
});
