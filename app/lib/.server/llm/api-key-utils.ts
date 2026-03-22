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
}): ApiKeyMap {
  const hydrated: ApiKeyMap = { ...options.apiKeys };

  for (const [providerName, tokenEnvKey] of Object.entries(options.providerTokenKeyByName)) {
    if (!tokenEnvKey) {
      continue;
    }

    if (typeof hydrated[providerName] === 'string' && hydrated[providerName].trim().length > 0) {
      continue;
    }

    const envValue = options.runtimeEnv[tokenEnvKey];

    if (typeof envValue !== 'string') {
      continue;
    }

    const trimmedEnvValue = envValue.trim();

    if (trimmedEnvValue.length === 0) {
      continue;
    }

    hydrated[providerName] = trimmedEnvValue;
  }

  return hydrated;
}
