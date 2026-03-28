import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveRuntimeEnv, resolveRuntimeEnvFromContext } from './runtime-env';

describe('resolveRuntimeEnv', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('preserves a real process secret when a later source only provides a placeholder', () => {
    vi.stubEnv('FREE_OPENROUTER_API_KEY', 'sk-or-v1-real-secret');

    const env = resolveRuntimeEnv({
      FREE_OPENROUTER_API_KEY: 'your_openrouter_api_key_here',
    });

    expect(env.FREE_OPENROUTER_API_KEY).toBe('sk-or-v1-real-secret');
  });

  it('drops placeholder sensitive values when no real secret exists', () => {
    vi.stubEnv('FREE_OPENROUTER_API_KEY', '');

    const env = resolveRuntimeEnv({
      FREE_OPENROUTER_API_KEY: 'your_openrouter_api_key_here',
    });

    expect(env.FREE_OPENROUTER_API_KEY).toBeUndefined();
  });

  it('still allows a later real secret to replace an earlier placeholder', () => {
    vi.stubEnv('OPENAI_API_KEY', 'ROTATE_REQUIRED');

    const env = resolveRuntimeEnv({
      OPENAI_API_KEY: 'sk-real-openai-key',
    });

    expect(env.OPENAI_API_KEY).toBe('sk-real-openai-key');
  });

  it('hydrates env values from the Cloudflare Pages context.env shape', () => {
    const env = resolveRuntimeEnvFromContext({
      env: {
        FREE_OPENROUTER_API_KEY: 'sk-or-pages-secret',
      },
    });

    expect(env.FREE_OPENROUTER_API_KEY).toBe('sk-or-pages-secret');
  });

  it('merges cloudflare.env and context.env sources', () => {
    const env = resolveRuntimeEnvFromContext({
      cloudflare: {
        env: {
          OPENAI_API_KEY: 'sk-openai-cloudflare',
        },
      },
      env: {
        FREE_OPENROUTER_API_KEY: 'sk-or-pages-secret',
      },
    });

    expect(env.OPENAI_API_KEY).toBe('sk-openai-cloudflare');
    expect(env.FREE_OPENROUTER_API_KEY).toBe('sk-or-pages-secret');
  });
});
