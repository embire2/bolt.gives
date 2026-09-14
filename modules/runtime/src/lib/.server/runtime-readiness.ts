import { getRuntimeControlBaseUrl } from './runtime-control';

export async function checkRuntimeReadiness(version: string, env: Record<string, string | undefined>) {
  const started = Date.now();

  try {
    const response = await fetch(`${getRuntimeControlBaseUrl(env)}/health`, {
      signal: AbortSignal.timeout(3000),
      redirect: 'error',
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`Runtime health returned HTTP ${response.status}.`);
    }

    const runtime = (await response.json()) as { ok?: boolean; version?: string; protocolVersion?: number };

    if (runtime.ok !== true || runtime.protocolVersion !== 1) {
      throw new Error('Runtime is unavailable or does not support the required protocol.');
    }

    if (runtime.version !== version) {
      throw new Error('Application and runtime versions do not match. Complete or roll back the deployment.');
    }

    return { name: 'runtime', ok: true, durationMs: Date.now() - started };
  } catch (error) {
    const message = error instanceof Error ? error.message : '';

    return {
      name: 'runtime',
      ok: false,
      durationMs: Date.now() - started,
      error: /^(?:Runtime health returned HTTP \d+\.|Runtime is unavailable or|Application and runtime versions)/.test(
        message,
      )
        ? message
        : 'Runtime readiness could not be verified within its deadline.',
    };
  }
}
