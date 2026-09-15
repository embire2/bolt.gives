import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkRuntimeReadiness } from './runtime-readiness';

const env = { BOLT_RUNTIME_CONTROL_PUBLIC_URL: 'https://runtime.example.test/runtime' };

afterEach(() => vi.unstubAllGlobals());

describe('runtime readiness across Node and Workers', () => {
  it('uses a Workers-compatible no-follow request with a deadline', async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      if (init.redirect === 'error') {
        throw new TypeError('Invalid redirect value, must be one of follow or manual');
      }

      return Response.json({ ok: true, version: '4.1.1', protocolVersion: 1 });
    });
    vi.stubGlobal('fetch', fetchMock);

    expect(await checkRuntimeReadiness('4.1.1', env)).toMatchObject({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith('https://runtime.example.test/runtime/health', {
      redirect: 'manual',
      signal: expect.any(AbortSignal),
      headers: { Accept: 'application/json' },
    });
  });

  it.each([301, 302, 307, 308])('rejects HTTP %i without following the destination', async (status) => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, {
        status,
        headers: { Location: 'https://untrusted.example.test/' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    expect(await checkRuntimeReadiness('4.1.1', env)).toMatchObject({
      ok: false,
      error: `Runtime health returned HTTP ${status}.`,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('continues to reject a mixed-version runtime', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ ok: true, version: '4.1.0', protocolVersion: 1 })),
    );
    expect(await checkRuntimeReadiness('4.1.1', env)).toMatchObject({
      ok: false,
      error: 'Application and runtime versions do not match. Complete or roll back the deployment.',
    });
  });

  it('redacts unexpected transport errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('private network details')));
    expect(await checkRuntimeReadiness('4.1.1', env)).toMatchObject({
      ok: false,
      error: 'Runtime readiness could not be verified within its deadline.',
    });
  });
});
