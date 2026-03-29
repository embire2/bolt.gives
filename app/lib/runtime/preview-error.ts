import type { ActionAlert } from '~/types/actions';

const PREVIEW_ERROR_PATTERNS = [
  /\[plugin:vite:[^\]]+\]/i,
  /Failed to resolve import/i,
  /Unexpected token/i,
  /PREVIEW_UNCAUGHT_EXCEPTION/i,
  /PREVIEW_UNHANDLED_REJECTION/i,
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
  const combinedText = normalizePreviewText([overlayText, bodyText, documentText].filter(Boolean).join('\n\n'));

  if (!combinedText) {
    return null;
  }

  if (!PREVIEW_ERROR_PATTERNS.some((pattern) => pattern.test(combinedText))) {
    return null;
  }

  const [firstLine = 'Preview failed to compile or run.'] = combinedText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  return {
    type: 'error',
    title: 'Preview Error',
    description: firstLine.slice(0, 220),
    content: combinedText.slice(0, 5000),
    source: 'preview',
  };
}
