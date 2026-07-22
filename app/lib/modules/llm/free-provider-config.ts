export const FREE_PROVIDER_NAME = 'FREE';
export const FREE_HOSTED_API_BASE_URL = 'https://api.magnetapi.org/v1';
export const FREE_HOSTED_API_TOKEN_KEY = 'MAGNET_API_KEY';
export const FREE_HOSTED_MODEL_MAX_TOKENS = 64000;
export const FREE_HOSTED_MODEL_MAX_COMPLETION_TOKENS = 8192;

export const FREE_HOSTED_MODELS = [
  { name: 'gpt-5.6-sol', label: 'ChatGPT-5.6 SOL' },
  { name: 'claude-opus-4-8', label: 'Opus 4.8' },
  { name: 'claude-sonnet-5', label: 'Sonnet 5' },
  { name: 'claude-fable-5', label: 'Fable 5' },
] as const;

export const FREE_HOSTED_MODEL = FREE_HOSTED_MODELS[0].name;
export const FREE_HOSTED_MODEL_LABEL = FREE_HOSTED_MODELS[0].label;

export function isHostedFreeModel(modelName: string | undefined): boolean {
  return Boolean(modelName && FREE_HOSTED_MODELS.some((model) => model.name === modelName));
}

export function resolveHostedFreeModel(modelName: string | undefined): string {
  return isHostedFreeModel(modelName) ? (modelName as string) : FREE_HOSTED_MODEL;
}
