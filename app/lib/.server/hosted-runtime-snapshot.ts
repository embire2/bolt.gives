import type { FileMap } from '~/lib/.server/llm/constants';
import type { ActionAlert } from '~/types/actions';

const LOCAL_RUNTIME_BASE_URL = 'http://127.0.0.1:4321/runtime';
const PAGES_RUNTIME_BASE_URL = 'https://alpha1.bolt.gives/runtime';
const DEFAULT_HOSTED_RUNTIME_PREVIEW_VERIFY_TIMEOUT_MS = 60_000;
const DEFAULT_HOSTED_RUNTIME_PREVIEW_VERIFY_POLL_INTERVAL_MS = 750;
const TRANSIENT_PREVIEW_ERROR_GRACE_MS = 15_000;

export interface HostedRuntimePreviewInfo {
  port: number;
  baseUrl: string;
  revision?: number;
}

export interface HostedRuntimePreviewStatus {
  sessionId: string;
  preview: HostedRuntimePreviewInfo | null;
  status: 'idle' | 'starting' | 'ready' | 'error';
  healthy: boolean;
  updatedAt: string | null;
  recentLogs: string[];
  alert: ActionAlert | null;
  recovery: {
    state: 'idle' | 'running' | 'restored';
    token: number;
    message: string | null;
    updatedAt: string | null;
  } | null;
}

export interface HostedRuntimePreviewVerificationResult {
  outcome: 'ready' | 'error' | 'timeout';
  status: HostedRuntimePreviewStatus | null;
}

function isLocalHost(host: string) {
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

function isPagesHost(host: string) {
  return host === 'bolt-gives.pages.dev' || host.endsWith('.bolt-gives.pages.dev');
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseStatusUpdatedAt(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function isTransientHostedPreviewError(status: HostedRuntimePreviewStatus | null) {
  if (!status || status.status !== 'error') {
    return false;
  }

  if (status.recovery?.state === 'running') {
    return true;
  }

  if (status.recovery?.state === 'restored') {
    return true;
  }

  const logs = status.recentLogs.join('\n');
  const alertText = `${status.alert?.description || ''}\n${status.alert?.content || ''}`.trim();
  const combinedText = `${logs}\n${alertText}`;
  const updatedAt = parseStatusUpdatedAt(status.updatedAt);
  const ageMs = updatedAt ? Date.now() - updatedAt : Number.POSITIVE_INFINITY;

  if (/Port \d+ is in use, trying another one/i.test(combinedText)) {
    return true;
  }

  if (/Local:\s+http:\/\/127\.0\.0\.1:\d+\//i.test(combinedText)) {
    return true;
  }

  if (/ELIFECYCLE/i.test(combinedText) && ageMs <= TRANSIENT_PREVIEW_ERROR_GRACE_MS) {
    return true;
  }

  if (status.preview && ageMs <= TRANSIENT_PREVIEW_ERROR_GRACE_MS) {
    return true;
  }

  return false;
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

export async function fetchHostedRuntimePreviewStatusForRequest(options: {
  requestUrl: string;
  sessionId: string;
}): Promise<HostedRuntimePreviewStatus | null> {
  const { requestUrl, sessionId } = options;
  const trimmedSessionId = sessionId.trim();

  if (!trimmedSessionId) {
    return null;
  }

  const runtimeBaseUrl = resolveHostedRuntimeBaseUrlForRequest(requestUrl);
  const response = await fetch(`${runtimeBaseUrl}/sessions/${encodeURIComponent(trimmedSessionId)}/preview-status`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as HostedRuntimePreviewStatus;
}

export async function waitForHostedRuntimePreviewVerificationForRequest(options: {
  requestUrl: string;
  sessionId: string;
  timeoutMs?: number;
  pollIntervalMs?: number;
  onPoll?: (status: HostedRuntimePreviewStatus | null, elapsedMs: number) => void | Promise<void>;
}): Promise<HostedRuntimePreviewVerificationResult> {
  const timeoutMs =
    typeof options.timeoutMs === 'number' && Number.isFinite(options.timeoutMs) && options.timeoutMs > 0
      ? options.timeoutMs
      : DEFAULT_HOSTED_RUNTIME_PREVIEW_VERIFY_TIMEOUT_MS;
  const pollIntervalMs =
    typeof options.pollIntervalMs === 'number' && Number.isFinite(options.pollIntervalMs) && options.pollIntervalMs >= 0
      ? options.pollIntervalMs
      : DEFAULT_HOSTED_RUNTIME_PREVIEW_VERIFY_POLL_INTERVAL_MS;
  const startedAt = Date.now();
  let lastStatus: HostedRuntimePreviewStatus | null = null;

  while (Date.now() - startedAt <= timeoutMs) {
    lastStatus = await fetchHostedRuntimePreviewStatusForRequest(options).catch(() => null);
    await options.onPoll?.(lastStatus, Date.now() - startedAt);

    if (lastStatus?.preview && lastStatus.status === 'ready' && lastStatus.healthy) {
      return {
        outcome: 'ready',
        status: lastStatus,
      };
    }

    if (lastStatus?.status === 'error' && !isTransientHostedPreviewError(lastStatus)) {
      return {
        outcome: 'error',
        status: lastStatus,
      };
    }

    if (Date.now() - startedAt >= timeoutMs) {
      break;
    }

    await sleep(pollIntervalMs);
  }

  return {
    outcome: 'timeout',
    status: lastStatus,
  };
}
