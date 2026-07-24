const PREVIEW_REVISION_PARAM = '__bolt_preview_rev';

export function normalizePreviewPath(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return '/';
  }

  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

export function buildPreviewUrl(baseUrl: string, displayPath: string, revision = 0) {
  const normalizedPath = normalizePreviewPath(displayPath);
  const previewBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const target = new URL(normalizedPath === '/' ? '' : normalizedPath.slice(1), previewBase);

  if (revision > 0) {
    target.searchParams.set(PREVIEW_REVISION_PARAM, String(revision));
  } else {
    target.searchParams.delete(PREVIEW_REVISION_PARAM);
  }

  return target.toString();
}

export function getPreviewIframeKey(iframeUrl: string | undefined) {
  if (!iframeUrl) {
    return 'preview';
  }

  try {
    const target = new URL(iframeUrl);
    target.searchParams.delete(PREVIEW_REVISION_PARAM);

    return target.toString();
  } catch {
    return iframeUrl;
  }
}

export function resolvePreviewTransitionRevision(options: {
  currentBaseUrl?: string;
  currentRevision?: number;
  nextBaseUrl: string;
  nextRevision?: number;
}) {
  if (typeof options.nextRevision === 'number') {
    return options.nextRevision;
  }

  if (options.currentBaseUrl && options.currentBaseUrl !== options.nextBaseUrl) {
    return (options.currentRevision || 0) + 1;
  }

  return options.currentRevision;
}

interface PreviewTransition {
  port: number;
  baseUrl: string;
  revision?: number;
}

export function shouldSyncHostedPreviewTransition(
  currentPreview: PreviewTransition | undefined,
  nextPreview: PreviewTransition,
  allowRevisionChange: boolean,
) {
  return (
    !currentPreview ||
    currentPreview.baseUrl !== nextPreview.baseUrl ||
    currentPreview.port !== nextPreview.port ||
    (allowRevisionChange && currentPreview.revision !== nextPreview.revision)
  );
}

export function resolvePreviewRevisionReloadUrl(options: {
  baseUrl: string;
  displayPath: string;
  currentRevision: number;
  nextRevision: number;
}) {
  if (options.currentRevision === options.nextRevision) {
    return null;
  }

  return buildPreviewUrl(options.baseUrl, options.displayPath, options.nextRevision);
}
