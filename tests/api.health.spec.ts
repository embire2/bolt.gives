import { describe, expect, it } from 'vitest';
import { APP_VERSION } from '@bolt/core/lib/version';
import { loader } from '~/routes/api.health';

describe('/api/health loader', () => {
  it('reports the checked-in release version when APP_VERSION is not configured', async () => {
    const response = (await loader({
      context: {},
      request: new Request('https://bolt.gives/api/health'),
      params: {},
    } as unknown as Parameters<typeof loader>[0])) as Response;

    const payload = (await response.json()) as { version: string };

    expect(payload.version).toBe(APP_VERSION);
  });

  it('ignores stale deployment APP_VERSION metadata', async () => {
    const response = (await loader({
      context: {
        cloudflare: {
          env: {
            APP_VERSION: '3.2.0',
          },
        },
      },
      request: new Request('https://bolt.gives/api/health'),
      params: {},
    } as unknown as Parameters<typeof loader>[0])) as Response;

    const payload = (await response.json()) as { version: string };

    expect(payload.version).toBe(APP_VERSION);
  });
});
