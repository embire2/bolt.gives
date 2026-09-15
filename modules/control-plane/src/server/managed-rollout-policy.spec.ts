import { describe, expect, it } from 'vitest';
import { automaticManagedRolloutEnabled } from './managed-rollout-policy.mjs';

describe('automatic managed rollout policy', () => {
  it('disables startup as well as periodic rollout in manual-only canary mode', () => {
    expect(automaticManagedRolloutEnabled({ intervalMs: 0 })).toBe(false);
    expect(automaticManagedRolloutEnabled({ intervalMs: -1 })).toBe(false);
    expect(automaticManagedRolloutEnabled({ intervalMs: NaN })).toBe(false);
    expect(automaticManagedRolloutEnabled({ enabled: false, intervalMs: 600_000 })).toBe(false);
    expect(automaticManagedRolloutEnabled({ intervalMs: 600_000 })).toBe(true);
  });
});
