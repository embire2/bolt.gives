import { FREE_PROVIDER_NAME, resolveHostedFreeModel } from '@bolt/agent/lib/modules/llm/free-provider-config';
import { normalizeCredential } from '@bolt/core/lib/runtime/credentials';

export function isHostedFreeCreditsExhausted(status: number | undefined, message: string): boolean {
  return (
    status === 402 ||
    /payment required|insufficient credits|credits? exhausted|out of (?:operator )?credits|wallet balance/i.test(
      message,
    )
  );
}

/*
 * Validate configuration locally. A separate paid generation probe can time out and
 * block a usable model; availability must come from the actual coding request.
 */
export function validateFreeProviderSelection(options: { providerName: string; modelName: string; apiKey?: string }) {
  if (options.providerName !== FREE_PROVIDER_NAME) {
    return { resolvedModelName: options.modelName, usedFallback: false };
  }

  if (!normalizeCredential(options.apiKey)) {
    throw new Error(`Missing API key for ${FREE_PROVIDER_NAME} provider`);
  }

  const resolvedModelName = resolveHostedFreeModel(options.modelName);

  return { resolvedModelName, usedFallback: resolvedModelName !== options.modelName };
}
