import { json, type LoaderFunctionArgs } from '@remix-run/cloudflare';

/*
 * Split health endpoint.
 *
 *   GET /api/health          → liveness   (process is running)
 *   GET /api/health?ready=1  → readiness  (dependencies are reachable)
 *
 * Keeping the two separate matters in production because Kubernetes /
 * Docker Compose / Cloudflare Pages probe them with different policies:
 * liveness is a "restart me if I'm dead" signal (must be cheap, must not
 * touch downstreams), while readiness is a "serve traffic to me only if I
 * can actually answer" signal (allowed to block on downstreams).
 *
 * This file intentionally avoids importing any heavy runtime modules so the
 * liveness probe stays microsecond-fast and won't cascade-fail because of an
 * unrelated bug somewhere in the agent pipeline.
 */

const START_TIME = Date.now();

type DependencyResult = {
  name: string;
  ok: boolean;
  durationMs: number;
  error?: string;
};

async function timedCheck(name: string, run: () => Promise<void>, timeoutMs: number): Promise<DependencyResult> {
  const start = Date.now();

  try {
    await Promise.race([
      run(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`${name} check timed out after ${timeoutMs}ms`)), timeoutMs),
      ),
    ]);

    return { name, ok: true, durationMs: Date.now() - start };
  } catch (error) {
    return {
      name,
      ok: false,
      durationMs: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const wantsReadiness = url.searchParams.has('ready') || url.searchParams.has('readiness');
  const version = ((context as any)?.cloudflare?.env ?? (context as any)?.env)?.APP_VERSION ?? 'dev';

  // Liveness: cheap + dependency-free.
  if (!wantsReadiness) {
    return json(
      {
        status: 'alive',
        uptimeMs: Date.now() - START_TIME,
        timestamp: new Date().toISOString(),
        version,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  // Readiness: optional downstream probes, each bounded.
  const checks: DependencyResult[] = [];

  // Self-check: are we inside a Remix loader and can we resolve env?
  checks.push(
    await timedCheck(
      'runtime',
      async () => {
        if (typeof fetch !== 'function') {
          throw new Error('fetch is unavailable in this runtime');
        }
      },
      250,
    ),
  );

  const ok = checks.every((c) => c.ok);

  return json(
    {
      status: ok ? 'ready' : 'degraded',
      uptimeMs: Date.now() - START_TIME,
      timestamp: new Date().toISOString(),
      version,
      checks,
    },
    {
      status: ok ? 200 : 503,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
};
