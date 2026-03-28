import { describe, expect, it } from 'vitest';
import { resolveHostedFreeRelayOrigin } from './hosted-free-relay';

describe('resolveHostedFreeRelayOrigin', () => {
  it('enables the official relay for the public pages host when the FREE key is absent', () => {
    const relayOrigin = resolveHostedFreeRelayOrigin({
      requestUrl: new URL('https://bolt-gives.pages.dev/api/chat'),
      providerName: 'FREE',
      apiKey: '',
      runtimeEnv: {},
    });

    expect(relayOrigin).toBe('https://alpha1.bolt.gives');
  });

  it('does not relay when a local FREE key exists', () => {
    const relayOrigin = resolveHostedFreeRelayOrigin({
      requestUrl: new URL('https://bolt-gives.pages.dev/api/chat'),
      providerName: 'FREE',
      apiKey: 'sk-or-local',
      runtimeEnv: {},
    });

    expect(relayOrigin).toBeUndefined();
  });

  it('does not relay non-FREE providers', () => {
    const relayOrigin = resolveHostedFreeRelayOrigin({
      requestUrl: new URL('https://bolt-gives.pages.dev/api/chat'),
      providerName: 'OpenAI',
      apiKey: '',
      runtimeEnv: {},
    });

    expect(relayOrigin).toBeUndefined();
  });
});
