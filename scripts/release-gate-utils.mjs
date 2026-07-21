const DEFAULT_SCREENSHOT_MIN_BYTES = 60_000;
const LIGHTWEIGHT_WORKSPACE_SCREENSHOT_MIN_BYTES = 40_000;

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
