import type { ModelInfo } from '~/lib/modules/llm/types';
import type { ProviderInfo } from '~/types/model';

const STORAGE_KEY = 'bolt_model_orchestrator_settings';

export interface ModelOrchestratorSettings {
  enabled: boolean;
  shortPromptTokenThreshold: number;
  lowComplexityKeywordThreshold: number;
  localPreferredProvider: string;
  cloudFallbackProvider: string;
}

export interface ModelSelectionDecision {
  provider: ProviderInfo;
  model: string;
  reason: string;
  complexity: 'low' | 'medium' | 'high';
  overridden: boolean;
}

const DEFAULT_SETTINGS: ModelOrchestratorSettings = {
  enabled: true,
  shortPromptTokenThreshold: 180,
  lowComplexityKeywordThreshold: 2,
  localPreferredProvider: 'Ollama',
  cloudFallbackProvider: 'Anthropic',
};

const COMPLEXITY_KEYWORDS = [
  'architecture',
  'refactor',
  'security',
  'optimize',
  'database',
  'concurrency',
  'distributed',
  'integration',
  'migration',
  'deployment',
  'rollback',
  'performance',
  'multi-step',
  'workflow',
  'plugin',
  'websocket',
  'crdt',
];

const STRICT_CONFIG_FALLBACK_PROVIDERS = new Set(['AmazonBedrock']);

function approximateTokenCount(prompt: string) {
  const words = prompt.trim().split(/\s+/).filter(Boolean).length;
  return Math.ceil(words * 1.3);
}

function detectComplexity(prompt: string, settings: ModelOrchestratorSettings): 'low' | 'medium' | 'high' {
  const normalized = prompt.toLowerCase();
  const keywordHits = COMPLEXITY_KEYWORDS.reduce((count, keyword) => {
    return normalized.includes(keyword) ? count + 1 : count;
  }, 0);

  if (keywordHits >= settings.lowComplexityKeywordThreshold + 2) {
    return 'high';
  }

  if (keywordHits >= settings.lowComplexityKeywordThreshold) {
    return 'medium';
  }

  return 'low';
}

function pickFirstModel(models: ModelInfo[], providerName: string): string | undefined {
  return models.find((model) => model.provider === providerName)?.name;
}

function hasModelForProvider(models: ModelInfo[], providerName: string, modelName: string): boolean {
  return models.some((model) => model.provider === providerName && model.name === modelName);
}

function pickFallbackProviderForInvalidSelection(options: {
  availableProviders: ProviderInfo[];
  availableModels: ModelInfo[];
  currentModel: string;
  settings: ModelOrchestratorSettings;
}): ProviderInfo | undefined {
  const providersWithModels = options.availableProviders.filter((provider) =>
    pickFirstModel(options.availableModels, provider.name),
  );

  if (providersWithModels.length === 0) {
    return undefined;
  }

  const providerWithCurrentModel = providersWithModels.find((provider) =>
    hasModelForProvider(options.availableModels, provider.name, options.currentModel),
  );

  if (providerWithCurrentModel) {
    return providerWithCurrentModel;
  }

  const preferredFallbackNames = [options.settings.cloudFallbackProvider, 'OpenAI', 'Anthropic', 'OpenRouter'];

  for (const preferredName of preferredFallbackNames) {
    if (!preferredName) {
      continue;
    }

    const preferredProvider = providersWithModels.find((provider) => provider.name === preferredName);

    if (preferredProvider) {
      return preferredProvider;
    }
  }

  return (
    providersWithModels.find((provider) => !STRICT_CONFIG_FALLBACK_PROVIDERS.has(provider.name)) ||
    providersWithModels[0]
  );
}

export function buildModelSelectionEnvelope(options: {
  model: string;
  providerName: string;
  content: string;
  selectionReason?: string;
}) {
  const lines = [`[Model: ${options.model}]`, `[Provider: ${options.providerName}]`];

  if (options.selectionReason) {
    lines.push(`[Model Selection: ${options.selectionReason}]`);
  }

  return `${lines.join('\n\n')}\n\n${options.content}`;
}

export function getModelOrchestratorSettings(): ModelOrchestratorSettings {
  if (typeof window === 'undefined') {
    return DEFAULT_SETTINGS;
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);

  if (!raw) {
    return DEFAULT_SETTINGS;
  }

  try {
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<ModelOrchestratorSettings>) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function setModelOrchestratorSettings(settings: Partial<ModelOrchestratorSettings>) {
  if (typeof window === 'undefined') {
    return;
  }

  const next = { ...getModelOrchestratorSettings(), ...settings };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function selectModelForPrompt(options: {
  prompt: string;
  currentModel: string;
  currentProvider: ProviderInfo;
  availableProviders: ProviderInfo[];
  availableModels: ModelInfo[];
  settings?: ModelOrchestratorSettings;
}): ModelSelectionDecision {
  const settings = options.settings || getModelOrchestratorSettings();
  const promptTokens = approximateTokenCount(options.prompt);
  const complexity = detectComplexity(options.prompt, settings);

  const currentSelectionIsValid = hasModelForProvider(
    options.availableModels,
    options.currentProvider.name,
    options.currentModel,
  );

  if (!currentSelectionIsValid) {
    const currentProviderFallbackModel = pickFirstModel(options.availableModels, options.currentProvider.name);

    if (currentProviderFallbackModel) {
      return {
        provider: options.currentProvider,
        model: currentProviderFallbackModel,
        reason: `Adjusted invalid model selection for ${options.currentProvider.name}; selected ${currentProviderFallbackModel}.`,
        complexity,
        overridden: true,
      };
    }

    const fallbackProvider = pickFallbackProviderForInvalidSelection({
      availableProviders: options.availableProviders,
      availableModels: options.availableModels,
      currentModel: options.currentModel,
      settings,
    });

    if (fallbackProvider) {
      const fallbackModel = pickFirstModel(options.availableModels, fallbackProvider.name)!;

      return {
        provider: fallbackProvider,
        model: fallbackModel,
        reason: `Adjusted invalid provider/model pair and switched to ${fallbackProvider.name}/${fallbackModel}.`,
        complexity,
        overridden: true,
      };
    }
  }

  if (!settings.enabled) {
    return {
      provider: options.currentProvider,
      model: options.currentModel,
      reason: 'Model orchestrator is disabled.',
      complexity,
      overridden: false,
    };
  }

  const localProvider = options.availableProviders.find(
    (provider) => provider.name === settings.localPreferredProvider,
  );
  const cloudProvider = options.availableProviders.find((provider) => provider.name === settings.cloudFallbackProvider);

  if (
    complexity === 'low' &&
    promptTokens <= settings.shortPromptTokenThreshold &&
    localProvider &&
    pickFirstModel(options.availableModels, localProvider.name)
  ) {
    const localModel = pickFirstModel(options.availableModels, localProvider.name)!;

    return {
      provider: localProvider,
      model: localModel,
      reason: `Selected local provider ${localProvider.name} for a short/low-complexity prompt (~${promptTokens} tokens).`,
      complexity,
      overridden: localProvider.name !== options.currentProvider.name || localModel !== options.currentModel,
    };
  }

  if (complexity === 'high' && cloudProvider && pickFirstModel(options.availableModels, cloudProvider.name)) {
    const cloudModel = pickFirstModel(options.availableModels, cloudProvider.name)!;

    return {
      provider: cloudProvider,
      model: cloudModel,
      reason: `Selected cloud provider ${cloudProvider.name} for a high-complexity prompt (~${promptTokens} tokens).`,
      complexity,
      overridden: cloudProvider.name !== options.currentProvider.name || cloudModel !== options.currentModel,
    };
  }

  return {
    provider: options.currentProvider,
    model: options.currentModel,
    reason: `Kept selected model because prompt complexity is ${complexity} (~${promptTokens} tokens).`,
    complexity,
    overridden: false,
  };
}
