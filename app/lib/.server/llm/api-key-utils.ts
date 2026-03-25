type ApiKeyMap = Record<string, string>;

export function normalizeApiKeys(apiKeys: Record<string, unknown>): ApiKeyMap {
  const normalized: ApiKeyMap = {};

  for (const [providerName, rawValue] of Object.entries(apiKeys)) {
    if (typeof rawValue !== 'string') {
      continue;
    }

    const trimmedValue = rawValue.trim();

    if (trimmedValue.length === 0) {
      continue;
    }

    normalized[providerName] = trimmedValue;
  }

  return normalized;
}

export function mergeAndSanitizeApiKeys(options: {
  cookieApiKeys: Record<string, unknown>;
  bodyApiKeys: Record<string, unknown>;
}): ApiKeyMap {
  const cookieKeys = normalizeApiKeys(options.cookieApiKeys);
  const bodyKeys = normalizeApiKeys(options.bodyApiKeys);

  return {
    ...cookieKeys,
    ...bodyKeys,
  };
}

export function hydrateApiKeysFromRuntimeEnv(options: {
  apiKeys: ApiKeyMap;
  runtimeEnv: Record<string, string>;
  providerTokenKeyByName: Record<string, string | undefined>;
  serverManagedProviderNames?: string[];
}): ApiKeyMap {
  const hydrated: ApiKeyMap = { ...options.apiKeys };
  const serverManagedProviders = new Set(options.serverManagedProviderNames || []);

  for (const [providerName, tokenEnvKey] of Object.entries(options.providerTokenKeyByName)) {
    if (!tokenEnvKey) {
      continue;
    }

    const envValue = options.runtimeEnv[tokenEnvKey];
    const isServerManaged = serverManagedProviders.has(providerName);

    if (!isServerManaged && typeof hydrated[providerName] === 'string' && hydrated[providerName].trim().length > 0) {
      continue;
    }

    if (typeof envValue !== 'string') {
      if (isServerManaged) {
        delete hydrated[providerName];
      }

      continue;
    }

    const trimmedEnvValue = envValue.trim();

    if (trimmedEnvValue.length === 0) {
      if (isServerManaged) {
        delete hydrated[providerName];
      }

      continue;
    }

    hydrated[providerName] = trimmedEnvValue;
  }

  return hydrated;
}
