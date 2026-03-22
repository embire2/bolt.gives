export type RuntimeEnv = Record<string, string>;

type EnvSource = Record<string, unknown> | undefined | null;

function assignEnv(target: RuntimeEnv, source: EnvSource) {
  if (!source) {
    return;
  }

  for (const [key, value] of Object.entries(source)) {
    if (typeof value === 'string') {
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
