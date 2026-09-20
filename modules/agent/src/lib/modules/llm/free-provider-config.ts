export const FREE_PROVIDER_NAME = 'FREE';
export const FREE_HOSTED_API_BASE_URL = 'https://openrouter.ai/api/v1';
export const FREE_HOSTED_API_TOKEN_KEY = 'BOLT_FREE_OPENROUTER_API_KEY';
export const FREE_HOSTED_MODEL_MAX_TOKENS = 64000;
export const FREE_HOSTED_MODEL_MAX_COMPLETION_TOKENS = 16384;
export const FREE_HOSTED_MODEL_REASONING_EFFORT = 'medium';

export const FREE_HOSTED_MODELS = [{ name: 'z-ai/glm-5.3-flash', label: 'GLM 5.3 Flash' }] as const;

export const FREE_HOSTED_MODEL = FREE_HOSTED_MODELS[0].name;
export const FREE_HOSTED_MODEL_LABEL = FREE_HOSTED_MODELS[0].label;

export function isHostedFreeModel(modelName: string | undefined): boolean {
  return Boolean(modelName && FREE_HOSTED_MODELS.some((model) => model.name === modelName));
}

export function resolveHostedFreeModel(modelName: string | undefined): string {
  return isHostedFreeModel(modelName) ? (modelName as string) : FREE_HOSTED_MODEL;
}
