import { describe, expect, it } from 'vitest';

import {
  detectPromptSurface,
  inferExpectedSurface,
  matchesExpectedSurface,
  PROMPT_SURFACE_SELECTORS,
} from './post-deploy-health-check-utils.mjs';

function mockPage(visibleSelectors: Set<string>, throwingSelectors = new Set<string>()) {
  return {
    locator(selector: string) {
      return {
        first() {
          return {
            async isVisible() {
              if (throwingSelectors.has(selector)) {
                throw new Error(`selector failed: ${selector}`);
              }

              return visibleSelectors.has(selector);
            },
          };
        },
      };
    },
  };
}

describe('post-deploy health check prompt detection', () => {
  it('accepts the current prompt surface even when the old exact placeholder is absent', async () => {
    await expect(detectPromptSurface(mockPage(new Set(['textarea'])) as any)).resolves.toBe(true);
  });

  it('keeps checking fallback selectors when an earlier selector throws', async () => {
    await expect(
      detectPromptSurface(
        mockPage(new Set(['[contenteditable="true"][role="textbox"]']), new Set([PROMPT_SURFACE_SELECTORS[0]])) as any,
      ),
    ).resolves.toBe(true);
  });

  it('returns false when no prompt-like surface is visible', async () => {
    await expect(detectPromptSurface(mockPage(new Set()) as any)).resolves.toBe(false);
  });
});

describe('post-deploy health check surface detection', () => {
  it('classifies chat, admin, and managed-instance URLs', () => {
    expect(inferExpectedSurface('https://alpha1.bolt.gives')).toBe('chat');
    expect(inferExpectedSurface('https://admin.bolt.gives')).toBe('admin');
    expect(inferExpectedSurface('https://create.bolt.gives')).toBe('managed-instances');
    expect(inferExpectedSurface('https://alpha1.bolt.gives/managed-instances')).toBe('managed-instances');
  });

  it('accepts expected admin and managed-instance control-plane content', () => {
    expect(matchesExpectedSurface('admin', { title: 'Tenant Admin | bolt.gives' })).toBe(true);
    expect(matchesExpectedSurface('managed-instances', { bodyText: 'Managed Cloudflare instance registration' })).toBe(
      true,
    );
    expect(matchesExpectedSurface('managed-instances', { bodyText: 'Plain landing page' })).toBe(false);
  });
});
