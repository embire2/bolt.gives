import { useState, type ReactNode } from 'react';
import { securedFetch } from '@bolt/project/lib/hooks/useCsrf';

export function BillingUpgradeButton({ children, className }: { children: ReactNode; className?: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startCheckout = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await securedFetch('/api/billing/checkout', {
        method: 'POST',
        headers: { Accept: 'application/json' },
      });
      const payload = (await response.json().catch(() => null)) as { checkoutUrl?: string; message?: string } | null;

      if (response.status === 401) {
        window.location.assign('/login?returnTo=%2Fpricing');
        return;
      }

      if (!response.ok || !payload?.checkoutUrl) {
        throw new Error(payload?.message || 'Unable to start secure Stripe Checkout.');
      }

      window.location.assign(payload.checkoutUrl);
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : 'Unable to start secure Stripe Checkout.');
      setLoading(false);
    }
  };

  return (
    <span className="block">
      <button type="button" onClick={startCheckout} disabled={loading} className={className}>
        {loading ? 'Opening secure checkout...' : children}
      </button>
      {error ? <span className="mt-2 block text-xs font-semibold text-red-700">{error}</span> : null}
    </span>
  );
}
