import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FreeProvider from './free';
import { FREE_HOSTED_MODEL, resolveHostedFreeModel } from '@bolt/agent/lib/modules/llm/free-provider-config';

const { createOpenRouter, chat } = vi.hoisted(() => {
  const chat = vi.fn(() => ({ modelId: 'z-ai/glm-5.3-flash' }));
  return { chat, createOpenRouter: vi.fn(() => ({ chat })) };
});
vi.mock('@openrouter/ai-sdk-provider', () => ({ createOpenRouter }));

describe('managed FREE OpenRouter provider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('BOLT_FREE_OPENROUTER_API_KEY', '');
  });
  afterEach(() => vi.unstubAllEnvs());

  it.each(['z-ai/glm-5.3-flash', 'gpt-5.6-sol', 'claude-sonnet-5', 'unapproved-model'])(
    'resolves %s to the funded GLM model without losing conversation context',
    (model) => {
      const provider = new FreeProvider();
      provider.getModelInstance({
        model,
        serverEnv: { BOLT_FREE_OPENROUTER_API_KEY: 'operator-test-key' } as unknown as Env,
        apiKeys: { FREE: 'untrusted-client-key' },
        providerSettings: { FREE: { baseUrl: 'https://untrusted.example' } } as any,
      });
      expect(createOpenRouter).toHaveBeenCalledWith({
        apiKey: 'operator-test-key',
        baseURL: 'https://openrouter.ai/api/v1',
      });
      expect(chat).toHaveBeenCalledWith('z-ai/glm-5.3-flash', { reasoning: { effort: 'low' } });
      expect(provider.allowsUserApiKey).toBe(false);
    },
  );

  it('refuses client keys and old Magnet credentials as a funded-key fallback', () => {
    const provider = new FreeProvider();
    expect(() =>
      provider.getModelInstance({
        model: FREE_HOSTED_MODEL,
        serverEnv: { MAGNET_API_KEY: 'old-operator-key', OPEN_ROUTER_API_KEY: 'personal-key' } as unknown as Env,
        apiKeys: { FREE: 'client-key' },
      }),
    ).toThrow('Missing API key for FREE provider');
    expect(createOpenRouter).not.toHaveBeenCalled();
  });

  it('exposes the verified GLM label and normalizes persisted model selections', () => {
    expect(new FreeProvider().staticModels.map(({ name, label }) => ({ name, label }))).toEqual([
      { name: 'z-ai/glm-5.3-flash', label: 'GLM 5.3 Flash' },
    ]);
    expect(resolveHostedFreeModel(undefined)).toBe('z-ai/glm-5.3-flash');
  });
});
