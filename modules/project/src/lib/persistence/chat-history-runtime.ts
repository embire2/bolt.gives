import {
  fetchHostedRuntimePreviewStatus,
  type HostedRuntimePreviewInfo,
  type HostedRuntimePreviewStatus,
} from '@bolt/runtime/lib/runtime/hosted-runtime-client';

export async function rebindHealthyHostedRuntimePreview(options: {
  sessionId: string;
  applyPreview: (preview: HostedRuntimePreviewInfo) => void;
  fetchStatus?: (sessionId: string) => Promise<HostedRuntimePreviewStatus>;
  wait?: () => Promise<void>;
  shouldContinue?: () => boolean;
}) {
  const fetchStatus = options.fetchStatus || fetchHostedRuntimePreviewStatus;
  const wait = options.wait || (() => new Promise<void>((resolve) => setTimeout(resolve, 1000)));
  let status = await fetchStatus(options.sessionId);
  const shouldContinue = options.shouldContinue || (() => true);
  const deadline = Date.now() + 15000;

  // Finishing a chat stream does not mean its final runtime start has settled.
  for (let attempt = 0; attempt < 15 && status.status === 'starting' && Date.now() < deadline; attempt++) {
    if (!shouldContinue()) {
      return false;
    }

    await wait();

    if (!shouldContinue()) {
      return false;
    }

    status = await fetchStatus(options.sessionId);
  }

  if (!shouldContinue() || status.status !== 'ready' || !status.healthy || !status.preview) {
    return false;
  }

  options.applyPreview(status.preview);

  return true;
}
