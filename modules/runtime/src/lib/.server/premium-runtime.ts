import { resolveHostedRuntimeBaseUrlForRequest } from './hosted-runtime-snapshot';

export type PremiumRuntimeStatus = {
  plan: 'free' | 'webcoder-premium';
  status: 'inactive' | 'pending' | 'active' | 'past_due' | 'canceled';
  creditsAllowance: number;
  creditsUsed: number;
  creditsRemaining: number;
  periodEnd: string | null;
  customDomain: string | null;
};

export type PremiumTaskCharge = {
  creditsCharged: number;
  creditsRemaining: number;
  complexity: 'quick' | 'standard' | 'advanced' | 'deep';
  premium: PremiumRuntimeStatus;
};

export class PremiumRuntimeError extends Error {
  statusCode: number;
  isRetryable: boolean;
  provider = 'WebCoder.codes Premium';

  constructor(message: string, statusCode: number, isRetryable: boolean) {
    super(message);
    this.name = 'PremiumRuntimeError';
    this.statusCode = statusCode;
    this.isRetryable = isRetryable;
  }
}

export async function fetchPremiumRuntimeStatus(options: {
  requestUrl: string;
  sessionId: string;
}): Promise<PremiumRuntimeStatus | null> {
  const runtimeBaseUrl = resolveHostedRuntimeBaseUrlForRequest(options.requestUrl);
  const response = await fetch(`${runtimeBaseUrl}/sessions/${encodeURIComponent(options.sessionId.trim())}/premium`, {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as { premium?: PremiumRuntimeStatus };

  return payload.premium || null;
}

export async function consumePremiumRuntimeCredits(options: {
  requestUrl: string;
  sessionId: string;
  prompt: string;
  chatMode: 'build' | 'discuss';
  contextFileCount: number;
  internalSecret: string;
}): Promise<PremiumTaskCharge> {
  if (!options.internalSecret) {
    throw new PremiumRuntimeError(
      'WebCoder Premium metering is temporarily unavailable, so the task was stopped before untracked usage occurred.',
      503,
      true,
    );
  }

  const runtimeBaseUrl = resolveHostedRuntimeBaseUrlForRequest(options.requestUrl);
  const response = await fetch(
    `${runtimeBaseUrl}/sessions/${encodeURIComponent(options.sessionId.trim())}/premium/credits/consume`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Bolt-Premium-Internal': options.internalSecret,
      },
      body: JSON.stringify({
        prompt: options.prompt,
        chatMode: options.chatMode,
        contextFileCount: options.contextFileCount,
      }),
    },
  );
  const payload = (await response.json().catch(() => ({}))) as Record<string, any>;

  if (!response.ok) {
    if (response.status === 402 || payload.reason === 'credits-exhausted') {
      throw new PremiumRuntimeError(
        `This project has ${Number(payload.creditsRemaining || 0)} Premium credits remaining, but the task needs ${Number(payload.creditsRequired || 0)}. Credits reset after the next successful 28-day renewal.`,
        402,
        false,
      );
    }

    throw new PremiumRuntimeError(
      payload.message || `Premium metering failed with status ${response.status}.`,
      503,
      true,
    );
  }

  return payload as PremiumTaskCharge;
}

export function buildPremiumAgentExecutionContract(charge: PremiumTaskCharge) {
  return `[WebCoder.codes Premium execution contract]
This project has active Premium access. The current request is classified as ${charge.complexity} and has charged ${charge.creditsCharged} credits.
- Work in Deep Build mode: inspect existing state, form a concrete plan, implement, test, and verify the live preview before stopping.
- Use checkpoints around risky changes and preserve a rollback path.
- Run independent implementation and review passes when the task spans architecture, data, deployment, security, or billing.
- Treat production logs, build output, browser errors, and health checks as first-class context.
- Prefer complete working outcomes over scaffolds, placeholders, or hand-off instructions.
- Keep progress factual and tied to actual execution events.
Do not claim Premium capabilities that were not executed. ${charge.creditsRemaining} credits remain after this task reservation.`;
}
