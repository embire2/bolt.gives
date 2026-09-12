import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createSingleUserProfiles } from './single-user-profile.mjs';

const roots: string[] = [];
const accessToken = 'test-only-owner-access-token-not-a-production-secret';

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'bolt-owner-test-'));
  roots.push(root);

  const options = { root, env: { BOLT_SELF_HOST_MODE: 'single-user', BOLT_SELF_HOST_ACCESS_TOKEN: accessToken } };

  return { root, options, profiles: createSingleUserProfiles(options) };
}
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe('database-free single-owner profiles', () => {
  it('requires explicit mode and a strong operator token', async () => {
    const { root } = await fixture();
    const disabled = createSingleUserProfiles({ root, env: {} });
    expect(disabled.enabled).toBe(false);
    await expect(disabled.login({ accessToken })).rejects.toMatchObject({ status: 503 });

    const weak = createSingleUserProfiles({
      root,
      env: { BOLT_SELF_HOST_MODE: 'single-user', BOLT_SELF_HOST_ACCESS_TOKEN: 'short' },
    });
    await expect(weak.login({ accessToken: 'short' })).rejects.toMatchObject({ status: 503 });
  });
  it('persists only hashes privately and restores the same profile after restart', async () => {
    const { root, options, profiles } = await fixture();
    await expect(profiles.login({ accessToken: 'incorrect' })).rejects.toMatchObject({ status: 401 });

    const first = await profiles.login({ accessToken });
    const restarted = createSingleUserProfiles(options);
    expect((await restarted.session(first.session)).profile.id).toBe(first.profile.id);
    expect((await restarted.login({ accessToken })).profile.id).toBe(first.profile.id);

    const raw = await fs.readFile(path.join(root, 'owner-profile.json'), 'utf8');
    expect(raw).not.toContain(accessToken);
    expect(raw).not.toContain(first.session.token);
    expect((await fs.stat(path.join(root, 'owner-profile.json'))).mode & 0o777).toBe(0o600);
    await restarted.logout(first.session);
    await expect(restarted.session(first.session)).rejects.toMatchObject({ status: 401 });
  });
  it('expires sessions, invalidates them on rotation, and bounds guessing', async () => {
    const { options } = await fixture();
    let now = Date.now();
    const profiles = createSingleUserProfiles({ ...options, now: () => now });
    const result = await profiles.login({ accessToken });
    now += 31 * 24 * 60 * 60 * 1000;
    await expect(profiles.session(result.session)).rejects.toMatchObject({ status: 401 });

    const rotated = createSingleUserProfiles({
      ...options,
      env: { ...options.env, BOLT_SELF_HOST_ACCESS_TOKEN: `${accessToken}-rotated` },
    });
    await expect(rotated.session(result.session)).rejects.toMatchObject({ status: 401 });

    for (let i = 0; i < 10; i++) {
      await expect(rotated.login({ accessToken: 'wrong' })).rejects.toMatchObject({ status: 401 });
    }
    await expect(rotated.login({ accessToken: 'wrong' })).rejects.toMatchObject({ status: 429 });
  });
  it('serializes concurrent logins without losing sessions or creating different owners', async () => {
    const { profiles } = await fixture();
    const results = await Promise.all([profiles.login({ accessToken }), profiles.login({ accessToken })]);
    expect(results[0].profile.id).toBe(results[1].profile.id);

    for (const result of results) {
      expect((await profiles.session(result.session)).profile.id).toBe(result.profile.id);
    }
  });
});
