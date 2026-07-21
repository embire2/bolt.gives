import { describe, expect, it } from 'vitest';
import {
  buildRuntimeProxyHeaders,
  buildRuntimeProxyTargetUrl,
  isMissingStaticAssetRequest,
  normalizeRuntimeControlBaseUrl,
  shouldProxyRuntimeRequest,
} from '../functions/[[path]]';

describe('Cloudflare Pages runtime proxy helpers', () => {
  it('recognizes runtime routes that must be proxied instead of handled by Remix', () => {
    expect(shouldProxyRuntimeRequest('/runtime')).toBe(true);
    expect(shouldProxyRuntimeRequest('/runtime/sessions/session-1/preview-status')).toBe(true);
    expect(shouldProxyRuntimeRequest('/api/chat')).toBe(false);
  });

  it('maps instance-host runtime URLs to the central runtime target', () => {
    expect(
      buildRuntimeProxyTargetUrl(
        'https://clinic-one.pages.dev/runtime/preview/session-1/4100/src/main.tsx?import',
        'https://bolt.gives/runtime',
      ),
    ).toBe('https://bolt.gives/runtime/preview/session-1/4100/src/main.tsx?import');

    expect(normalizeRuntimeControlBaseUrl('https://bolt.gives')).toBe('https://bolt.gives/runtime');
  });

  it('preserves the managed instance origin for preview URL generation', () => {
    const request = new Request('https://clinic-one.pages.dev/runtime/sessions/session-1/command', {
      method: 'POST',
      headers: {
        Host: 'clinic-one.pages.dev',
        'Content-Length': '123',
        'X-Test': 'kept',
      },
    });
    const headers = buildRuntimeProxyHeaders(request);

    expect(headers.get('x-bolt-public-origin')).toBe('https://clinic-one.pages.dev');
    expect(headers.get('x-forwarded-host')).toBe('clinic-one.pages.dev');
    expect(headers.get('x-forwarded-proto')).toBe('https');
    expect(headers.get('x-test')).toBe('kept');
    expect(headers.has('host')).toBe(false);
    expect(headers.has('content-length')).toBe(false);
  });

  it('short-circuits missing static assets before Remix SSR', () => {
    expect(isMissingStaticAssetRequest(new Request('https://alpha1.bolt.gives/app-screenshot.png'))).toBe(true);
    expect(isMissingStaticAssetRequest(new Request('https://alpha1.bolt.gives/assets/missing.js'))).toBe(true);
    expect(isMissingStaticAssetRequest(new Request('https://alpha1.bolt.gives/chat'))).toBe(false);
    expect(
      isMissingStaticAssetRequest(
        new Request('https://alpha1.bolt.gives/api/export.pdf', {
          method: 'POST',
        }),
      ),
    ).toBe(false);
  });
});
