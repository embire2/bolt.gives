import { useEffect, useState } from 'react';
import {
  fetchHostedRuntimePremiumStatus,
  type HostedPremiumStatus,
} from '@bolt/runtime/lib/runtime/hosted-runtime-client';
import { FreePlanPausedModal } from './FreePlanPausedModal.client';
import { BillingUpgradeButton } from '~/components/billing/BillingUpgradeButton.client';

type FreeUsageBalance = {
  plan: 'free' | 'custom-domain';
  tokensAllowance: number;
  tokensUsed: number;
  tokensRemaining: number;
  resetAt: string | null;
  periodLabel: string;
};

function formatAgentTokens(value: number) {
  return Number.isInteger(value)
    ? value.toLocaleString()
    : value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function readDismissedResetAt() {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.sessionStorage.getItem('bolt_free_pause_dismissed_reset');
  } catch {
    return null;
  }
}

export function UsageBalanceBadge({ alwaysVisible = false }: { alwaysVisible?: boolean }) {
  const [freeBalance, setFreeBalance] = useState<FreeUsageBalance | null>(null);
  const [customDomain, setCustomDomain] = useState<HostedPremiumStatus | null>(null);
  const [dismissedResetAt, setDismissedResetAt] = useState<string | null>(readDismissedResetAt);

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      const [freeResponse, workbenchModule] = await Promise.all([
        fetch('/api/usage-balance', { headers: { Accept: 'application/json' } }).catch(() => null),
        import('@bolt/project/lib/stores/workbench'),
      ]);
      const nextFree =
        freeResponse?.ok === true ? ((await freeResponse.json().catch(() => null)) as FreeUsageBalance | null) : null;
      const sessionId = workbenchModule.workbenchStore.hostedRuntimeSessionId;
      const nextCustomDomain = sessionId ? await fetchHostedRuntimePremiumStatus(sessionId).catch(() => null) : null;

      if (!cancelled) {
        setFreeBalance(nextFree);
        setCustomDomain(nextCustomDomain);
      }
    };

    void refresh();

    const timer = window.setInterval(refresh, 10_000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const projectCustomDomainActive = customDomain?.status === 'active';
  const accountCustomDomainActive = freeBalance?.plan === 'custom-domain';
  const customDomainActive = projectCustomDomainActive || accountCustomDomainActive;
  const allowance = projectCustomDomainActive
    ? (customDomain.tokensAllowance ?? customDomain.creditsAllowance)
    : (freeBalance?.tokensAllowance ?? 100);
  const remaining = projectCustomDomainActive
    ? (customDomain.tokensRemaining ?? customDomain.creditsRemaining)
    : (freeBalance?.tokensRemaining ?? allowance);
  const percentage = allowance > 0 ? Math.max(0, Math.min(100, (remaining / allowance) * 100)) : 0;
  const showPausedModal = freeBalance?.plan === 'free' && remaining <= 0 && dismissedResetAt !== freeBalance?.resetAt;

  const dismissPausedModal = () => {
    const resetAt = freeBalance?.resetAt || 'current-period';

    try {
      window.sessionStorage.setItem('bolt_free_pause_dismissed_reset', resetAt);
    } catch {}

    setDismissedResetAt(resetAt);
  };

  return (
    <>
      <div
        className={`${alwaysVisible ? 'flex' : 'hidden lg:flex'} shrink-0 items-center overflow-hidden rounded-full border border-[#173f32]/25 bg-[#fffdf5] text-[#10231d] shadow-sm`}
      >
        <div className="flex min-w-[150px] items-center gap-2 px-3 py-1.5">
          <span className="i-ph:coins-fill text-base text-[#5d7f18]" aria-hidden="true" />
          <div className="min-w-0">
            <div className="flex items-baseline justify-between gap-2 text-[10px] font-black uppercase tracking-[0.12em]">
              <span>{customDomainActive ? 'Custom Domain' : 'Free'}</span>
              <span>{formatAgentTokens(remaining)}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#173f32]/10">
              <div
                className="h-full rounded-full bg-[#8aae15] transition-[width] duration-500"
                style={{ width: `${percentage}%` }}
              />
            </div>
            <div className="mt-0.5 text-[9px] font-semibold text-[#52645e]">
              of {formatAgentTokens(allowance)} Agent tokens {customDomainActive ? 'this month' : 'today'}
            </div>
          </div>
        </div>
        {!customDomainActive ? (
          <BillingUpgradeButton className="self-stretch border-l border-[#173f32]/20 bg-[#c9f36a] px-3 text-[10px] font-black uppercase tracking-[0.1em] text-[#10231d] transition hover:bg-[#b9e759]">
            <span className="flex h-full items-center">Upgrade</span>
          </BillingUpgradeButton>
        ) : null}
      </div>
      <FreePlanPausedModal open={showPausedModal} resetAt={freeBalance?.resetAt} onDismiss={dismissPausedModal} />
    </>
  );
}
