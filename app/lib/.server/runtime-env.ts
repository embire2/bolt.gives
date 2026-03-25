import { isPlaceholderCredential } from '~/lib/runtime/credentials';

export type RuntimeEnv = Record<string, string>;

type EnvSource = Record<string, unknown> | undefined | null;

const SENSITIVE_ENV_KEY_PATTERN = /(API_KEY|TOKEN|SECRET|PASSWORD|PRIVATE_KEY|ACCESS_KEY|ACCESS_TOKEN)$/i;

function shouldSkipPlaceholderEnvValue(key: string, value: string, existingValue?: string): boolean {
  if (!SENSITIVE_ENV_KEY_PATTERN.test(key)) {
    return false;
  }

  if (!isPlaceholderCredential(value)) {
    return false;
  }

  if (typeof existingValue !== 'string') {
    return true;
  }

  return !isPlaceholderCredential(existingValue);
}

function assignEnv(target: RuntimeEnv, source: EnvSource) {
  if (!source) {
    return;
  }

  for (const [key, value] of Object.entries(source)) {
    if (typeof value === 'string') {
      if (shouldSkipPlaceholderEnvValue(key, value, target[key])) {
        continue;
      }

      target[key] = value;
      continue;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      target[key] = String(value);
    }
  }
}

/**
 * Build a plain string env map for server runtime use.
 * Priority is left-to-right so later sources override earlier ones.
 */
export function resolveRuntimeEnv(...sources: EnvSource[]): RuntimeEnv {
  const env: RuntimeEnv = {};
  const processEnv =
    typeof process !== 'undefined' && process && typeof process === 'object'
      ? ((process as unknown as { env?: Record<string, unknown> }).env ?? undefined)
      : undefined;

  assignEnv(env, processEnv);

  for (const source of sources) {
    assignEnv(env, source);
  }

  return env;
}
