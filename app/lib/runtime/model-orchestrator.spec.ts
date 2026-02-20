import { describe, expect, it } from 'vitest';
import { buildModelSelectionEnvelope, selectModelForPrompt } from './model-orchestrator';
import type { ModelInfo } from '~/lib/modules/llm/types';
import type { ProviderInfo } from '~/types/model';

const providers: ProviderInfo[] = [
  { name: 'Ollama', staticModels: [] },
  { name: 'Anthropic', staticModels: [] },
  { name: 'OpenAI', staticModels: [] },
];

const models: ModelInfo[] = [
  {
    name: 'llama3.1:8b',
    label: 'Llama 3.1 8B',
    provider: 'Ollama',
    maxTokenAllowed: 8192,
  },
  {
    name: 'claude-3-7-sonnet',
    label: 'Claude 3.7 Sonnet',
    provider: 'Anthropic',
    maxTokenAllowed: 200000,
  },
  {
    name: 'gpt-4.1-mini',
    label: 'GPT-4.1 Mini',
    provider: 'OpenAI',
    maxTokenAllowed: 128000,
  },
];

describe('model-orchestrator', () => {
  it('routes short low-complexity prompts to preferred local provider', () => {
    const decision = selectModelForPrompt({
      prompt: 'Create a tiny hello world component.',
      currentModel: 'gpt-4.1-mini',
      currentProvider: providers[2],
      availableProviders: providers,
      availableModels: models,
      settings: {
        enabled: true,
        shortPromptTokenThreshold: 180,
        lowComplexityKeywordThreshold: 2,
        localPreferredProvider: 'Ollama',
        cloudFallbackProvider: 'Anthropic',
      },
    });

    expect(decision.provider.name).toBe('Ollama');
    expect(decision.model).toBe('llama3.1:8b');
    expect(decision.complexity).toBe('low');
    expect(decision.overridden).toBe(true);
  });

  it('routes high-complexity prompts to configured cloud fallback provider', () => {
    const decision = selectModelForPrompt({
      prompt:
        'Design architecture for distributed migration with rollback, websocket integration, security review, and performance optimization.',
      currentModel: 'llama3.1:8b',
      currentProvider: providers[0],
      availableProviders: providers,
      availableModels: models,
      settings: {
        enabled: true,
        shortPromptTokenThreshold: 180,
        lowComplexityKeywordThreshold: 2,
        localPreferredProvider: 'Ollama',
        cloudFallbackProvider: 'Anthropic',
      },
    });

    expect(decision.provider.name).toBe('Anthropic');
    expect(decision.model).toBe('claude-3-7-sonnet');
    expect(decision.complexity).toBe('high');
    expect(decision.overridden).toBe(true);
  });

  it('keeps current selection for medium complexity prompts by default', () => {
    const decision = selectModelForPrompt({
      prompt: 'Please refactor this module and improve performance.',
      currentModel: 'gpt-4.1-mini',
      currentProvider: providers[2],
      availableProviders: providers,
      availableModels: models,
      settings: {
        enabled: true,
        shortPromptTokenThreshold: 180,
        lowComplexityKeywordThreshold: 2,
        localPreferredProvider: 'Ollama',
        cloudFallbackProvider: 'Anthropic',
      },
    });

    expect(decision.complexity).toBe('medium');
    expect(decision.provider.name).toBe('OpenAI');
    expect(decision.model).toBe('gpt-4.1-mini');
    expect(decision.overridden).toBe(false);
  });

  it('keeps current selection when orchestrator is disabled (manual override precedence)', () => {
    const decision = selectModelForPrompt({
      prompt: 'Any prompt',
      currentModel: 'gpt-4.1-mini',
      currentProvider: providers[2],
      availableProviders: providers,
      availableModels: models,
      settings: {
        enabled: false,
        shortPromptTokenThreshold: 180,
        lowComplexityKeywordThreshold: 2,
        localPreferredProvider: 'Ollama',
        cloudFallbackProvider: 'Anthropic',
      },
    });

    expect(decision.provider.name).toBe('OpenAI');
    expect(decision.model).toBe('gpt-4.1-mini');
    expect(decision.overridden).toBe(false);
  });

  it('builds chat-visible model selection envelope with reason metadata', () => {
    const envelope = buildModelSelectionEnvelope({
      model: 'gpt-4.1-mini',
      providerName: 'OpenAI',
      selectionReason: 'Selected cloud provider OpenAI for a high-complexity prompt (~220 tokens).',
      content: 'Implement the feature.',
    });

    expect(envelope).toContain('[Model: gpt-4.1-mini]');
    expect(envelope).toContain('[Provider: OpenAI]');
    expect(envelope).toContain('[Model Selection: Selected cloud provider OpenAI for a high-complexity prompt');
    expect(envelope).toContain('Implement the feature.');
  });

  it('auto-corrects invalid provider/model combinations before orchestration', () => {
    const decision = selectModelForPrompt({
      prompt: 'Create a simple todo list.',
      currentModel: 'gpt-4.1-mini',
      currentProvider: providers[0], // Ollama does not have gpt-4.1-mini
      availableProviders: providers,
      availableModels: models,
      settings: {
        enabled: true,
        shortPromptTokenThreshold: 180,
        lowComplexityKeywordThreshold: 2,
        localPreferredProvider: 'Ollama',
        cloudFallbackProvider: 'Anthropic',
      },
    });

    expect(decision.provider.name).toBe('Ollama');
    expect(decision.model).toBe('llama3.1:8b');
    expect(decision.overridden).toBe(true);
    expect(decision.reason).toContain('Adjusted invalid model selection');
  });
});
