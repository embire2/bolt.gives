import { describe, expect, it } from 'vitest';
import { resolveHostedRuntimeBaseUrl } from './hosted-runtime-client';

describe('hosted runtime client', () => {
  it('uses the local runtime service for localhost', () => {
    expect(
      resolveHostedRuntimeBaseUrl({
        host: 'localhost',
        protocol: 'http:',
        originHost: 'localhost:5173',
      }),
    ).toBe('http://127.0.0.1:4321/runtime');
  });

  it('routes pages hosts to alpha1 runtime', () => {
    expect(
      resolveHostedRuntimeBaseUrl({
        host: 'bolt-gives.pages.dev',
        protocol: 'https:',
        originHost: 'bolt-gives.pages.dev',
      }),
    ).toBe('https://alpha1.bolt.gives/runtime');
  });

  it('uses same-host runtime for hosted instances', () => {
    expect(
      resolveHostedRuntimeBaseUrl({
        host: 'alpha1.bolt.gives',
        protocol: 'https:',
        originHost: 'alpha1.bolt.gives',
      }),
    ).toBe('https://alpha1.bolt.gives/runtime');
  });
});
