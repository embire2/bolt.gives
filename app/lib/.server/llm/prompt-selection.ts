import type { ModelInfo } from '~/lib/modules/llm/types';

export function isSmallModelForPrompting(model: ModelInfo): boolean {
  /*
   * Heuristic: treat smaller-context models (common for local/smaller LLMs) as "small".
   * Also treat very low output limits as small.
   */
  const maxContext = model.maxTokenAllowed ?? 0;
  const maxOutput = model.maxCompletionTokens ?? 0;

  return maxContext > 0 && maxContext <= 20000 ? true : maxOutput > 0 && maxOutput <= 2048;
}

export function resolvePromptIdForModel(options: {
  promptId?: string;
  model: ModelInfo;
  chatMode: 'discuss' | 'build';
}): string {
  const { promptId, model, chatMode } = options;
  const requested = promptId || 'default';

  // Only override for build mode, and only when using the default prompt selection.
  if (chatMode === 'build' && requested === 'default' && isSmallModelForPrompting(model)) {
    return 'small';
  }

  return requested;
}
