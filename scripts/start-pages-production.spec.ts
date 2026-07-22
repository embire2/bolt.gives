import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  createCacheStoragePolyfill,
  resolveAssetPath,
  resolveProductionServerConfig,
  writeWorkerResponse,
} from './start-pages-production.mjs';

describe('production Pages worker server', () => {
  it('resolves production host, port, worker, and asset overrides', () => {
    expect(
      resolveProductionServerConfig(['--ip', '0.0.0.0', '--port', '9000'], {
        BOLT_PAGES_ASSET_ROOT: '/srv/example/client',
        BOLT_PAGES_WORKER_PATH: '/srv/example/worker.js',
      } as unknown as NodeJS.ProcessEnv),
    ).toEqual({
      host: '0.0.0.0',
      port: 9000,
      assetRoot: '/srv/example/client',
      workerPath: '/srv/example/worker.js',
    });
  });

  it('keeps static asset requests inside the build directory', () => {
    const root = path.resolve('/srv/example/client');

    expect(resolveAssetPath(root, '/assets/app.js')).toBe(path.join(root, 'assets/app.js'));
    expect(resolveAssetPath(root, '/../../etc/passwd')).toBeNull();
    expect(resolveAssetPath(root, '/%E0%A4%A')).toBeNull();
  });

  it('provides the Cache API surface required by the compiled worker', async () => {
    const caches = createCacheStoragePolyfill();

    expect(await caches.default.match(new Request('https://example.com'))).toBeUndefined();
    expect(await caches.open('default')).toBe(caches.default);
    expect(await caches.keys()).toEqual([]);
  });

  it('does not recursively cancel a compiled response stream after a client disconnect', async () => {
    const cancel = vi.fn(() => {
      throw new TypeError('Invalid state: ReadableStream is locked');
    });
    const response = new Response(new ReadableStream({ cancel }));
    const serverResponse = {
      destroyed: true,
      statusCode: 0,
      statusMessage: '',
      setHeader: vi.fn(),
      end: vi.fn(),
      write: vi.fn(),
    };

    await expect(writeWorkerResponse(response, serverResponse)).resolves.toBeUndefined();
    expect(cancel).not.toHaveBeenCalled();
  });
});
