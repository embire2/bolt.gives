import { describe, expect, it } from 'vitest';
import {
  getHostedFreeRelaySecret,
  isHostedFreeRelayAuthorized,
  resolveHostedFreeRelayOrigin,
} from './hosted-free-relay';

describe('resolveHostedFreeRelayOrigin', () => {
  it('does not enable the relay without a relay secret', () => {
    const relayOrigin = resolveHostedFreeRelayOrigin({
      requestUrl: new URL('https://bolt-gives.pages.dev/api/chat'),
      providerName: 'FREE',
      apiKey: '',
      runtimeEnv: {},
    });

    expect(relayOrigin).toBeUndefined();
  });

  it('enables the official relay for the public pages host when the relay secret is present', () => {
    const relayOrigin = resolveHostedFreeRelayOrigin({
      requestUrl: new URL('https://bolt-gives.pages.dev/api/chat'),
      providerName: 'FREE',
      apiKey: '',
      runtimeEnv: { BOLT_HOSTED_FREE_RELAY_SECRET: 'relay-secret' },
    });

    expect(relayOrigin).toBe('https://alpha1.bolt.gives');
  });

  it('enables the official relay for managed pages.dev subdomains when the relay secret is present', () => {
    const relayOrigin = resolveHostedFreeRelayOrigin({
      requestUrl: new URL('https://team2-6og.pages.dev/api/chat'),
      providerName: 'FREE',
      apiKey: '',
      runtimeEnv: { BOLT_HOSTED_FREE_RELAY_SECRET: 'relay-secret' },
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

  it('prefers the configured relay secret aliases', () => {
    expect(getHostedFreeRelaySecret({ BOLT_HOSTED_FREE_RELAY_SECRET: 'secret-a' })).toBe('secret-a');
    expect(getHostedFreeRelaySecret({ HOSTED_FREE_RELAY_SECRET: 'secret-b' })).toBe('secret-b');
  });

  it('authorizes authenticated hosted FREE relays only for the FREE provider', () => {
    const request = new Request('https://alpha1.bolt.gives/api/chat', {
      headers: {
        'X-Bolt-Hosted-Free-Relay': '1',
        'X-Bolt-Hosted-Free-Relay-Secret': 'relay-secret',
      },
    });

    expect(
      isHostedFreeRelayAuthorized({
        request,
        runtimeEnv: { BOLT_HOSTED_FREE_RELAY_SECRET: 'relay-secret' },
        providerName: 'FREE',
      }),
    ).toBe(true);

    expect(
      isHostedFreeRelayAuthorized({
        request,
        runtimeEnv: { BOLT_HOSTED_FREE_RELAY_SECRET: 'relay-secret' },
        providerName: 'OpenAI',
      }),
    ).toBe(false);
  });

  it('rejects hosted FREE relays with missing or mismatched secrets', () => {
    const request = new Request('https://alpha1.bolt.gives/api/chat', {
      headers: {
        'X-Bolt-Hosted-Free-Relay': '1',
        'X-Bolt-Hosted-Free-Relay-Secret': 'wrong-secret',
      },
    });

    expect(
      isHostedFreeRelayAuthorized({
        request,
        runtimeEnv: { BOLT_HOSTED_FREE_RELAY_SECRET: 'expected-secret' },
        providerName: 'FREE',
      }),
    ).toBe(false);
  });
});
