import { generateId } from 'ai';
import type { Messages } from '@bolt/agent/lib/.server/llm/stream-text';
import { ensureFreeProviderAvailability } from '@bolt/agent/lib/.server/llm/free-provider-preflight';
import {
  resolvePreferredModelProvider,
  sanitizeSelectionWithApiKeys,
} from '@bolt/agent/lib/.server/llm/message-selection';
import {
  buildPremiumAgentExecutionContract,
  consumePremiumRuntimeCredits,
  fetchPremiumRuntimeStatus,
  recordPremiumRuntimeTokenUsage,
  type PremiumTaskCharge,
} from '@bolt/runtime/lib/.server/premium-runtime';

type CommentaryWriter = (phase: 'plan', message: string, status: 'complete', detail: string) => void;

type PremiumUsageEvent = {
  type: 'premium-usage';
  brand: 'Custom Domain';
  tokensRemaining: number;
  complexity: PremiumTaskCharge['complexity'];
};

export type PremiumChatSelection = {
  selection: { provider: string; model: string };
  messages: Messages;
  charge: PremiumTaskCharge | null;
  recordUsage: (input: { runId: string; totalTokens: number }) => Promise<void>;
  report: (writeData: (event: PremiumUsageEvent) => void, writeCommentary: CommentaryWriter) => void;
};

export async function preparePremiumChatSelection(options: {
  messages: Messages;
  selectedModel?: string;
  selectedProvider?: string;
  apiKeys: Record<string, string>;
  requestUrl: string;
  sessionId?: string;
  prompt: string;
  chatMode: 'build' | 'discuss';
  contextFileCount: number;
  env: Record<string, string | undefined>;
}): Promise<PremiumChatSelection> {
  const preferred = resolvePreferredModelProvider(options.messages, options.selectedModel, options.selectedProvider);
  const selection = sanitizeSelectionWithApiKeys({
    selection: preferred,
    apiKeys: options.apiKeys,
    selectedProviderCookie: options.selectedProvider,
  });

  await ensureFreeProviderAvailability({
    providerName: selection.provider,
    modelName: selection.model,
    apiKey: options.apiKeys[selection.provider],
  });

  let messages = options.messages;
  let charge: PremiumTaskCharge | null = null;

  if (options.sessionId?.trim()) {
    const premium = await fetchPremiumRuntimeStatus({
      requestUrl: options.requestUrl,
      sessionId: options.sessionId,
    }).catch(() => null);

    if (premium?.status === 'active') {
      charge = await consumePremiumRuntimeCredits({
        requestUrl: options.requestUrl,
        sessionId: options.sessionId,
        prompt: options.prompt,
        chatMode: options.chatMode,
        contextFileCount: options.contextFileCount,
        internalSecret:
          options.env.BOLT_PREMIUM_INTERNAL_SECRET ||
          options.env.BOLT_HOSTED_FREE_RELAY_SECRET ||
          process.env.BOLT_PREMIUM_INTERNAL_SECRET ||
          process.env.BOLT_HOSTED_FREE_RELAY_SECRET ||
          '',
      });
      messages = [
        {
          id: generateId(),
          role: 'user',
          content: buildPremiumAgentExecutionContract(charge),
        },
        ...messages,
      ];
    }
  }

  return {
    selection,
    messages,
    charge,
    async recordUsage(input) {
      if (!charge || !options.sessionId?.trim() || input.totalTokens <= 0) {
        return;
      }

      try {
        await recordPremiumRuntimeTokenUsage({
          requestUrl: options.requestUrl,
          sessionId: options.sessionId,
          runId: input.runId,
          totalTokens: input.totalTokens,
          complexity: charge.complexity,
          internalSecret:
            options.env.BOLT_PREMIUM_INTERNAL_SECRET ||
            options.env.BOLT_HOSTED_FREE_RELAY_SECRET ||
            process.env.BOLT_PREMIUM_INTERNAL_SECRET ||
            process.env.BOLT_HOSTED_FREE_RELAY_SECRET ||
            '',
        });
      } catch (error) {
        console.warn(
          `Failed to record Custom Domain token usage: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
    report(writeData, writeCommentary) {
      if (!charge) {
        return;
      }

      writeData({
        type: 'premium-usage',
        brand: 'Custom Domain',
        tokensRemaining: charge.tokensRemaining,
        complexity: charge.complexity,
      });
      writeCommentary(
        'plan',
        `Custom Domain Deep Build classified this as a ${charge.complexity} task.`,
        'complete',
        `Key changes: ${charge.tokensRemaining.toLocaleString('en-US')} Agent tokens are available before this run; actual usage is recorded from the provider response.
Next: I will run the Custom Domain implementation, review, test, and preview-verification passes.`,
      );
    },
  };
}
