import { describe, expect, it } from 'vitest';
import { getScreenshotMinimumBytes } from './release-gate-utils.mjs';

describe('release gate screenshot thresholds', () => {
  it('keeps content-heavy screenshots on the default threshold', () => {
    expect(getScreenshotMinimumBytes('home.png')).toBe(60_000);
    expect(getScreenshotMinimumBytes('/tmp/bolt-release-gate/chat.png')).toBe(60_000);
  });

  it('allows the empty workspace capture to be lighter while still rejecting blank images', () => {
    expect(getScreenshotMinimumBytes('system-in-action.png')).toBe(40_000);
    expect(getScreenshotMinimumBytes('/tmp/bolt-release-gate/system-in-action.png')).toBe(40_000);
  });
});
