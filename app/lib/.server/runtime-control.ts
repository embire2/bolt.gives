export function getRuntimeControlBaseUrl() {
  if (typeof process !== 'undefined' && process.env?.BOLT_RUNTIME_CONTROL_URL) {
    return process.env.BOLT_RUNTIME_CONTROL_URL.replace(/\/$/, '');
  }

  return 'http://127.0.0.1:4321/runtime';
}

export async function fetchRuntimeControlJson<T>(pathname: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getRuntimeControlBaseUrl()}${pathname}`, init);

  if (!response.ok) {
    throw new Error((await response.text()) || `Runtime control request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}
