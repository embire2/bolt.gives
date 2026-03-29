import type { ModelInfo } from '~/lib/modules/llm/types';
import { normalizeCredential } from '~/lib/runtime/credentials';

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
  configuredProviderNames?: string[];
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
    const region = normalizeCredential(parsed.region);
    const accessKeyId = normalizeCredential(parsed.accessKeyId);
    const secretAccessKey = normalizeCredential(parsed.secretAccessKey);

    return Boolean(region && accessKeyId && secretAccessKey);
  } catch {
    return false;
  }
}

const PROVIDER_API_KEY_VALIDATORS: Record<string, ProviderApiKeyValidator> = {
  AmazonBedrock: isValidBedrockConfig,
};

function isNonGeneralPurposeModel(name: string): boolean {
  const normalized = name.toLowerCase();
  const patterns = ['image', 'dall', 'whisper', 'tts', 'audio', 'transcribe', 'embedding', 'moderation', 'realtime'];

  return patterns.some((pattern) => normalized.includes(pattern));
}

function scorePreferredModel(model: ModelInfo): number {
  const normalized = model.name.toLowerCase();

  if (isNonGeneralPurposeModel(normalized)) {
    return -1000;
  }

  let score = 0;

  if (normalized.includes('gpt-5.4')) {
    score += 900;
  }

  if (normalized.includes('gpt-5.2-codex')) {
    score += 850;
  }

  if (normalized.includes('gpt-5-codex')) {
    score += 825;
  }

  if (normalized.includes('codex')) {
    score += 800;
  }

  if (normalized.includes('gpt-5')) {
    score += 760;
  }

  if (normalized.includes('claude-3-7')) {
    score += 720;
  }

  if (normalized.includes('claude-3-5-sonnet')) {
    score += 700;
  }

  if (normalized.includes('claude')) {
    score += 660;
  }

  if (normalized.includes('gpt-4.1')) {
    score += 640;
  }

  if (normalized.includes('gpt-4o')) {
    score += 620;
  }

  if (normalized.includes('o4') || normalized.includes('o3') || normalized.includes('o1')) {
    score += 600;
  }

  if (normalized.includes('mini')) {
    score -= 30;
  }

  if (normalized.includes('preview')) {
    score -= 10;
  }

  score += Math.min(Math.floor((model.maxTokenAllowed || 0) / 1000), 80);
  score += Math.min(Math.floor((model.maxCompletionTokens || 0) / 1000), 40);

  return score;
}

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
    const credential = normalizeCredential(value);

    if (!credential) {
      continue;
    }

    normalized[providerName] = credential;
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
  const normalizedKey = normalizeCredential(apiKeys[providerName]);

  if (!normalizedKey) {
    return false;
  }

  const validator = PROVIDER_API_KEY_VALIDATORS[providerName];

  if (!validator) {
    return true;
  }

  return validator(normalizedKey);
}

export function pickPreferredProviderName(options: PickPreferredProviderNameOptions): string | undefined {
  const {
    activeProviderNames,
    apiKeys,
    localProviderNames = [],
    configuredProviderNames = [],
    savedProviderName,
    lastConfiguredProviderName,
    fallbackProviderName,
  } = options;

  if (activeProviderNames.length === 0) {
    return undefined;
  }

  const activeSet = new Set(activeProviderNames);
  const localSet = new Set(localProviderNames);
  const configuredSet = new Set(configuredProviderNames);
  const hasUsableProvider = (providerName: string): boolean =>
    localSet.has(providerName) || configuredSet.has(providerName) || hasUsableApiKey(apiKeys, providerName);
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

  const rankedModels = [...providerModels].sort((a, b) => scorePreferredModel(b) - scorePreferredModel(a));

  return rankedModels[0]?.name;
}
