import { buildProfileBillingLimitMessage, PROFILE_BILLING_LIMIT_ERROR_CODE } from './profile-free-usage';
import {
  buildFreeUsageQuotaLimitMessage,
  getFreeUsageQuotaErrorCode,
} from '@bolt/agent/lib/.server/llm/free-usage-quota';

export function createUsageLimitResponse(error: unknown, errorResponse: Record<string, unknown>): Response | null {
  const message = error instanceof Error ? error.message : String(error || '');
  const freeLimitReached = message.includes(getFreeUsageQuotaErrorCode());
  const profileLimitReached = message.includes(PROFILE_BILLING_LIMIT_ERROR_CODE);

  if (!freeLimitReached && !profileLimitReached) {
    return null;
  }

  return new Response(
    JSON.stringify({
      ...errorResponse,
      message: freeLimitReached ? buildFreeUsageQuotaLimitMessage() : buildProfileBillingLimitMessage(),
      statusCode: 429,
      isRetryable: false,
    }),
    {
      status: 429,
      headers: { 'Content-Type': 'application/json' },
      statusText: freeLimitReached ? 'Hosted FREE Daily Limit Reached' : 'Custom Domain Monthly Limit Reached',
    },
  );
}
