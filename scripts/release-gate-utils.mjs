const DEFAULT_SCREENSHOT_MIN_BYTES = 60_000;
const LIGHTWEIGHT_WORKSPACE_SCREENSHOT_MIN_BYTES = 40_000;

export function hasRenderedServerError(html) {
  // Release notes can describe an old server error without being an error page.
  const surfaces = String(html).matchAll(/<(title|h[1-6]|summary)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi);

  for (const [, , content] of surfaces) {
    const text = content
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (/\b(?:server error|error details|custom error|application error)\b/i.test(text)) {
      return true;
    }
  }

  return false;
}

export function getReleaseHomeReadinessMarkers(versionLabel) {
  return [String(versionLabel), 'the transparent ai coding workspace', 'contribute on github', 'real screenshots'];
}

export function getScreenshotMinimumBytes(filePath) {
  const fileName = String(filePath || '')
    .split(/[\\/]/)
    .pop();

  if (fileName === 'system-in-action.png') {
    return LIGHTWEIGHT_WORKSPACE_SCREENSHOT_MIN_BYTES;
  }

  return DEFAULT_SCREENSHOT_MIN_BYTES;
}
