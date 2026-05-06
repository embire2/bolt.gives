import { describe, expect, it } from 'vitest';
import { links, loader, meta } from '../../app/routes/_index';

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

  it('publishes verbose crawl metadata for the public homepage', () => {
    const descriptors = meta({} as any);
    const linkDescriptors = links();

    expect(descriptors).toContainEqual(
      expect.objectContaining({
        name: 'description',
        content: expect.stringContaining('Build previewable web apps from prompts'),
      }),
    );
    expect(descriptors).toContainEqual(
      expect.objectContaining({
        property: 'og:image',
        content: 'https://bolt.gives/seo/bolt-gives-agentic-coding-platform.png',
      }),
    );
    expect(descriptors).toContainEqual(
      expect.objectContaining({
        name: 'robots',
        content: expect.stringContaining('max-image-preview:large'),
      }),
    );
    expect(linkDescriptors).toContainEqual({ rel: 'canonical', href: 'https://bolt.gives' });
    expect(linkDescriptors).toContainEqual({
      rel: 'preload',
      as: 'image',
      href: '/seo/bolt-gives-agentic-coding-platform.png',
    });
  });
});
