import type { ActionAlert } from '~/types/actions';

const STARTER_PLACEHOLDER_RE = /Your fallback starter is ready\./i;
const DEV_SERVER_READY_RE =
  /\b(?:VITE v[\d.]+\s+ready in|ready - started server on|Local:\s+http:\/\/(?:127\.0\.0\.1|localhost|0\.0\.0\.0|\[::1\]):\d+)/i;
const PREVIEW_ERROR_PATTERNS = [
  /\[plugin:vite:[^\]]+\]/i,
  /Pre-transform error/i,
  /Transform failed with \d+ error/i,
  /Failed to resolve import/i,
  /Failed to scan for dependencies from entries/i,
  /Unexpected token/i,
  /Expected [^\n]+ but found end of file/i,
  /PREVIEW_UNCAUGHT_EXCEPTION/i,
  /PREVIEW_UNHANDLED_REJECTION/i,
  /ELIFECYCLE/i,
  /Command failed/i,
  /error when starting dev server/i,
  /Uncaught\s+(?:Error|TypeError|ReferenceError|SyntaxError|RangeError)/i,
  /Unhandled\s+Promise\s+Rejection/i,
];

function normalizePreviewText(value: string | null | undefined) {
  return (value || '')
    .replace(/\u0000/g, '')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function stripAnsi(value: string) {
  return value.replace(/\u001B\[[0-9;]*m/g, '');
}

function isDetachedDevServerLifecycleNoise(combinedText: string) {
  const normalized = stripAnsi(combinedText);
  const hasLifecycleFailure = /\bELIFECYCLE\b/i.test(normalized) || /\bCommand failed\b/i.test(normalized);

  if (!hasLifecycleFailure || !DEV_SERVER_READY_RE.test(normalized)) {
    return false;
  }

  const hardFailurePatterns = PREVIEW_ERROR_PATTERNS.filter(
    (pattern) => !/\bELIFECYCLE\b/i.test(pattern.source) && !/\bCommand failed\b/i.test(pattern.source),
  );

  return !hardFailurePatterns.some((pattern) => pattern.test(normalized));
}

function pickPreviewDescription(combinedText: string) {
  const lines = stripAnsi(combinedText)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const preferredMatchers = [
    /\[plugin:vite:[^\]]+\].+/i,
    /Pre-transform error.+/i,
    /Transform failed with \d+ error/i,
    /Failed to resolve import.+/i,
    /Failed to scan for dependencies.+/i,
    /Missing ["'][^"']+["'] specifier.+/i,
    /Unexpected token.+/i,
    /Expected .+ but found.+/i,
    /Uncaught\s+(?:Error|TypeError|ReferenceError|SyntaxError|RangeError).+/i,
    /Unhandled\s+Promise\s+Rejection.+/i,
  ];

  for (const matcher of preferredMatchers) {
    const match = lines.find((line) => matcher.test(line));

    if (match) {
      return match;
    }
  }

  const fileLocationLine = lines.find((line) => /\/src\/.+:\d+:\d+/i.test(line) || /file:\s*\/.+:\d+:\d+/i.test(line));

  if (fileLocationLine) {
    return fileLocationLine;
  }

  return lines[0] || 'Preview failed to compile or run.';
}

export function extractPreviewAlertFromText(rawText: string | null | undefined): ActionAlert | null {
  const combinedText = normalizePreviewText(rawText);

  if (!combinedText) {
    return null;
  }

  if (STARTER_PLACEHOLDER_RE.test(combinedText)) {
    return {
      type: 'warning',
      title: 'Starter Placeholder Still Visible',
      description: 'The preview is still showing the built-in fallback starter instead of the requested app.',
      content: combinedText.slice(0, 5000),
      source: 'preview',
    };
  }

  if (isDetachedDevServerLifecycleNoise(combinedText)) {
    return null;
  }

  if (!PREVIEW_ERROR_PATTERNS.some((pattern) => pattern.test(combinedText))) {
    return null;
  }

  return {
    type: 'error',
    title: 'Preview Error',
    description: pickPreviewDescription(combinedText).slice(0, 220),
    content: combinedText.slice(0, 5000),
    source: 'preview',
  };
}

function readOverlayText(doc: Document): string {
  const overlays = Array.from(doc.querySelectorAll('vite-error-overlay'));
  const fragments: string[] = [];

  for (const overlay of overlays) {
    const shadowRoot = (overlay as HTMLElement & { shadowRoot?: ShadowRoot | null }).shadowRoot;
    const shadowText = normalizePreviewText(shadowRoot?.textContent);

    if (shadowText) {
      fragments.push(shadowText);
    }

    const overlayText = normalizePreviewText((overlay as HTMLElement).innerText || overlay.textContent);

    if (overlayText) {
      fragments.push(overlayText);
    }
  }

  return normalizePreviewText(fragments.join('\n\n'));
}

export function extractPreviewAlertFromDocument(doc: Document): ActionAlert | null {
  const overlayText = readOverlayText(doc);
  const bodyText = normalizePreviewText(doc.body?.innerText || doc.body?.textContent || '');
  const documentText = normalizePreviewText(doc.documentElement?.textContent || '');

  return extractPreviewAlertFromText([overlayText, bodyText, documentText].filter(Boolean).join('\n\n'));
}
