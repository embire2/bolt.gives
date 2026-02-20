import type { ModelInfo } from '~/lib/modules/llm/types';

export const PROVIDER_MODEL_SELECTION_STORAGE_KEY = 'bolt_provider_model_selection_v1';
export const PROVIDER_HISTORY_STORAGE_KEY = 'bolt_provider_history_v1';
export const LAST_CONFIGURED_PROVIDER_COOKIE_KEY = 'lastConfiguredProvider';
export const INSTANCE_SELECTION_STORAGE_KEY_PREFIX = 'bolt_instance_selection_v1';

export type ProviderModelSelectionMap = Record<string, string>;
export type ProviderHistory = string[];
export interface InstanceSelectionState {
  providerName?: string;
  modelName?: string;
  updatedAt?: string;
}

interface PickPreferredProviderNameOptions {
  activeProviderNames: string[];
  apiKeys: Record<string, string>;
  localProviderNames?: string[];
  savedProviderName?: string;
  lastConfiguredProviderName?: string;
  fallbackProviderName?: string;
}

interface ResolvePreferredModelNameOptions {
  providerName: string;
  models: ModelInfo[];
  rememberedModelName?: string;
  savedModelName?: string;
}

type ProviderApiKeyValidator = (rawKey: string) => boolean;

function isValidBedrockConfig(rawKey: string): boolean {
  try {
    const parsed = JSON.parse(rawKey) as {
      region?: unknown;
      accessKeyId?: unknown;
      secretAccessKey?: unknown;
    };

    return (
      typeof parsed.region === 'string' &&
      parsed.region.trim().length > 0 &&
      typeof parsed.accessKeyId === 'string' &&
      parsed.accessKeyId.trim().length > 0 &&
      typeof parsed.secretAccessKey === 'string' &&
      parsed.secretAccessKey.trim().length > 0
    );
  } catch {
    return false;
  }
}

const PROVIDER_API_KEY_VALIDATORS: Record<string, ProviderApiKeyValidator> = {
  AmazonBedrock: isValidBedrockConfig,
};

function parseRecord(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw);

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return {};
    }

    return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
}

function getDefaultStorage(): Storage | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }

  return window.localStorage;
}

export function buildInstanceSelectionStorageKey(hostname: string): string {
  const normalizedHost = hostname.trim().toLowerCase() || 'default';
  return `${INSTANCE_SELECTION_STORAGE_KEY_PREFIX}:${normalizedHost}`;
}

export function parseApiKeysCookie(raw: string | undefined): Record<string, string> {
  const parsed = parseRecord(raw);
  const normalized: Record<string, string> = {};

  for (const [providerName, value] of Object.entries(parsed)) {
    if (typeof value !== 'string') {
      continue;
    }

    const trimmedValue = value.trim();

    if (trimmedValue.length === 0) {
      continue;
    }

    normalized[providerName] = trimmedValue;
  }

  return normalized;
}

export function readInstanceSelection(
  hostname: string,
  storage: Pick<Storage, 'getItem'> | undefined = getDefaultStorage(),
): InstanceSelectionState {
  if (!storage || !hostname) {
    return {};
  }

  const key = buildInstanceSelectionStorageKey(hostname);
  const parsed = parseRecord(storage.getItem(key));
  const providerName = typeof parsed.providerName === 'string' ? parsed.providerName : undefined;
  const modelName = typeof parsed.modelName === 'string' ? parsed.modelName : undefined;
  const updatedAt = typeof parsed.updatedAt === 'string' ? parsed.updatedAt : undefined;

  return {
    providerName,
    modelName,
    updatedAt,
  };
}

export function rememberInstanceSelection(
  options: {
    hostname: string;
    providerName?: string;
    modelName?: string;
  },
  storage: Pick<Storage, 'getItem'> & Pick<Storage, 'setItem'> = getDefaultStorage() as Storage,
): void {
  if (!storage || !options.hostname) {
    return;
  }

  const key = buildInstanceSelectionStorageKey(options.hostname);
  const current = readInstanceSelection(options.hostname, storage);
  const next: InstanceSelectionState = {
    providerName: options.providerName || current.providerName,
    modelName: options.modelName || current.modelName,
    updatedAt: new Date().toISOString(),
  };

  storage.setItem(key, JSON.stringify(next));
}

export function hasUsableApiKey(apiKeys: Record<string, string>, providerName: string): boolean {
  if (typeof apiKeys[providerName] !== 'string') {
    return false;
  }

  const trimmedKey = apiKeys[providerName].trim();

  if (trimmedKey.length === 0) {
    return false;
  }

  const validator = PROVIDER_API_KEY_VALIDATORS[providerName];

  if (!validator) {
    return true;
  }

  return validator(trimmedKey);
}

export function pickPreferredProviderName(options: PickPreferredProviderNameOptions): string | undefined {
  const {
    activeProviderNames,
    apiKeys,
    localProviderNames = [],
    savedProviderName,
    lastConfiguredProviderName,
    fallbackProviderName,
  } = options;

  if (activeProviderNames.length === 0) {
    return undefined;
  }

  const activeSet = new Set(activeProviderNames);
  const localSet = new Set(localProviderNames);
  const hasUsableProvider = (providerName: string): boolean =>
    localSet.has(providerName) || hasUsableApiKey(apiKeys, providerName);
  const hasAnyUsableProvider = activeProviderNames.some((providerName) => hasUsableProvider(providerName));

  const candidates = [lastConfiguredProviderName, savedProviderName, fallbackProviderName].filter(
    (candidate): candidate is string => typeof candidate === 'string' && candidate.length > 0,
  );

  for (const candidate of candidates) {
    if (!activeSet.has(candidate)) {
      continue;
    }

    if (!hasAnyUsableProvider || hasUsableProvider(candidate)) {
      return candidate;
    }
  }

  const usableProvider = activeProviderNames.find((providerName) => hasUsableProvider(providerName));

  if (usableProvider) {
    return usableProvider;
  }

  return activeProviderNames[0];
}

export function readProviderModelSelections(
  storage: Pick<Storage, 'getItem'> | undefined = getDefaultStorage(),
): ProviderModelSelectionMap {
  if (!storage) {
    return {};
  }

  const parsed = parseRecord(storage.getItem(PROVIDER_MODEL_SELECTION_STORAGE_KEY));
  const normalized: ProviderModelSelectionMap = {};

  for (const [providerName, modelName] of Object.entries(parsed)) {
    if (typeof modelName !== 'string' || modelName.trim().length === 0) {
      continue;
    }

    normalized[providerName] = modelName.trim();
  }

  return normalized;
}

export function writeProviderModelSelections(
  selections: ProviderModelSelectionMap,
  storage: Pick<Storage, 'setItem'> | undefined = getDefaultStorage(),
): void {
  if (!storage) {
    return;
  }

  storage.setItem(PROVIDER_MODEL_SELECTION_STORAGE_KEY, JSON.stringify(selections));
}

export function readProviderHistory(
  storage: Pick<Storage, 'getItem'> | undefined = getDefaultStorage(),
): ProviderHistory {
  if (!storage) {
    return [];
  }

  const raw = storage.getItem(PROVIDER_HISTORY_STORAGE_KEY);

  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
  } catch {
    return [];
  }
}

export function recordProviderHistory(
  providerName: string,
  storage: (Pick<Storage, 'getItem'> & Pick<Storage, 'setItem'>) | undefined = getDefaultStorage(),
): ProviderHistory {
  if (!providerName || !storage) {
    return [];
  }

  const current = readProviderHistory(storage).filter((entry) => entry !== providerName);
  const next = [providerName, ...current].slice(0, 8);
  storage.setItem(PROVIDER_HISTORY_STORAGE_KEY, JSON.stringify(next));

  return next;
}

export function getRememberedProviderModel(
  providerName: string,
  storage: Pick<Storage, 'getItem'> | undefined = getDefaultStorage(),
): string | undefined {
  const selections = readProviderModelSelections(storage);
  return selections[providerName];
}

export function rememberProviderModelSelection(
  providerName: string,
  modelName: string,
  storage: (Pick<Storage, 'getItem'> & Pick<Storage, 'setItem'>) | undefined = getDefaultStorage(),
): void {
  if (!providerName || !modelName || !storage) {
    return;
  }

  const selections = readProviderModelSelections(storage);
  selections[providerName] = modelName;
  writeProviderModelSelections(selections, storage);
}

export function resolvePreferredModelName(options: ResolvePreferredModelNameOptions): string | undefined {
  const { providerName, models, rememberedModelName, savedModelName } = options;
  const providerModels = models.filter((model) => model.provider === providerName);

  if (providerModels.length === 0) {
    return undefined;
  }

  const candidates = [rememberedModelName, savedModelName].filter(
    (candidate): candidate is string => typeof candidate === 'string' && candidate.length > 0,
  );

  for (const candidate of candidates) {
    if (providerModels.some((model) => model.name === candidate)) {
      return candidate;
    }
  }

  return providerModels[0].name;
}
