import {
  assertFreeUsageQuotaAllowed,
  recordFreeUsageQuotaForRequest,
} from '@bolt/agent/lib/.server/llm/free-usage-quota';
import { FREE_PROVIDER_NAME } from '@bolt/agent/lib/modules/llm/free-provider-config';
import type { UsageLike } from '@bolt/agent/lib/runtime/usage';
import { fetchPremiumRuntimeStatus } from '@bolt/runtime/lib/.server/premium-runtime';
import {
  getProfileBillingStatus,
  recordProfileBillingUsage,
  resolveProfileSession,
} from '~/lib/.server/profile-session';

type RuntimeEnv = Record<string, string | undefined>;

export const PROFILE_BILLING_LIMIT_ERROR_CODE = 'BOLT_PROFILE_BILLING_LIMIT_REACHED';

export function buildProfileBillingLimitMessage() {
  return 'Your 10,000 monthly Agent tokens are used. Select a provider with your own API key or wait for the next successfully paid period.';
}

export function shouldUseFreeTokenAllowance(
  providerName: string | undefined,
  customDomainStatus?: string | null,
  profileBillingStatus?: string | null,
) {
  return providerName === FREE_PROVIDER_NAME && customDomainStatus !== 'active' && profileBillingStatus !== 'active';
}

export async function createProfileFreeUsageMeter(options: {
  request: Request;
  runtimeEnv: RuntimeEnv;
  providerName?: string;
  sessionId?: string;
}) {
  const startedAt = Date.now();
  const profile = await resolveProfileSession(options.request, options.runtimeEnv);
  const subjectKey = profile?.id;
  const customDomainStatus =
    options.providerName === FREE_PROVIDER_NAME && options.sessionId?.trim()
      ? await fetchPremiumRuntimeStatus({
          requestUrl: options.request.url,
          sessionId: options.sessionId,
        }).catch(() => null)
      : null;
  const profileBilling =
    options.providerName === FREE_PROVIDER_NAME && profile
      ? await getProfileBillingStatus(options.request, options.runtimeEnv).catch(() => null)
      : null;
  const useProfileBilling = customDomainStatus?.status !== 'active' && profileBilling?.status === 'active';
  const useFreeAllowance = shouldUseFreeTokenAllowance(
    options.providerName,
    customDomainStatus?.status,
    profileBilling?.status,
  );

  if (useProfileBilling && (profileBilling?.tokensRemaining ?? 0) <= 0) {
    throw new Error(`${PROFILE_BILLING_LIMIT_ERROR_CODE}: ${buildProfileBillingLimitMessage()}`);
  }

  if (useFreeAllowance) {
    await assertFreeUsageQuotaAllowed({
      request: options.request,
      runtimeEnv: options.runtimeEnv,
      providerName: options.providerName,
      subjectKey,
    });
  }

  return {
    async record(input: { providerName: string; modelName: string; usage: UsageLike; runId: string }) {
      if (useProfileBilling) {
        await recordProfileBillingUsage(
          options.request,
          { runId: input.runId, totalTokens: input.usage.totalTokens || 0 },
          options.runtimeEnv,
        ).catch((error) => {
          console.warn(
            `Failed to record Custom Domain usage: ${error instanceof Error ? error.message : String(error)}`,
          );
        });
        return;
      }

      if (!useFreeAllowance) {
        return;
      }

      try {
        await recordFreeUsageQuotaForRequest({
          request: options.request,
          runtimeEnv: options.runtimeEnv,
          subjectKey,
          activeDurationMs: Date.now() - startedAt,
          ...input,
        });
      } catch (error) {
        console.warn(
          `Failed to record hosted FREE token usage: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  };
}
