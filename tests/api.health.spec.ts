import { describe, expect, it } from 'vitest';
import { APP_VERSION } from '../app/lib/version';
import { loader } from '../app/routes/api.health';

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

  it('allows deployment APP_VERSION env to override the checked-in version', async () => {
    const response = (await loader({
      context: {
        cloudflare: {
          env: {
            APP_VERSION: 'deployment-version',
          },
        },
      },
      request: new Request('https://bolt.gives/api/health'),
      params: {},
    } as unknown as Parameters<typeof loader>[0])) as Response;

    const payload = (await response.json()) as { version: string };

    expect(payload.version).toBe('deployment-version');
  });
});
