import { describe, expect, it } from 'vitest';
import { formatProfileTimestamp } from './profile-display';

describe('profile date hydration', () => {
  it('does not depend on the machine locale or time zone', () => {
    expect(formatProfileTimestamp('2026-09-12T19:10:00+02:00')).toBe('2026-09-12 17:10 UTC');
  });
  it('handles absent and invalid timestamps', () => {
    expect(formatProfileTimestamp(null)).toBe('Recently');
    expect(formatProfileTimestamp('invalid')).toBe('Unavailable');
  });
});
