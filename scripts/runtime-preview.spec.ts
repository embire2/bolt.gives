import { describe, expect, it } from 'vitest';
import {
  createPreviewProbeCoordinator,
  extractPreviewPortFromOutput,
  normalizeStartCommand,
  parsePreviewProxyRequestTarget,
  rewritePreviewAssetUrls,
} from './runtime-preview.mjs';

describe('runtime preview helpers', () => {
  it('extracts preview port from common dev-server output', () => {
    expect(extractPreviewPortFromOutput('Local:   http://127.0.0.1:5175/')).toBe(5175);
    expect(extractPreviewPortFromOutput('ready - started server on 0.0.0.0:3000, url: http://localhost:3000')).toBe(
      3000,
    );
    expect(extractPreviewPortFromOutput('nothing useful here')).toBeUndefined();
  });

  it('normalizes run dev commands to include host and port forwarding', () => {
    expect(normalizeStartCommand('pnpm run dev', 4100)).toBe('pnpm run dev --host 127.0.0.1 --port 4100');
    expect(normalizeStartCommand('pnpm run dev -- --host 0.0.0.0 --port 5173', 4100)).toBe(
      'pnpm run dev --host 127.0.0.1 --port 4100',
    );
    expect(normalizeStartCommand('npm run dev', 4100)).toBe('npm run dev -- --host 127.0.0.1 --port 4100');
    expect(normalizeStartCommand('next dev', 4100)).toBe('next dev -H 127.0.0.1 -p 4100');
  });

  it('switches preview probe target when the actual port changes', async () => {
    const probes: number[] = [];
    const pending = new Map<number, { resolve: () => void; reject: (error: Error) => void }>();
    const coordinator = createPreviewProbeCoordinator((port: number) => {
      probes.push(port);

      return new Promise<void>((resolve, reject) => {
        pending.set(port, { resolve, reject });
      });
    });

    coordinator.startProbe(4100);
    coordinator.startProbe(5175);
    pending.get(4100)?.resolve();
    expect(coordinator.isSettled()).toBe(false);
    pending.get(5175)?.resolve();

    await expect(coordinator.readyPromise).resolves.toEqual({ port: 5175 });
    expect(probes).toEqual([4100, 5175]);
    expect(coordinator.isSettled()).toBe(true);
  });

  it('surfaces the last active preview probe failure', async () => {
    const coordinator = createPreviewProbeCoordinator((port: number) => {
      return port === 4100 ? Promise.reject(new Error('old probe failed')) : Promise.reject(new Error('new probe failed'));
    });

    coordinator.startProbe(4100);
    coordinator.startProbe(5175);

    await expect(coordinator.readyPromise).rejects.toThrow('new probe failed');
  });

  it('rewrites root-relative preview asset URLs through the runtime proxy path', () => {
    const input = `
      <script type="module" src="/@vite/client"></script>
      <script type="module" src="/src/main.jsx"></script>
      <style>.hero { background: url(/assets/bg.png); }</style>
      //# sourceMappingURL=/src/main.jsx.map
    `;

    const output = rewritePreviewAssetUrls(input, '/runtime/preview/session123/4101');

    expect(output).toContain('src="/runtime/preview/session123/4101/@vite/client"');
    expect(output).toContain('src="/runtime/preview/session123/4101/src/main.jsx"');
    expect(output).toContain('url(/runtime/preview/session123/4101/assets/bg.png)');
    expect(output).toContain('sourceMappingURL=/runtime/preview/session123/4101/src/main.jsx.map');
  });

  it('parses preview proxy request targets including query strings', () => {
    expect(parsePreviewProxyRequestTarget('/runtime/preview/session-1/4100')).toEqual({
      sessionId: 'session-1',
      portRaw: '4100',
      previewBasePath: '/runtime/preview/session-1/4100',
      upstreamPath: '/',
    });
    expect(parsePreviewProxyRequestTarget('/runtime/preview/session-1/4100/@vite/client?token=abc')).toEqual({
      sessionId: 'session-1',
      portRaw: '4100',
      previewBasePath: '/runtime/preview/session-1/4100',
      upstreamPath: '/@vite/client?token=abc',
    });
  });
});
