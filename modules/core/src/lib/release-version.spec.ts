import { describe, expect, it } from 'vitest';
import { compareReleaseVersions } from './release-version';

describe('release update ordering', () => {
  it.each([
    ['4.1.0', '4.1.0-beta.1'],
    ['4.1.0-beta.2', '4.1.0-beta.1'],
    ['4.1.0-beta.10', '4.1.0-beta.2'],
    ['4.1.0-rc.1', '4.1.0-beta.10'],
    ['4.1.0-beta.1', '4.0.1'],
    ['3.0.9.20', '3.0.9.9'],
    ['4.1.0-beta.1', '4.1.0-beta'],
    ['4.1.0-alpha', '4.1.0-1'],
  ])('orders %s after %s without suppressing the stable upgrade', (newer, older) => {
    expect(compareReleaseVersions(newer, older)).toBe(1);
    expect(compareReleaseVersions(older, newer)).toBe(-1);
  });

  it.each([
    ['v4.1.0', '4.1.0'],
    ['4.1.0+build.7', '4.1.0+build.8'],
    ['4.1.0-beta.1+fixture', '4.1.0-beta.1'],
    ['3.0.9.0', '3.0.9'],
  ])('ignores prefix/build metadata when comparing %s and %s', (left, right) => {
    expect(compareReleaseVersions(left, right)).toBe(0);
  });

  it.each(['', 'desktop-v1.10.2', 'not-a-version', '4.1.0-', '4.1.0-beta..1', '9007199254740992.0.0'])(
    'rejects invalid or unrelated release version %s instead of treating it as zero',
    (version) => {
      expect(() => compareReleaseVersions(version, '4.0.1')).toThrow('Invalid release version');
    },
  );
});
