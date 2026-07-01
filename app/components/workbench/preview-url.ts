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
