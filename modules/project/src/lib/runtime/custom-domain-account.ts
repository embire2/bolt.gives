import { createHostedRuntimeCustomDomainCheckout } from '@bolt/runtime/lib/runtime/hosted-runtime-client';

type AccountDomainResult = {
  ok?: boolean;
  requiresCheckout?: boolean;
  message?: string;
  dnsInstructions?: { note?: string };
};

export async function startCustomDomainBilling(input: { sessionId: string; customDomain: string }) {
  const accountResponse = await fetch('/api/billing/attach-domain', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(input),
  });
  const accountResult = (await accountResponse.json().catch(() => null)) as AccountDomainResult | null;

  if (accountResponse.ok && accountResult?.ok) {
    return {
      status:
        accountResult.dnsInstructions?.note ||
        'Custom Domain attached. Create its A record, then use Verify DNS in Preview.',
      checkoutUrl: null,
    };
  }

  if (!accountResult?.requiresCheckout) {
    throw new Error(accountResult?.message || 'Unable to attach this Custom Domain to the account.');
  }

  const checkout = await createHostedRuntimeCustomDomainCheckout(input);

  return { status: checkout.dnsInstructions.note, checkoutUrl: checkout.checkoutUrl };
}
