import { json, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { APP_VERSION } from '@bolt/core/lib/version';
import { checkRuntimeReadiness } from '@bolt/runtime/lib/.server/runtime-readiness';
import { resolveRuntimeEnvFromContext } from '@bolt/runtime/lib/.server/runtime-env';

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

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const wantsReadiness = url.searchParams.has('ready') || url.searchParams.has('readiness');

  // Liveness: cheap + dependency-free.
  if (!wantsReadiness) {
    return json(
      {
        status: 'alive',
        uptimeMs: Date.now() - START_TIME,
        timestamp: new Date().toISOString(),
        version: APP_VERSION,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const checks = [await checkRuntimeReadiness(APP_VERSION, resolveRuntimeEnvFromContext(context))];

  const ok = checks.every((c) => c.ok);

  return json(
    {
      status: ok ? 'ready' : 'degraded',
      uptimeMs: Date.now() - START_TIME,
      timestamp: new Date().toISOString(),
      version: APP_VERSION,
      checks,
    },
    {
      status: ok ? 200 : 503,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
};
