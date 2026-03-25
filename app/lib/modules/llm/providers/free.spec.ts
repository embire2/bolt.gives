import { afterEach, describe, expect, it, vi } from 'vitest';
import FreeProvider, {
  FREE_FALLBACK_MODEL,
  FREE_HOSTED_MODEL,
  clearHostedFreeModelResolution,
  rememberHostedFreeModelResolution,
} from './free';

const { chatSpy, createOpenRouterSpy } = vi.hoisted(() => {
  const chatSpy = vi.fn();
  const createOpenRouterSpy = vi.fn(() => ({
    chat: chatSpy,
  }));

  return {
    chatSpy,
    createOpenRouterSpy,
  };
});

vi.mock('@openrouter/ai-sdk-provider', () => ({
  createOpenRouter: createOpenRouterSpy,
}));

describe('FreeProvider', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    clearHostedFreeModelResolution();
  });

  it('uses the dedicated server-side OpenRouter key and hard-locks the hosted DeepSeek model', () => {
    const provider = new FreeProvider();
    const modelInstance = { id: 'free-model-instance' };
    chatSpy.mockReturnValue(modelInstance);

    const result = provider.getModelInstance({
      model: 'openai/gpt-4o',
      serverEnv: {
        FREE_OPENROUTER_API_KEY: 'sk-or-free',
      } as unknown as Env,
    });

    expect(createOpenRouterSpy).toHaveBeenCalledWith({
      apiKey: 'sk-or-free',
    });
    expect(chatSpy).toHaveBeenCalledWith(FREE_HOSTED_MODEL);
    expect(result).toBe(modelInstance);
  });

  it('refuses to start when the dedicated server-side key is missing', () => {
    const provider = new FreeProvider();
    vi.stubEnv('FREE_OPENROUTER_API_KEY', '');

    expect(() =>
      provider.getModelInstance({
        model: FREE_HOSTED_MODEL,
        serverEnv: {} as Env,
      }),
    ).toThrow('Missing API key for FREE provider');
  });

  it('accepts the hydrated server-managed key when it is supplied through apiKeys', () => {
    const provider = new FreeProvider();
    const modelInstance = { id: 'free-model-instance' };
    chatSpy.mockReturnValue(modelInstance);

    const result = provider.getModelInstance({
      model: FREE_HOSTED_MODEL,
      serverEnv: {} as Env,
      apiKeys: {
        FREE: 'sk-or-free',
      },
    });

    expect(createOpenRouterSpy).toHaveBeenCalledWith({
      apiKey: 'sk-or-free',
    });
    expect(chatSpy).toHaveBeenCalledWith(FREE_HOSTED_MODEL);
    expect(result).toBe(modelInstance);
  });

  it('quietly routes to qwen/qwen3-coder when FREE preflight picked the fallback', () => {
    const provider = new FreeProvider();
    const modelInstance = { id: 'free-fallback-model-instance' };
    chatSpy.mockReturnValue(modelInstance);

    rememberHostedFreeModelResolution({
      apiKey: 'sk-or-free',
      resolvedModelName: FREE_FALLBACK_MODEL,
      ttlMs: 60_000,
    });

    const result = provider.getModelInstance({
      model: FREE_HOSTED_MODEL,
      serverEnv: {
        FREE_OPENROUTER_API_KEY: 'sk-or-free',
      } as unknown as Env,
    });

    expect(createOpenRouterSpy).toHaveBeenCalledWith({
      apiKey: 'sk-or-free',
    });
    expect(chatSpy).toHaveBeenCalledWith(FREE_FALLBACK_MODEL);
    expect(result).toBe(modelInstance);
  });
});
