import {
  fetchHostedRuntimePreviewStatus,
  type HostedRuntimePreviewInfo,
  type HostedRuntimePreviewStatus,
} from '@bolt/runtime/lib/runtime/hosted-runtime-client';

export async function rebindHealthyHostedRuntimePreview(options: {
  sessionId: string;
  applyPreview: (preview: HostedRuntimePreviewInfo) => void;
  fetchStatus?: (sessionId: string) => Promise<HostedRuntimePreviewStatus>;
}) {
  const status = await (options.fetchStatus || fetchHostedRuntimePreviewStatus)(options.sessionId);

  if (status.status !== 'ready' || !status.healthy || !status.preview) {
    return false;
  }

  options.applyPreview(status.preview);

  return true;
}
