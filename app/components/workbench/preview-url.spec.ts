import { describe, expect, it } from 'vitest';
import { buildPreviewUrl, getPreviewIframeKey, normalizePreviewPath } from './preview-url';

describe('preview URL handling', () => {
  it('normalizes preview paths before building iframe URLs', () => {
    expect(normalizePreviewPath('')).toBe('/');
    expect(normalizePreviewPath('dashboard')).toBe('/dashboard');
    expect(normalizePreviewPath('/settings')).toBe('/settings');
  });

  it('adds preview revisions as cache-busting URL state', () => {
    expect(buildPreviewUrl('https://alpha1.bolt.gives/runtime/preview/session/4100', '/', 3)).toBe(
      'https://alpha1.bolt.gives/runtime/preview/session/4100/?__bolt_preview_rev=3',
    );
  });

  it('keeps the iframe key stable across revision-only preview updates', () => {
    const firstRevision = buildPreviewUrl('https://alpha1.bolt.gives/runtime/preview/session/4100', '/', 1);
    const nextRevision = buildPreviewUrl('https://alpha1.bolt.gives/runtime/preview/session/4100', '/', 2);

    expect(getPreviewIframeKey(firstRevision)).toBe(getPreviewIframeKey(nextRevision));
  });

  it('changes the iframe key when the rendered preview path changes', () => {
    const home = buildPreviewUrl('https://alpha1.bolt.gives/runtime/preview/session/4100', '/', 1);
    const dashboard = buildPreviewUrl('https://alpha1.bolt.gives/runtime/preview/session/4100', '/dashboard', 1);

    expect(getPreviewIframeKey(home)).not.toBe(getPreviewIframeKey(dashboard));
  });
});
