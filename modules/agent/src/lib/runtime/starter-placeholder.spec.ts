import { describe, expect, it } from 'vitest';
import {
  hasFallbackStarterPlaceholder,
  isStarterPlaceholderAlert,
  STARTER_PLACEHOLDER_TEXT,
} from './starter-placeholder';

describe('starter-placeholder helpers', () => {
  it('detects starter placeholder only in main entry files', () => {
    expect(
      hasFallbackStarterPlaceholder({
        '/home/project/src/App.tsx': {
          type: 'file',
          isBinary: false,
          content: `<main>${STARTER_PLACEHOLDER_TEXT}</main>`,
        },
        '/home/project/README.md': {
          type: 'file',
          isBinary: false,
          content: STARTER_PLACEHOLDER_TEXT,
        },
      }),
    ).toBe(true);
  });

  it('ignores starter placeholder alerts only when the alert actually matches the starter issue', () => {
    expect(
      isStarterPlaceholderAlert({
        type: 'warning',
        title: 'Starter Placeholder Still Visible',
        description: 'The preview is still showing the built-in fallback starter.',
        content: STARTER_PLACEHOLDER_TEXT,
        source: 'preview',
      }),
    ).toBe(true);

    expect(
      isStarterPlaceholderAlert({
        type: 'error',
        title: 'Preview Error',
        description: 'Unexpected token',
        content: 'Uncaught SyntaxError',
        source: 'preview',
      }),
    ).toBe(false);
  });
});
