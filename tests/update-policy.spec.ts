import { describe, expect, it } from 'vitest';
import {
  buildDismissedUpdateStorageKey,
  extractReleaseFeatures,
  parseUpdatePolicyFromReleaseBody,
} from '../app/lib/api/update-policy';

describe('update policy parsing', () => {
  it('defaults releases to optional updates', () => {
    const result = parseUpdatePolicyFromReleaseBody('Changed:\n- Faster preview startup');

    expect(result.policy).toBe('optional');
    expect(result.features).toEqual(['Faster preview startup']);
  });

  it('parses mandatory release policy markers', () => {
    const result = parseUpdatePolicyFromReleaseBody('Update policy: mandatory\n\nFeatures:\n- Security fix');

    expect(result.policy).toBe('mandatory');
    expect(result.features).toEqual(['Security fix']);
  });

  it('lets environment policy override release notes', () => {
    const result = parseUpdatePolicyFromReleaseBody('Update policy: optional\n\nChanged:\n- Runtime update', 'forced');

    expect(result.policy).toBe('mandatory');
  });

  it('stops feature extraction at validation sections', () => {
    expect(
      extractReleaseFeatures('Changed:\n- New updater\n- Live progress\n\nValidation:\n- pnpm test'),
    ).toEqual(['New updater', 'Live progress']);
  });

  it('builds stable localStorage keys for dismissed optional versions', () => {
    expect(buildDismissedUpdateStorageKey('v3.0.9.21 beta')).toBe('bolt_update_dismissed_3.0.9.21-beta');
  });
});
