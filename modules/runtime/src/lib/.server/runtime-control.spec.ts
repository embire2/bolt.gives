import { describe, expect, it } from 'vitest';
import { getRuntimeControlBaseUrl } from './runtime-control';

describe('runtime control environment resolution', () => {
  it('prefers request-scoped Cloudflare bindings over process defaults', () => {
    expect(
      getRuntimeControlBaseUrl({
        BOLT_RUNTIME_CONTROL_PUBLIC_URL: 'https://alpha1.bolt.gives/runtime/',
      }),
    ).toBe('https://alpha1.bolt.gives/runtime');
  });

  it('uses an explicit internal runtime URL before the public URL', () => {
    expect(
      getRuntimeControlBaseUrl({
        BOLT_RUNTIME_CONTROL_URL: 'http://127.0.0.1:4321/runtime/',
        BOLT_RUNTIME_CONTROL_PUBLIC_URL: 'https://bolt.gives/runtime',
      }),
    ).toBe('http://127.0.0.1:4321/runtime');
  });
});
