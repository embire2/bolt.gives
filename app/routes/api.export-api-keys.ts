import type { LoaderFunction } from '@remix-run/cloudflare';
import { LLMManager } from '~/lib/modules/llm/manager';
import { getApiKeysFromCookie } from '~/lib/api/cookies';
import { resolveRuntimeEnvFromContext } from '~/lib/.server/runtime-env';

export const loader: LoaderFunction = async ({ context, request }) => {
  // Get API keys from cookie
  const cookieHeader = request.headers.get('Cookie');
  const apiKeysFromCookie = getApiKeysFromCookie(cookieHeader);

  // Initialize the LLM manager to access environment variables
  const runtimeEnv = resolveRuntimeEnvFromContext(context);
  const llmManager = LLMManager.getInstance(runtimeEnv);

  // Get all provider instances to find their API token keys
  const providers = llmManager.getAllProviders();

  // Create a comprehensive API keys object
  const apiKeys: Record<string, string> = {};

  // For each provider, check all possible sources for API keys
  for (const provider of providers) {
    if (provider.allowsUserApiKey === false) {
      continue;
    }

    if (apiKeysFromCookie[provider.name]) {
      apiKeys[provider.name] = apiKeysFromCookie[provider.name];
      continue;
    }

    if (!provider.config.apiTokenKey) {
      continue;
    }

    const envVarName = provider.config.apiTokenKey;

    // Check environment variables in order of precedence
    const envValue = runtimeEnv[envVarName] || process.env[envVarName] || llmManager.env[envVarName];

    if (envValue) {
      apiKeys[provider.name] = envValue;
    }
  }

  return Response.json(apiKeys);
};
