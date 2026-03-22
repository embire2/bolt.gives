const LOCAL_PROVIDER_SET = new Set(['LMStudio', 'Ollama']);
const SMALL_OR_BOOTSTRAP_MODEL_RE =
  /\b(mini|small|haiku|flash|lite|8b|7b|3b|1b|phi|qwen2?\.?5?-coder(?:-[0-9]+b)?|deepseek-coder(?:-[0-9]+b)?)\b/i;

export function shouldUseClientStarterBootstrap(
  providerName: string | undefined,
  modelName: string | undefined,
): boolean {
  if (!providerName) {
    return false;
  }

  if (LOCAL_PROVIDER_SET.has(providerName)) {
    return true;
  }

  if (!modelName) {
    return false;
  }

  return SMALL_OR_BOOTSTRAP_MODEL_RE.test(modelName);
}
