import { describe, expect, it } from 'vitest';
import { collectInitialAssetPaths, parseRemixManifestSource } from './client-bundle-budget-utils.mjs';

describe('client bundle budget helpers', () => {
  it('parses the generated Remix manifest assignment', () => {
    expect(parseRemixManifestSource('window.__remixManifest={"entry":{"module":"/assets/entry.js"}};')).toEqual({
      entry: { module: '/assets/entry.js' },
    });
  });

  it('deduplicates entry, root, and route startup assets', () => {
    const manifest = {
      entry: { module: '/assets/entry.js', imports: ['/assets/react.js'] },
      routes: {
        root: { module: '/assets/root.js', imports: ['/assets/react.js'], css: ['/assets/root.css'] },
        'routes/_index': {
          module: '/assets/index.js',
          imports: ['/assets/react.js', '/assets/chat.js'],
          css: ['/assets/chat.css'],
        },
      },
    };

    expect(collectInitialAssetPaths(manifest, 'routes/_index')).toEqual([
      '/assets/chat.css',
      '/assets/chat.js',
      '/assets/entry.js',
      '/assets/index.js',
      '/assets/react.js',
      '/assets/root.css',
      '/assets/root.js',
    ]);
  });
});
