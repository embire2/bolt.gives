import type { FileMap } from '~/lib/.server/llm/constants';

const LOCAL_RUNTIME_BASE_URL = 'http://127.0.0.1:4321/runtime';
const PAGES_RUNTIME_BASE_URL = 'https://alpha1.bolt.gives/runtime';

function isLocalHost(host: string) {
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

function isPagesHost(host: string) {
  return host === 'bolt-gives.pages.dev' || host.endsWith('.bolt-gives.pages.dev');
}

export function resolveHostedRuntimeBaseUrlForRequest(requestUrl: string) {
  const url = new URL(requestUrl);
  const host = url.hostname;

  if (isLocalHost(host)) {
    return LOCAL_RUNTIME_BASE_URL;
  }

  if (isPagesHost(host)) {
    return PAGES_RUNTIME_BASE_URL;
  }

  return `${url.protocol}//${url.host}/runtime`;
}

export async function fetchHostedRuntimeSnapshotForRequest(options: {
  requestUrl: string;
  sessionId: string;
}): Promise<FileMap | null> {
  const { requestUrl, sessionId } = options;
  const trimmedSessionId = sessionId.trim();

  if (!trimmedSessionId) {
    return null;
  }

  const runtimeBaseUrl = resolveHostedRuntimeBaseUrlForRequest(requestUrl);
  const response = await fetch(`${runtimeBaseUrl}/sessions/${encodeURIComponent(trimmedSessionId)}/snapshot`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as { files?: FileMap };
  const files = payload.files || {};

  return Object.keys(files).length > 0 ? files : null;
}
