import { useState, useEffect } from 'react';
import { Button } from '~/components/ui/Button';
import { PROVIDER_LIST } from '~/utils/constants';
import type { BaseProvider } from '~/lib/modules/llm/base-provider';
import { getApiKeysFromCookies } from './APIKeyManager';
import Cookies from 'js-cookie';
import { logStore } from '~/lib/stores/logs';

interface MultiModelSelectorProps {
  onModelsSelect: (models: SelectedModel[]) => void;
  onClose?: () => void;
}

export interface SelectedModel {
  provider: BaseProvider;
  model: string;
  apiKey?: string;
}

export function MultiModelSelector({ onModelsSelect, onClose }: MultiModelSelectorProps) {
  const [selectedModels, setSelectedModels] = useState<SelectedModel[]>([]);
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [availableModels, setAvailableModels] = useState<Record<string, string[]>>({});
  const [loadingModels, setLoadingModels] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Load saved API keys on mount
  useEffect(() => {
    const cookies = getApiKeysFromCookies();
    const keys: Record<string, string> = {};

    Object.entries(cookies).forEach(([key, value]) => {
      if (value) {
        const provider = PROVIDER_LIST.find((p) => p.config?.apiTokenKey === key);

        if (provider) {
          keys[provider.name] = value;
        }
      }
    });

    setApiKeys(keys);
    logStore.logInfo('MultiModelSelector: Loaded API keys from cookies', {
      type: 'api_keys',
      message: `Loaded ${Object.keys(keys).length} API keys from cookies`,
      providers: Object.keys(keys),
    });
  }, []);

  // Fetch models for a provider
  const fetchModelsForProvider = async (provider: BaseProvider) => {
    if (loadingModels[provider.name] || availableModels[provider.name]) {
      return;
    }

    setLoadingModels((prev) => ({ ...prev, [provider.name]: true }));
    setErrors((prev) => ({ ...prev, [provider.name]: '' }));

    try {
      logStore.logInfo(`MultiModelSelector: Fetching models for ${provider.name}`, {
        type: 'model_fetch',
        message: `Fetching models for provider ${provider.name}`,
      });

      const response = await fetch(`/api/models/${encodeURIComponent(provider.name)}`);

      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.statusText}`);
      }

      const data = (await response.json()) as { models?: string[] };
      const models = data.models || [];

      setAvailableModels((prev) => ({ ...prev, [provider.name]: models }));
      logStore.logInfo(`MultiModelSelector: Successfully fetched ${models.length} models for ${provider.name}`, {
        type: 'model_fetch',
        message: `Fetched ${models.length} models for ${provider.name}`,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch models';
      setErrors((prev) => ({ ...prev, [provider.name]: errorMessage }));
      logStore.logError(`MultiModelSelector: Error fetching models for ${provider.name}`, error);
    } finally {
      setLoadingModels((prev) => ({ ...prev, [provider.name]: false }));
    }
  };

  const handleProviderSelect = async (provider: BaseProvider) => {
    const existingIndex = selectedModels.findIndex((m) => m.provider.name === provider.name);

    if (existingIndex >= 0) {
      // Remove if already selected
      setSelectedModels((prev) => prev.filter((_, index) => index !== existingIndex));
      logStore.logInfo(`MultiModelSelector: Removed provider ${provider.name}`, {
        type: 'provider_selection',
        message: `Removed provider ${provider.name} from selection`,
      });
    } else if (selectedModels.length < 2) {
      /*
       * Add new model (limit to 2 for orchestration)
       * Use static models as default, fetch dynamic models in background
       */
      const defaultModel = provider.staticModels[0]?.name || '';

      setSelectedModels((prev) => [
        ...prev,
        {
          provider,
          model: defaultModel,
          apiKey: apiKeys[provider.name],
        },
      ]);

      // Fetch dynamic models in the background (non-blocking)
      fetchModelsForProvider(provider);

      logStore.logInfo(`MultiModelSelector: Added provider ${provider.name} with model ${defaultModel}`, {
        type: 'provider_selection',
        message: `Added provider ${provider.name} with model ${defaultModel}`,
      });
    }
  };

  const handleModelChange = (index: number, model: string) => {
    setSelectedModels((prev) => prev.map((m, i) => (i === index ? { ...m, model } : m)));
    logStore.logInfo(`MultiModelSelector: Changed model for ${selectedModels[index].provider.name} to ${model}`, {
      type: 'model_change',
      message: `Changed model for ${selectedModels[index].provider.name} to ${model}`,
    });
  };

  const handleApiKeyChange = (providerName: string, apiKey: string) => {
    setApiKeys((prev) => ({ ...prev, [providerName]: apiKey }));
    setSelectedModels((prev) => prev.map((m) => (m.provider.name === providerName ? { ...m, apiKey } : m)));

    // Save to cookies
    const provider = PROVIDER_LIST.find((p) => p.name === providerName);

    if (provider && provider.config?.apiTokenKey) {
      Cookies.set(provider.config.apiTokenKey, apiKey, { expires: 365 });
      logStore.logInfo(`MultiModelSelector: Updated API key for ${providerName}`, {
        type: 'api_key_update',
        message: `Updated API key for ${providerName}`,
      });
    }
  };

  const validateSelection = () => {
    if (selectedModels.length !== 2) {
      return { valid: false, error: 'Please select exactly 2 AI models for orchestration' };
    }

    for (const model of selectedModels) {
      if (!model.apiKey && model.provider.config?.apiTokenKey) {
        return { valid: false, error: `API key required for ${model.provider.name}` };
      }

      if (!model.model) {
        return { valid: false, error: `Please select a model for ${model.provider.name}` };
      }
    }

    return { valid: true, error: null };
  };

  const handleConfirm = () => {
    const validation = validateSelection();

    if (validation.valid) {
      logStore.logInfo('MultiModelSelector: Confirming selection', {
        type: 'selection_confirm',
        message: 'Confirming model selection for orchestration',
        models: selectedModels.map((m) => ({ provider: m.provider.name, model: m.model })),
      });
      onModelsSelect(selectedModels);
    } else {
      logStore.logWarning('MultiModelSelector: Invalid selection', { error: validation.error });
    }
  };

  const validation = validateSelection();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] m-4 overflow-auto">
        <div className="p-6 border-b border-bolt-elements-borderColor">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-bolt-elements-textPrimary">
                Select AI Models for Orchestration
              </h2>
              <p className="text-sm text-bolt-elements-textSecondary mt-1">
                Choose 2 AI models to work together on your project
              </p>
            </div>
            {onClose && (
              <Button variant="ghost" size="sm" onClick={onClose}>
                <div className="i-ph:x text-lg" />
              </Button>
            )}
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* How Multi-Orchestration Works */}
          <div className="bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-lg p-4">
            <h3 className="text-lg font-semibold text-bolt-elements-textPrimary mb-3 flex items-center gap-2">
              <div className="i-ph:info text-blue-500" />
              How Multi-Model Orchestration Works
            </h3>

            <div className="space-y-4 text-sm text-bolt-elements-textSecondary">
              <div>
                <h4 className="font-medium text-bolt-elements-textPrimary mb-1">Overview</h4>
                <p>
                  Multi-Model Orchestration allows two AI models to collaborate on your project. Each model brings its
                  unique strengths, resulting in higher quality outputs through cross-validation and complementary
                  perspectives.
                </p>
              </div>

              <div>
                <h4 className="font-medium text-bolt-elements-textPrimary mb-1">How It Works</h4>
                <ol className="list-decimal list-inside space-y-1 ml-2">
                  <li>Your request is analyzed and broken down into subtasks</li>
                  <li>Both AI models work on the tasks simultaneously</li>
                  <li>Results are compared and validated against each other</li>
                  <li>The best solutions are combined into a final output</li>
                  <li>Any conflicts are resolved through consensus mechanisms</li>
                </ol>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h4 className="font-medium text-green-600 mb-1 flex items-center gap-1">
                    <div className="i-ph:check-circle" />
                    Pros
                  </h4>
                  <ul className="space-y-1 text-xs">
                    <li>• Higher code quality through peer review</li>
                    <li>• Catches more edge cases and bugs</li>
                    <li>• Multiple perspectives on solutions</li>
                    <li>• Better error detection and recovery</li>
                    <li>• More robust and tested code</li>
                  </ul>
                </div>

                <div>
                  <h4 className="font-medium text-orange-600 mb-1 flex items-center gap-1">
                    <div className="i-ph:warning-circle" />
                    Cons
                  </h4>
                  <ul className="space-y-1 text-xs">
                    <li>• Slower response times (2-3x)</li>
                    <li>• Higher token usage and costs</li>
                    <li>• Requires API keys for both models</li>
                    <li>• May have conflicting suggestions</li>
                    <li>• More complex debugging</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* Model Selection Grid */}
          <div>
            <h3 className="text-lg font-semibold text-bolt-elements-textPrimary mb-3">
              Available AI Providers ({selectedModels.length}/2 selected)
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {(PROVIDER_LIST as BaseProvider[]).map((provider) => {
                const isSelected = selectedModels.some((m) => m.provider.name === provider.name);
                const selectedModel = selectedModels.find((m) => m.provider.name === provider.name);
                const models = availableModels[provider.name] || [];
                const isLoading = loadingModels[provider.name];
                const error = errors[provider.name];
                const hasApiKey = !!apiKeys[provider.name];

                return (
                  <div
                    key={provider.name}
                    className={`border-2 rounded-lg p-4 transition-all relative overflow-hidden ${
                      isSelected
                        ? 'border-blue-500 bg-blue-500/10 shadow-lg'
                        : 'border-bolt-elements-borderColor hover:border-bolt-elements-focus hover:shadow-md'
                    } ${selectedModels.length >= 2 && !isSelected ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                    onClick={() => {
                      if (selectedModels.length < 2 || isSelected) {
                        handleProviderSelect(provider);
                      }
                    }}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <h4 className="font-medium text-bolt-elements-textPrimary">{provider.name}</h4>
                        <p className="text-xs text-bolt-elements-textSecondary">
                          {provider.staticModels.length} models available
                        </p>
                      </div>
                      {isSelected && (
                        <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                          <div className="i-ph:check text-white text-sm" />
                        </div>
                      )}
                    </div>

                    {/* Display available models preview */}
                    {!isSelected && provider.staticModels.length > 0 && (
                      <div className="mt-3 space-y-2">
                        <div className="text-xs text-bolt-elements-textSecondary font-medium">Popular models:</div>
                        <div className="space-y-1">
                          {provider.staticModels.slice(0, 3).map((model, index) => (
                            <div
                              key={index}
                              className="flex items-center justify-between text-xs bg-bolt-elements-background-depth-2 text-bolt-elements-textSecondary px-2 py-1 rounded"
                            >
                              <span className="truncate flex-1">{model.label || model.name}</span>
                              <span className="text-bolt-elements-textTertiary ml-2 text-[10px]">
                                {model.maxTokenAllowed >= 100000
                                  ? '100k+'
                                  : Math.round(model.maxTokenAllowed / 1000) + 'k'}
                              </span>
                            </div>
                          ))}
                          {provider.staticModels.length > 3 && (
                            <div className="text-xs text-bolt-elements-textTertiary text-center pt-1">
                              +{provider.staticModels.length - 3} more models
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {isSelected && (
                      <div className="space-y-3 mt-3" onClick={(e) => e.stopPropagation()}>
                        {/* API Key Input */}
                        {provider.config?.apiTokenKey && (
                          <div>
                            <label className="text-xs text-bolt-elements-textSecondary">
                              API Key {hasApiKey && <span className="text-green-600">(configured)</span>}
                            </label>
                            <input
                              type="password"
                              value={apiKeys[provider.name] || ''}
                              onChange={(e) => handleApiKeyChange(provider.name, e.target.value)}
                              placeholder={`Enter ${provider.name} API key`}
                              className="w-full mt-1 px-2 py-1 text-sm bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor rounded focus:outline-none focus:border-bolt-elements-focus"
                            />
                          </div>
                        )}

                        {/* Model Selection */}
                        <div>
                          <label className="text-xs text-bolt-elements-textSecondary">Model</label>
                          {isLoading ? (
                            <div className="mt-1 text-xs text-bolt-elements-textSecondary">Loading models...</div>
                          ) : error ? (
                            <div className="mt-1 text-xs text-red-500">{error}</div>
                          ) : (
                            <select
                              value={selectedModel?.model || ''}
                              onChange={(e) =>
                                handleModelChange(selectedModels.indexOf(selectedModel!), e.target.value)
                              }
                              className="w-full mt-1 px-2 py-1 text-sm bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor rounded focus:outline-none focus:border-bolt-elements-focus"
                            >
                              {/* Always show static models first */}
                              {provider.staticModels.length > 0 && (
                                <optgroup label="Available Models">
                                  {provider.staticModels.map((model) => (
                                    <option key={model.name} value={model.name}>
                                      {model.label} ({model.name})
                                    </option>
                                  ))}
                                </optgroup>
                              )}
                              {/* Show dynamic models if any */}
                              {models.length > 0 && (
                                <optgroup label="Additional Models">
                                  {models.map((model) => (
                                    <option key={model} value={model}>
                                      {model}
                                    </option>
                                  ))}
                                </optgroup>
                              )}
                              {/* Fallback if no models at all */}
                              {models.length === 0 && provider.staticModels.length === 0 && (
                                <option>No models available</option>
                              )}
                            </select>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Validation Message */}
          {!validation.valid && validation.error && (
            <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-3">
              <p className="text-sm text-orange-600 dark:text-orange-400 flex items-center gap-2 font-medium">
                <div className="i-ph:warning text-lg" />
                {validation.error}
              </p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-6 border-t border-bolt-elements-borderColor">
            <div className="text-sm text-bolt-elements-textSecondary">
              {selectedModels.length === 0 && 'Select 2 AI models to enable orchestration'}
              {selectedModels.length === 1 && 'Select 1 more AI model'}
              {selectedModels.length === 2 && 'Ready to start orchestration session'}
            </div>

            <div className="flex items-center gap-3">
              {onClose && (
                <Button variant="ghost" onClick={onClose}>
                  Cancel
                </Button>
              )}
              <Button
                variant="default"
                onClick={handleConfirm}
                disabled={!validation.valid}
                className="bg-blue-600 hover:bg-blue-700 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
              >
                <div className="i-ph:users-three text-lg mr-2" />
                Start Orchestration
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
