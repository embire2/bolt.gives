import { describe, expect, it } from 'vitest';
import { loader } from '../../app/routes/_index';

describe('index route loader', () => {
  it('redirects the admin host to the admin panel route', () => {
    const response = loader({
      request: new Request('https://admin.bolt.gives/'),
      context: {},
      params: {},
    } as any);

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/tenant-admin');
  });

  it('redirects the create host to the managed instances route', () => {
    const response = loader({
      request: new Request('https://create.bolt.gives/'),
      context: {},
      params: {},
    } as any);

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/managed-instances');
  });
});
