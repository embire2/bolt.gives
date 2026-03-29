import { inferTemplateFromPrompt } from '~/utils/selectStarterTemplate';

const LOCAL_PROVIDER_SET = new Set(['LMStudio', 'Ollama']);
const SMALL_OR_BOOTSTRAP_MODEL_RE =
  /\b(mini|small|haiku|flash|lite|8b|7b|3b|1b|phi|qwen2?\.?5?-coder(?:-[0-9]+b)?|deepseek-coder(?:-[0-9]+b)?)\b/i;

type StarterBootstrapDecisionOptions = {
  providerName: string | undefined;
  modelName: string | undefined;
  message: string | undefined;
  hostedRuntimeEnabled?: boolean;
};

export function shouldUseClientStarterBootstrap(options: StarterBootstrapDecisionOptions): boolean {
  const { providerName, modelName, message, hostedRuntimeEnabled = false } = options;

  if (!providerName) {
    return false;
  }

  if (LOCAL_PROVIDER_SET.has(providerName)) {
    return true;
  }

  if (hostedRuntimeEnabled) {
    const inferredTemplate = inferTemplateFromPrompt(message || '');

    if (inferredTemplate && inferredTemplate.template !== 'blank') {
      return true;
    }
  }

  if (!modelName) {
    return false;
  }

  return SMALL_OR_BOOTSTRAP_MODEL_RE.test(modelName);
}
