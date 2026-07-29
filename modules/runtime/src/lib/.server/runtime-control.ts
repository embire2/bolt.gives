const LOCAL_RUNTIME_CONTROL_BASE_URL = 'http://127.0.0.1:4321/runtime';
const CANONICAL_RUNTIME_CONTROL_BASE_URL = 'https://bolt.gives/runtime';
type RuntimeEnv = Record<string, string | undefined>;

class RuntimeControlError extends Error {
  constructor(
    message: string,
    readonly cloudflareDirectIpAccess = false,
  ) {
    super(message);
    this.name = 'RuntimeControlError';
  }
}

export function getRuntimeControlBaseUrl(runtimeEnv: RuntimeEnv = {}) {
  const configured =
    runtimeEnv.BOLT_RUNTIME_CONTROL_URL?.trim() ||
    runtimeEnv.BOLT_RUNTIME_CONTROL_PUBLIC_URL?.trim() ||
    (typeof process !== 'undefined'
      ? process.env?.BOLT_RUNTIME_CONTROL_URL?.trim() || process.env?.BOLT_RUNTIME_CONTROL_PUBLIC_URL?.trim()
      : '');

  if (configured) {
    return configured.replace(/\/$/, '');
  }

  return LOCAL_RUNTIME_CONTROL_BASE_URL;
}

export async function fetchRuntimeControlJson<T>(
  pathname: string,
  init?: RequestInit,
  runtimeEnv: RuntimeEnv = {},
): Promise<T> {
  const baseUrl = getRuntimeControlBaseUrl(runtimeEnv);

  try {
    return await fetchRuntimeControlJsonFromBase<T>(baseUrl, pathname, init);
  } catch (error) {
    if (
      baseUrl === LOCAL_RUNTIME_CONTROL_BASE_URL &&
      error instanceof RuntimeControlError &&
      error.cloudflareDirectIpAccess
    ) {
      return await fetchRuntimeControlJsonFromBase<T>(CANONICAL_RUNTIME_CONTROL_BASE_URL, pathname, init);
    }

    throw error;
  }
}

async function fetchRuntimeControlJsonFromBase<T>(baseUrl: string, pathname: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${pathname}`, init);

  if (!response.ok) {
    const responseText = await response.text();
    throw new RuntimeControlError(
      responseText || `Runtime control request failed with status ${response.status}`,
      /error code:\s*1003/i.test(responseText),
    );
  }

  return (await response.json()) as T;
}
