import { describe, expect, it } from 'vitest';

import { shouldTreatInstallFailureAsFatal } from './install-playwright-utils.mjs';

describe('shouldTreatInstallFailureAsFatal', () => {
  it('returns false by default', () => {
    expect(shouldTreatInstallFailureAsFatal({})).toBe(false);
  });

  it('returns true when PLAYWRIGHT_INSTALL_REQUIRED is enabled', () => {
    expect(shouldTreatInstallFailureAsFatal({ PLAYWRIGHT_INSTALL_REQUIRED: '1' })).toBe(true);
  });
});
