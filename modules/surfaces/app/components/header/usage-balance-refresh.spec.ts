import { describe, expect, it } from 'vitest';
import {
  PROJECT_ENTITLEMENT_REFRESH_INTERVAL_MS,
  shouldRefreshProjectEntitlement,
  USAGE_BALANCE_REFRESH_INTERVAL_MS,
} from './usage-balance-refresh';

describe('usage balance refresh policy', () => {
  it('uses low-frequency idle reconciliation', () => {
    expect(USAGE_BALANCE_REFRESH_INTERVAL_MS).toBe(60_000);
    expect(PROJECT_ENTITLEMENT_REFRESH_INTERVAL_MS).toBe(300_000);
  });

  it('refreshes project entitlement only for a new session, expiry, or explicit event', () => {
    const base = {
      sessionId: 'project-a',
      previousSessionId: 'project-a',
      lastRefreshedAt: 1_000,
    };

    expect(shouldRefreshProjectEntitlement({ ...base, now: 2_000 })).toBe(false);
    expect(
      shouldRefreshProjectEntitlement({
        ...base,
        sessionId: 'project-b',
        now: 2_000,
      }),
    ).toBe(true);
    expect(
      shouldRefreshProjectEntitlement({
        ...base,
        sessionId: null,
        now: 2_000,
      }),
    ).toBe(true);
    expect(
      shouldRefreshProjectEntitlement({
        sessionId: null,
        previousSessionId: null,
        lastRefreshedAt: 0,
        now: 2_000,
      }),
    ).toBe(false);
    expect(
      shouldRefreshProjectEntitlement({
        ...base,
        now: 1_000 + PROJECT_ENTITLEMENT_REFRESH_INTERVAL_MS,
      }),
    ).toBe(true);
    expect(shouldRefreshProjectEntitlement({ ...base, now: 2_000, force: true })).toBe(true);
  });
});
