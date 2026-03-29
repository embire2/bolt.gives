import type { FileMap } from '~/lib/stores/files';
import type { ActionAlert } from '~/types/actions';

const LOCAL_RUNTIME_BASE_URL = 'http://127.0.0.1:4321/runtime';
const PAGES_RUNTIME_BASE_URL = 'https://alpha1.bolt.gives/runtime';

export interface HostedRuntimePreviewInfo {
  port: number;
  baseUrl: string;
  revision?: number;
}

export interface HostedRuntimeCommandResult {
  output: string;
  exitCode: number;
  preview?: HostedRuntimePreviewInfo;
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

export interface HostedPreviewReloadDecision {
  shouldReload: boolean;
  reloadKey: string | null;
}

export type HostedRuntimeEvent =
  | { type: 'stdout'; chunk: string }
  | { type: 'stderr'; chunk: string }
  | { type: 'status'; message: string }
  | { type: 'ready'; preview: HostedRuntimePreviewInfo }
  | { type: 'exit'; exitCode: number }
  | { type: 'error'; error: string };

export type HostedRuntimeCommandKind = 'shell' | 'start';

function isLocalHost(host: string) {
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

function isPagesHost(host: string) {
  return host === 'bolt-gives.pages.dev' || host.endsWith('.bolt-gives.pages.dev');
}

export function resolveHostedRuntimeBaseUrl(options: { host: string; protocol: string; originHost?: string }) {
  const { host, protocol, originHost = host } = options;

  if (isLocalHost(host)) {
    return LOCAL_RUNTIME_BASE_URL;
  }

  if (isPagesHost(host)) {
    return PAGES_RUNTIME_BASE_URL;
  }

  const httpProto = protocol === 'https:' ? 'https:' : 'http:';

  return `${httpProto}//${originHost}/runtime`;
}

export function getHostedRuntimeBaseUrl() {
  if (typeof window === 'undefined') {
    return LOCAL_RUNTIME_BASE_URL;
  }

  return resolveHostedRuntimeBaseUrl({
    host: window.location.hostname,
    protocol: window.location.protocol,
    originHost: window.location.host,
  });
}

export function extractHostedRuntimeSessionIdFromPreviewBaseUrl(baseUrl: string | null | undefined): string | null {
  if (typeof baseUrl !== 'string' || !baseUrl.trim()) {
    return null;
  }

  try {
    const url = new URL(baseUrl);
    const match = url.pathname.match(/\/runtime\/preview\/([^/]+)\/\d+(?:\/|$)/);

    return match?.[1] || null;
  } catch {
    return null;
  }
}

export function shouldReloadHostedPreviewIframe(options: {
  frameLocation: string | null | undefined;
  targetUrl: string;
  status: Pick<HostedRuntimePreviewStatus, 'healthy' | 'updatedAt'>;
  lastReloadKey?: string | null;
}): HostedPreviewReloadDecision {
  const frameLocation = String(options.frameLocation || '').trim();
  const reloadKey = `${options.targetUrl}::${options.status.updatedAt || 'pending'}`;
  const isBlockedFrame =
    !frameLocation || frameLocation === 'about:blank' || frameLocation.startsWith('chrome-error://');

  if (!options.status.healthy || !isBlockedFrame) {
    return {
      shouldReload: false,
      reloadKey: null,
    };
  }

  if (options.lastReloadKey === reloadKey) {
    return {
      shouldReload: false,
      reloadKey,
    };
  }

  return {
    shouldReload: true,
    reloadKey,
  };
}

export function isHostedRuntimeEnabled() {
  if (typeof window === 'undefined') {
    return false;
  }

  return !isLocalHost(window.location.hostname);
}

export async function syncHostedRuntimeWorkspace(options: { sessionId: string; files: FileMap; prune?: boolean }) {
  const { sessionId, files, prune = false } = options;
  const response = await fetch(`${getHostedRuntimeBaseUrl()}/sessions/${encodeURIComponent(sessionId)}/sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ files, prune }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Hosted runtime sync failed with status ${response.status}`);
  }
}

export async function runHostedRuntimeCommand(options: {
  sessionId: string;
  command: string;
  kind: HostedRuntimeCommandKind;
  onEvent?: (event: HostedRuntimeEvent) => void;
}): Promise<HostedRuntimeCommandResult> {
  const { sessionId, command, kind, onEvent } = options;
  const response = await fetch(`${getHostedRuntimeBaseUrl()}/sessions/${encodeURIComponent(sessionId)}/command`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ command, kind }),
  });

  if (!response.ok || !response.body) {
    const message = await response.text();
    throw new Error(message || `Hosted runtime command failed with status ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let output = '';
  let exitCode = 1;
  let preview: HostedRuntimePreviewInfo | undefined;

  while (true) {
    const { value, done } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();

      if (!trimmed) {
        continue;
      }

      let event: HostedRuntimeEvent;

      try {
        event = JSON.parse(trimmed) as HostedRuntimeEvent;
      } catch {
        continue;
      }

      onEvent?.(event);

      if (event.type === 'stdout' || event.type === 'stderr') {
        output += event.chunk;
      } else if (event.type === 'ready') {
        preview = event.preview;
      } else if (event.type === 'exit') {
        exitCode = event.exitCode;
      } else if (event.type === 'error') {
        throw new Error(event.error);
      }
    }
  }

  return {
    output,
    exitCode,
    preview,
  };
}

export async function fetchHostedRuntimePreviewStatus(sessionId: string): Promise<HostedRuntimePreviewStatus> {
  const response = await fetch(
    `${getHostedRuntimeBaseUrl()}/sessions/${encodeURIComponent(sessionId)}/preview-status`,
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    },
  );

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Hosted runtime preview status failed with status ${response.status}`);
  }

  return (await response.json()) as HostedRuntimePreviewStatus;
}

export async function fetchHostedRuntimeSnapshot(sessionId: string): Promise<FileMap> {
  const response = await fetch(`${getHostedRuntimeBaseUrl()}/sessions/${encodeURIComponent(sessionId)}/snapshot`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Hosted runtime snapshot failed with status ${response.status}`);
  }

  const payload = (await response.json()) as { files?: FileMap };

  return payload.files || {};
}

export async function reportHostedRuntimePreviewAlert(sessionId: string, alert: ActionAlert) {
  const response = await fetch(`${getHostedRuntimeBaseUrl()}/sessions/${encodeURIComponent(sessionId)}/preview-alert`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ alert }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Hosted runtime preview alert failed with status ${response.status}`);
  }
}
