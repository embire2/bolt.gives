// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { extractPreviewAlertFromDocument } from './preview-error';

describe('extractPreviewAlertFromDocument', () => {
  it('reads Vite overlay errors from shadow DOM', () => {
    const overlay = document.createElement('vite-error-overlay');
    const shadowRoot = overlay.attachShadow({ mode: 'open' });
    shadowRoot.innerHTML = `<pre>[plugin:vite:react-babel] /srv/runtime/src/App.tsx: Unexpected token (103:0)</pre>`;
    document.body.appendChild(overlay);

    const alert = extractPreviewAlertFromDocument(document);

    expect(alert?.source).toBe('preview');
    expect(alert?.title).toBe('Preview Error');
    expect(alert?.description).toContain('[plugin:vite:react-babel]');
    expect(alert?.content).toContain('Unexpected token');
  });

  it('reads uncaught runtime exceptions from preview body text', () => {
    document.body.innerHTML = '<div>PREVIEW_UNCAUGHT_EXCEPTION: Uncaught TypeError: x is not a function</div>';

    const alert = extractPreviewAlertFromDocument(document);

    expect(alert?.source).toBe('preview');
    expect(alert?.description).toContain('PREVIEW_UNCAUGHT_EXCEPTION');
  });

  it('returns null for healthy preview content', () => {
    document.body.innerHTML = '<main><h1>Working Preview</h1><p>Hello</p></main>';

    const alert = extractPreviewAlertFromDocument(document);

    expect(alert).toBeNull();
  });
});
