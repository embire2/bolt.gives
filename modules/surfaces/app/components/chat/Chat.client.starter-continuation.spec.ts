import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Chat starter continuation scheduling', () => {
  it('re-evaluates and unblocks the model continuation when Preview becomes ready', () => {
    const source = readFileSync(resolve(__dirname, 'Chat.client.tsx'), 'utf8');
    const effectStart = source.indexOf('const evaluateStarterContinuation');
    const effectEnd = source.indexOf('useEffect(() => {', effectStart);
    const effectSource = source.slice(effectStart, effectEnd);

    expect(effectStart).toBeGreaterThan(-1);
    expect(effectEnd).toBeGreaterThan(effectStart);
    expect(effectSource).toContain(
      'const hasReadyPreview = previews.some((preview) => preview.ready && preview.baseUrl)',
    );
    expect(effectSource).toContain('shouldDeferStarterForPreview');
    expect(effectSource).toMatch(/isLoading,\s+previews,\s+stepRunnerEvents/);
    expect(source).toMatch(
      /\.then\(\(runtimePrepared\) => runtimePrepared && dispatchStarterContinuation\('stream-finished'\)\)/,
    );
  });
});
