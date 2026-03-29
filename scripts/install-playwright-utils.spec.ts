import { describe, expect, it } from 'vitest';

import { shouldTreatInstallFailureAsFatal } from './install-playwright-utils.mjs';

describe('shouldTreatInstallFailureAsFatal', () => {
  it('returns false by default', () => {
    expect(shouldTreatInstallFailureAsFatal({})).toBe(false);
  });

  it('returns true when PLAYWRIGHT_INSTALL_REQUIRED is enabled', () => {
    expect(shouldTreatInstallFailureAsFatal({ PLAYWRIGHT_INSTALL_REQUIRED: '1' })).toBe(true);
    expect(shouldTreatInstallFailureAsFatal({ PLAYWRIGHT_INSTALL_REQUIRED: 'true' })).toBe(true);
    expect(shouldTreatInstallFailureAsFatal({ PLAYWRIGHT_INSTALL_REQUIRED: 'yes' })).toBe(true);
  });

  it('returns false for explicit false-like values', () => {
    expect(shouldTreatInstallFailureAsFatal({ PLAYWRIGHT_INSTALL_REQUIRED: '0' })).toBe(false);
    expect(shouldTreatInstallFailureAsFatal({ PLAYWRIGHT_INSTALL_REQUIRED: 'false' })).toBe(false);
    expect(shouldTreatInstallFailureAsFatal({ PLAYWRIGHT_INSTALL_REQUIRED: 'no' })).toBe(false);
    expect(shouldTreatInstallFailureAsFatal({ PLAYWRIGHT_INSTALL_REQUIRED: 'off' })).toBe(false);
    expect(shouldTreatInstallFailureAsFatal({ PLAYWRIGHT_INSTALL_REQUIRED: '' })).toBe(false);
  });
});
