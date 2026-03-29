// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { extractPreviewAlertFromDocument, extractPreviewAlertFromText } from './preview-error';

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

describe('extractPreviewAlertFromText', () => {
  it('returns a preview alert when the fallback starter is still visible', () => {
    const alert = extractPreviewAlertFromText('Vite + React\nYour fallback starter is ready.');

    expect(alert?.source).toBe('preview');
    expect(alert?.title).toBe('Starter Placeholder Still Visible');
    expect(alert?.description).toContain('built-in fallback starter');
  });

  it('returns a preview alert for build-time Vite output', () => {
    const alert = extractPreviewAlertFromText(
      '[plugin:vite:import-analysis] Missing "./index.css" specifier in "@fullcalendar/core" package',
    );

    expect(alert?.source).toBe('preview');
    expect(alert?.description).toContain('[plugin:vite:import-analysis]');
  });

  it('returns a preview alert for esbuild syntax failures surfaced by Vite', () => {
    const alert = extractPreviewAlertFromText(
      [
        '16:46:14 [vite] Pre-transform error: Transform failed with 1 error:',
        '/srv/runtime/src/App.jsx:2:0: ERROR: Expected identifier but found end of file',
        'Error:   Failed to scan for dependencies from entries:',
      ].join('\n'),
    );

    expect(alert?.source).toBe('preview');
    expect(alert?.description).toContain('Pre-transform error');
    expect(alert?.content).toContain('Expected identifier but found end of file');
  });

  it('returns null for healthy preview text', () => {
    expect(extractPreviewAlertFromText('Preview healthy and serving application output.')).toBeNull();
  });
});
