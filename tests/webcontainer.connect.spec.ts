import { describe, expect, it } from 'vitest';
import { loader } from '~/routes/webcontainer.connect.$id';

describe('webcontainer connect loader', () => {
  it('returns COEP/COOP headers and enterprise WebContainer boot script', async () => {
    const response = (await loader({
      request: new Request('https://bolt.gives/webcontainer/connect/123?editorOrigin=https://editor.example'),
      context: {
        env: {
          WC_LICENSE_KEY: 'test-license',
          WC_ENTERPRISE_SDK_URL: 'https://enterprise.example/sdk/+esm',
          WC_COORDINATOR_ORIGIN: 'https://webcontainer.io',
        },
      },
    } as any)) as Response;

    const html = await response.text();

    expect(response.headers.get('Cross-Origin-Embedder-Policy')).toBe('require-corp');
    expect(response.headers.get('Cross-Origin-Opener-Policy')).toBe('same-origin');
    expect(response.headers.get('Content-Type')).toContain('text/html');
    expect(html).toContain('Booting enterprise WebContainer...');
    expect(html).toContain('WC_LICENSE_KEY');
    expect(html).toContain('enterprise.example/sdk/+esm');
    expect(html).toContain('MAX_BOOT_ATTEMPTS = 3');
    expect(html).toContain('Maintenance Mode: Enterprise WebContainer is temporarily unavailable');
    expect(html).toContain('https://editor.example');
  });
});
