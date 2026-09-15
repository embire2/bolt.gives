export const MAGNET_API_PROVIDER_NAME = 'MagnetAPI';
export const MAGNET_API_BASE_URL = 'https://api.magnetapi.org/v1';
export const MAGNET_API_USER_TOKEN_KEY = 'MAGNETAPI_USER_API_KEY';
export const MAGNET_API_MODEL_MAX_TOKENS = 64000;
export const MAGNET_API_MODEL_MAX_COMPLETION_TOKENS = 8192;

/*
 * These are stable fallback choices. An authenticated model-list request adds
 * every other model currently enabled for the customer's MagnetAPI account.
 */
export const MAGNET_API_MODELS = [
  { name: 'gpt-5.6-sol', label: 'ChatGPT-Luna - Medium effort' },
  { name: 'gpt-5.6-sol-max', label: 'ChatGPT-5.6 Max' },
  { name: 'gpt-5.6-sol-ultra', label: 'ChatGPT-5.6 Ultra' },
  { name: 'gpt-5.6', label: 'ChatGPT-5.6' },
  { name: 'gpt-5.5', label: 'ChatGPT-5.5' },
  { name: 'claude-opus-5', label: 'Opus 5' },
  { name: 'claude-sonnet-5', label: 'Sonnet 5' },
  { name: 'claude-fable-5', label: 'Fable 5.1 (Magnet model: Fable 5)' },
] as const;

export function getMagnetApiModelLabel(modelName: string, upstreamLabel?: string): string {
  return MAGNET_API_MODELS.find((model) => model.name === modelName)?.label || upstreamLabel || modelName;
}
