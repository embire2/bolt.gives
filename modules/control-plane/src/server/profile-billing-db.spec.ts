import { describe, expect, it } from 'vitest';
import { normalizeProfileBillingTimestamp, shouldResetProfileBillingUsage } from './profile-billing-db.mjs';

describe('profile billing database state', () => {
  it('normalizes PostgreSQL Date values to stable Stripe-comparable timestamps', () => {
    expect(normalizeProfileBillingTimestamp(new Date('2026-07-31T12:00:00.000Z'))).toBe('2026-07-31T12:00:00.000Z');
    expect(normalizeProfileBillingTimestamp('not-a-date')).toBeNull();
  });

  it('resets usage only when an active subscription enters a new paid period', () => {
    const currentPeriodStart = '2026-07-01T00:00:00.000Z';

    expect(
      shouldResetProfileBillingUsage({
        status: 'active',
        nextPeriodStart: currentPeriodStart,
        currentPeriodStart,
      }),
    ).toBe(false);
    expect(
      shouldResetProfileBillingUsage({
        status: 'active',
        nextPeriodStart: '2026-08-01T00:00:00.000Z',
        currentPeriodStart,
      }),
    ).toBe(true);
    expect(
      shouldResetProfileBillingUsage({
        status: 'past_due',
        nextPeriodStart: '2026-08-01T00:00:00.000Z',
        currentPeriodStart,
      }),
    ).toBe(false);
  });
});
