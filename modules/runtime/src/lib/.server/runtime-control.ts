const LOCAL_RUNTIME_CONTROL_BASE_URL = 'http://127.0.0.1:4321/runtime';
const CANONICAL_RUNTIME_CONTROL_BASE_URL = 'https://bolt.gives/runtime';

class RuntimeControlError extends Error {
  constructor(
    message: string,
    readonly cloudflareDirectIpAccess = false,
  ) {
    super(message);
    this.name = 'RuntimeControlError';
  }
}

export function getRuntimeControlBaseUrl() {
  if (typeof process !== 'undefined' && process.env?.BOLT_RUNTIME_CONTROL_URL) {
    return process.env.BOLT_RUNTIME_CONTROL_URL.replace(/\/$/, '');
  }

  return LOCAL_RUNTIME_CONTROL_BASE_URL;
}

export async function fetchRuntimeControlJson<T>(pathname: string, init?: RequestInit): Promise<T> {
  const baseUrl = getRuntimeControlBaseUrl();

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
