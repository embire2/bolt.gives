import { describe, expect, it } from 'vitest';
import { getFreeUsageQuotaErrorCode } from '@bolt/agent/lib/.server/llm/free-usage-quota';
import { PROFILE_BILLING_LIMIT_ERROR_CODE } from './profile-free-usage';
import { createUsageLimitResponse } from './profile-billing-response';

describe('usage limit responses', () => {
  it('returns a daily FREE limit response', async () => {
    const response = createUsageLimitResponse(new Error(getFreeUsageQuotaErrorCode()), { error: true });

    expect(response?.status).toBe(429);
    expect(response?.statusText).toBe('Hosted FREE Daily Limit Reached');
    await expect(response?.json()).resolves.toMatchObject({ statusCode: 429, isRetryable: false });
  });

  it('returns a monthly account limit response and ignores unrelated failures', async () => {
    const response = createUsageLimitResponse(new Error(PROFILE_BILLING_LIMIT_ERROR_CODE), { error: true });

    expect(response?.status).toBe(429);
    expect(response?.statusText).toBe('Custom Domain Monthly Limit Reached');
    await expect(response?.json()).resolves.toMatchObject({ message: expect.stringContaining('10,000') });
    expect(createUsageLimitResponse(new Error('provider unavailable'), {})).toBeNull();
  });
});
