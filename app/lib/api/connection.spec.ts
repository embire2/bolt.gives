import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkConnection } from './connection';

describe('checkConnection', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses one bounded health request instead of probing multiple page assets', async () => {
    const fetchSpy = vi.fn().mockRejectedValue(new Error('offline'));
    vi.stubGlobal('navigator', { onLine: true });
    vi.stubGlobal('fetch', fetchSpy);

    await expect(checkConnection()).resolves.toMatchObject({ connected: false });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/health',
      expect.objectContaining({ method: 'HEAD', cache: 'no-store' }),
    );
  });

  it('does not issue a request while the browser reports it is offline', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('navigator', { onLine: false });
    vi.stubGlobal('fetch', fetchSpy);

    await expect(checkConnection()).resolves.toMatchObject({ connected: false, latency: 0 });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
