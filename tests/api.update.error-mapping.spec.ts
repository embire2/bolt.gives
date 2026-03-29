import { describe, expect, it } from 'vitest';
import { toUserSafeUpdateError } from '../app/routes/api.update';

describe('toUserSafeUpdateError', () => {
  it('maps unenv fs errors to a user-safe message', () => {
    const result = toUserSafeUpdateError(new Error('[unenv] fs.readFile is not implemented yet!'));

    expect(result).toContain('Update checks are unavailable in this runtime');
  });

  it('maps update-manager prefixed runtime errors to a user-safe message', () => {
    const result = toUserSafeUpdateError(new Error('Update manager: [unenv] fs.readFile is not implemented yet!'));

    expect(result).toContain('Update checks are unavailable in this runtime');
  });

  it('returns regular errors unchanged', () => {
    const result = toUserSafeUpdateError(new Error('Failed to fetch latest package.json (500)'));

    expect(result).toBe('Failed to fetch latest package.json (500)');
  });
});
