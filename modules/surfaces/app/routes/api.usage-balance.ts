import { json, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { getFreeUsageQuotaForRequest } from '@bolt/agent/lib/.server/llm/free-usage-quota';
import { resolveRuntimeEnvFromContext } from '@bolt/runtime/lib/.server/runtime-env';
import { resolveProfileSession } from '~/lib/.server/profile-session';

export async function loader({ context, request }: LoaderFunctionArgs) {
  const runtimeEnv = resolveRuntimeEnvFromContext(context);
  const profile = await resolveProfileSession(request, runtimeEnv);

  try {
    const quota = await getFreeUsageQuotaForRequest({
      request,
      runtimeEnv,
      subjectKey: profile?.id,
    });

    if (!quota) {
      throw new Error('The FREE token balance is unavailable.');
    }

    return json(
      {
        plan: 'free' as const,
        tokensAllowance: quota.tokenLimit,
        tokensUsed: quota.usedTokens,
        tokensRemaining: quota.remainingTokens,
        resetAt: quota.resetAt,
        periodLabel: 'daily at 00:00 GMT+2',
      },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } },
    );
  } catch (error) {
    return json(
      {
        ok: false,
        message: error instanceof Error ? error.message : 'The FREE token balance is unavailable.',
      },
      {
        status: 503,
        headers: { 'Cache-Control': 'no-store, max-age=0' },
      },
    );
  }
}
