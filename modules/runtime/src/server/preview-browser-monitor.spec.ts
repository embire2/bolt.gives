import { Readable } from 'node:stream';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { injectPreviewBrowserMonitor, readPreviewBrowserError } from './preview-browser-monitor.mjs';

describe('isolated browser error monitoring', () => {
  it('installs before application scripts, reports only to its own origin, and bounds traffic', () => {
    const html = injectPreviewBrowserMonitor('<html><head><script src="/app.js"></script></head></html>');
    expect(html.indexOf('data-bolt-preview-monitor')).toBeLessThan(html.indexOf('src="/app.js"'));
    expect(injectPreviewBrowserMonitor(html)).toBe(html);

    const listeners: Record<string, (event: unknown) => void> = {};
    const fetch = vi.fn(async () => undefined);
    vm.runInNewContext(html.match(/<script data-bolt-preview-monitor>([\s\S]*?)<\/script>/)![1], {
      window: {
        addEventListener: (name: string, listener: (event: unknown) => void) => {
          listeners[name] = listener;
        },
      },
      fetch,
    });

    for (let index = 0; index < 10; index++) {
      listeners.error({ message: 'Browser fixture error' });
    }
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(fetch).toHaveBeenCalledWith(
      '/__bolt/error',
      expect.objectContaining({ method: 'POST', credentials: 'same-origin' }),
    );
    expect(html).not.toContain('parent.');
  });

  it('validates and bounds report fields and stream bytes', async () => {
    await expect(
      readPreviewBrowserError(Readable.from([JSON.stringify({ message: 'x'.repeat(600), stack: 'y'.repeat(3000) })])),
    ).resolves.toEqual({ message: 'x'.repeat(500), stack: 'y'.repeat(2000) });
    await expect(readPreviewBrowserError(Readable.from(['{}']))).rejects.toThrow('message');
    await expect(readPreviewBrowserError(Readable.from(['x'.repeat(8193)]))).rejects.toThrow('size limit');
  });
});
