import { describe, expect, it } from 'vitest';
import { shouldUseFreeTokenAllowance } from './profile-free-usage';

describe('profile token plan selection', () => {
  it('does not stack the FREE daily allowance onto an active Custom Domain project', () => {
    expect(shouldUseFreeTokenAllowance('FREE', 'active')).toBe(false);
  });

  it('keeps the FREE allowance for unpaid and inactive projects', () => {
    expect(shouldUseFreeTokenAllowance('FREE', 'pending')).toBe(true);
    expect(shouldUseFreeTokenAllowance('FREE', 'inactive')).toBe(true);
  });

  it('does not apply the hosted allowance to providers using a client API key', () => {
    expect(shouldUseFreeTokenAllowance('OpenAI', null)).toBe(false);
  });
});
