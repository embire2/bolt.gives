import {
  assertFreeUsageQuotaAllowed,
  recordFreeUsageQuotaForRequest,
} from '@bolt/agent/lib/.server/llm/free-usage-quota';
import { FREE_PROVIDER_NAME } from '@bolt/agent/lib/modules/llm/free-provider-config';
import type { UsageLike } from '@bolt/agent/lib/runtime/usage';
import { fetchPremiumRuntimeStatus } from '@bolt/runtime/lib/.server/premium-runtime';
import { resolveProfileSession } from '~/lib/.server/profile-session';

type RuntimeEnv = Record<string, string | undefined>;

export function shouldUseFreeTokenAllowance(providerName: string | undefined, customDomainStatus?: string | null) {
  return providerName === FREE_PROVIDER_NAME && customDomainStatus !== 'active';
}

export async function createProfileFreeUsageMeter(options: {
  request: Request;
  runtimeEnv: RuntimeEnv;
  providerName?: string;
  sessionId?: string;
}) {
  const subjectKey = (await resolveProfileSession(options.request, options.runtimeEnv))?.id;
  const customDomainStatus =
    options.providerName === FREE_PROVIDER_NAME && options.sessionId?.trim()
      ? await fetchPremiumRuntimeStatus({
          requestUrl: options.request.url,
          sessionId: options.sessionId,
        }).catch(() => null)
      : null;
  const useFreeAllowance = shouldUseFreeTokenAllowance(options.providerName, customDomainStatus?.status);

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
      if (!useFreeAllowance) {
        return;
      }

      try {
        await recordFreeUsageQuotaForRequest({
          request: options.request,
          runtimeEnv: options.runtimeEnv,
          subjectKey,
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
