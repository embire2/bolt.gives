import { useEffect, useState } from 'react';
import {
  fetchHostedRuntimePremiumStatus,
  type HostedPremiumStatus,
} from '@bolt/runtime/lib/runtime/hosted-runtime-client';

export function PremiumStatusBadge() {
  const [status, setStatus] = useState<HostedPremiumStatus | null>(null);

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      const { workbenchStore } = await import('@bolt/project/lib/stores/workbench');
      const sessionId = workbenchStore.hostedRuntimeSessionId;

      if (!sessionId) {
        return;
      }

      const next = await fetchHostedRuntimePremiumStatus(sessionId).catch(() => null);

      if (!cancelled) {
        setStatus(next);
      }
    };

    void refresh();

    const timer = window.setInterval(refresh, 15_000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const active = status?.status === 'active';

  return (
    <a
      href="/premium"
      title={
        active
          ? `${status.creditsRemaining.toLocaleString()} of ${status.creditsAllowance.toLocaleString()} Premium credits remain`
          : 'Explore WebCoder.codes Premium'
      }
      className="inline-flex rounded-full border border-[#8aae15] bg-[#d9ff43] px-3 py-1 text-xs font-bold text-[#11130f] transition hover:-translate-y-0.5 hover:bg-[#c9ef31]"
    >
      {active ? `WebCoder · ${status.creditsRemaining.toLocaleString()} credits` : 'WebCoder Premium'}
    </a>
  );
}
