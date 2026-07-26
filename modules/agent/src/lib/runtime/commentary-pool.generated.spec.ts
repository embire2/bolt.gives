import { describe, expect, it } from 'vitest';
import { COMMENTARY_POOL_BY_PHASE, COMMENTARY_POOL_SIZE, getCommentaryPoolMessage } from './commentary-pool.generated';

describe('commentary pool', () => {
  it('contains exactly 300 messages with even phase distribution', () => {
    expect(COMMENTARY_POOL_SIZE).toBe(300);
    expect(COMMENTARY_POOL_BY_PHASE.plan.length).toBe(60);
    expect(COMMENTARY_POOL_BY_PHASE.action.length).toBe(60);
    expect(COMMENTARY_POOL_BY_PHASE.verification.length).toBe(60);
    expect(COMMENTARY_POOL_BY_PHASE['next-step'].length).toBe(60);
    expect(COMMENTARY_POOL_BY_PHASE.recovery.length).toBe(60);
  });

  it('selects deterministic pool messages by seed', () => {
    const sample = COMMENTARY_POOL_BY_PHASE.action[5];
    expect(getCommentaryPoolMessage('action', 5, 'fallback')).toBe(sample);
  });

  it('falls back safely when seed is invalid', () => {
    expect(getCommentaryPoolMessage('plan', Number.NaN, 'fallback')).toBe(COMMENTARY_POOL_BY_PHASE.plan[0]);
    expect(getCommentaryPoolMessage('recovery', Number.POSITIVE_INFINITY, 'fallback')).toBe(
      COMMENTARY_POOL_BY_PHASE.recovery[0],
    );
  });
});
