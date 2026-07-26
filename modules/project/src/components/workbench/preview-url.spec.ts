import { describe, expect, it } from 'vitest';
import {
  buildPreviewUrl,
  getPreviewIframeKey,
  normalizePreviewPath,
  resolvePreviewRevisionReloadUrl,
  resolvePreviewTransitionRevision,
  shouldSyncHostedPreviewTransition,
} from './preview-url';

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

  it('cache-busts a hosted iframe when the runtime moves to a new preview URL', () => {
    expect(
      resolvePreviewTransitionRevision({
        currentBaseUrl: 'https://alpha1.bolt.gives/runtime/preview/session/4101',
        currentRevision: 3,
        nextBaseUrl: 'https://alpha1.bolt.gives/runtime/preview/session/4100',
      }),
    ).toBe(4);
  });

  it('preserves an explicit runtime preview revision', () => {
    expect(
      resolvePreviewTransitionRevision({
        currentBaseUrl: 'https://alpha1.bolt.gives/runtime/preview/session/4101',
        currentRevision: 3,
        nextBaseUrl: 'https://alpha1.bolt.gives/runtime/preview/session/4100',
        nextRevision: 9,
      }),
    ).toBe(9);
  });

  it('keeps the canonical revision when later status events omit it', () => {
    expect(
      resolvePreviewTransitionRevision({
        currentBaseUrl: 'https://alpha1.bolt.gives/runtime/preview/session/4100',
        currentRevision: 4,
        nextBaseUrl: 'https://alpha1.bolt.gives/runtime/preview/session/4100',
      }),
    ).toBe(4);
  });

  it('syncs a healthy same-port preview when the runtime revision changes', () => {
    expect(
      shouldSyncHostedPreviewTransition(
        {
          port: 4100,
          baseUrl: 'https://alpha1.bolt.gives/runtime/preview/session/4100',
          revision: 1,
        },
        {
          port: 4100,
          baseUrl: 'https://alpha1.bolt.gives/runtime/preview/session/4100',
          revision: 2,
        },
        true,
      ),
    ).toBe(true);
    expect(
      shouldSyncHostedPreviewTransition(
        {
          port: 4100,
          baseUrl: 'https://alpha1.bolt.gives/runtime/preview/session/4100',
          revision: 1,
        },
        {
          port: 4100,
          baseUrl: 'https://alpha1.bolt.gives/runtime/preview/session/4100',
          revision: 2,
        },
        false,
      ),
    ).toBe(false);
  });

  it('reloads the stable iframe URL once for a completed preview revision', () => {
    const nextUrl = resolvePreviewRevisionReloadUrl({
      baseUrl: 'https://alpha1.bolt.gives/runtime/preview/session/4100',
      displayPath: '/',
      currentRevision: 1,
      nextRevision: 2,
    });

    expect(nextUrl).toBe('https://alpha1.bolt.gives/runtime/preview/session/4100/?__bolt_preview_rev=2');
    expect(getPreviewIframeKey(nextUrl || undefined)).toBe(
      getPreviewIframeKey('https://alpha1.bolt.gives/runtime/preview/session/4100/?__bolt_preview_rev=1'),
    );
    expect(
      resolvePreviewRevisionReloadUrl({
        baseUrl: 'https://alpha1.bolt.gives/runtime/preview/session/4100',
        displayPath: '/',
        currentRevision: 2,
        nextRevision: 2,
      }),
    ).toBeNull();
  });
});
