import { describe, expect, it, vi, beforeEach } from 'vitest';
import { loader } from '../app/routes/api.export-api-keys';

const { getApiKeysFromCookieMock } = vi.hoisted(() => ({
  getApiKeysFromCookieMock: vi.fn(),
}));

vi.mock('~/lib/api/cookies', () => ({
  getApiKeysFromCookie: getApiKeysFromCookieMock,
}));

describe('/api/export-api-keys', () => {
  beforeEach(() => {
    getApiKeysFromCookieMock.mockReset();
  });

  it('does not export server-only provider credentials', async () => {
    getApiKeysFromCookieMock.mockReturnValue({
      OpenRouter: 'user-openrouter-key',
      FREE: 'user-should-not-export',
    });

    const response = (await loader({
      context: {
        cloudflare: {
          env: {
            FREE_OPENROUTER_API_KEY: 'server-free-key',
            OPENAI_API_KEY: 'server-openai-key',
          },
        },
      },
      request: new Request('http://localhost/api/export-api-keys'),
    } as Parameters<typeof loader>[0])) as Response;

    const payload = (await response.json()) as Record<string, string>;

    expect(payload.OpenRouter).toBe('user-openrouter-key');
    expect(payload.OpenAI).toBe('server-openai-key');
    expect(payload.FREE).toBeUndefined();
  });
});
