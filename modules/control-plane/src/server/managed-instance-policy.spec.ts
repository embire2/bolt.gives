import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readManagedInstancePolicy, updateManagedInstancePolicy } from './managed-instance-policy.mjs';
import { claimManagedInstanceTrial, normalizeManagedInstanceRegistry } from './managed-instances.mjs';

describe('one managed instance per account', () => {
  it('persists the admin override privately and defaults to enabled', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'instance-policy-'));
    const env = { BOLT_RUNTIME_ENV_FILE: path.join(root, 'settings.env') };

    try {
      expect(readManagedInstancePolicy(env).singleInstancePerUser).toBe(true);
      await updateManagedInstancePolicy(false, env);
      expect(readManagedInstancePolicy(env).singleInstancePerUser).toBe(false);
      expect((await fs.stat(env.BOLT_RUNTIME_ENV_FILE)).mode & 0o777).toBe(0o600);
      await updateManagedInstancePolicy(true, env);
      expect(readManagedInstancePolicy(env).singleInstancePerUser).toBe(true);
      await expect(updateManagedInstancePolicy('false', env)).rejects.toThrow('boolean');
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
  it('blocks another browser by normalized identity, but an admin can allow additional instances', () => {
    const registry = normalizeManagedInstanceRegistry({ instances: [] });
    const identity = { name: 'Test User', email: 'test@example.com' };
    const first = claimManagedInstanceTrial(registry, { ...identity, requestedSubdomain: 'first-app' });
    expect(
      claimManagedInstanceTrial(registry, {
        ...identity,
        email: ' TEST@example.com ',
        requestedSubdomain: 'second-app',
      }).kind,
    ).toBe('conflict');

    const second = claimManagedInstanceTrial(registry, {
      ...identity,
      requestedSubdomain: 'second-app',
      sessionSecret: first.sessionSecret,
      singleInstancePerUser: false,
    });
    expect(second.kind).toBe('created');
    expect(second.sessionSecret).not.toBe(first.sessionSecret);
    expect(registry.instances).toHaveLength(2);
    expect(claimManagedInstanceTrial(registry, { ...identity, requestedSubdomain: 'third-app' }).kind).toBe('conflict');
    expect(registry.instances).toHaveLength(2);
  });

  it('does not reuse a previous account instance after switching profiles', () => {
    const registry = normalizeManagedInstanceRegistry({ instances: [] });
    const first = claimManagedInstanceTrial(registry, {
      name: 'First User',
      email: 'first@example.invalid',
      requestedSubdomain: 'first-app',
    });
    const next = claimManagedInstanceTrial(registry, {
      name: 'Second User',
      email: 'second@example.invalid',
      requestedSubdomain: 'second-app',
      sessionSecret: first.sessionSecret,
    });
    expect(next.kind).toBe('created');
    expect(next.instance.email).toBe('second@example.invalid');
    expect(next.sessionSecret).not.toBe(first.sessionSecret);
  });
});
