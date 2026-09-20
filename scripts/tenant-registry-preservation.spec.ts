import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { expect, it } from 'vitest';

it('never overwrites an unreadable or malformed tenant registry with default credentials', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'bolt-tenant-registry-'));
  const registry = path.join(root, 'tenant.json');

  try {
    const stdout = execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `
      import fs from 'node:fs/promises';
      import assert from 'node:assert/strict';
      import { ensureTenantRegistry } from './scripts/runtime-server.mjs';
      const file = process.env.RUNTIME_TENANT_REGISTRY_PATH;
      const original = JSON.stringify({ admin: { username: 'owner', passwordHash: 'private-test-hash', mustChangePassword: false, updatedAt: '2026-01-01T00:00:00.000Z' }, tenants: [] });
      await fs.writeFile(file, original, { mode: 0o600 });
      const a = await ensureTenantRegistry();
      const b = await ensureTenantRegistry();
      assert.equal(a.admin.passwordUpdatedAt, b.admin.passwordUpdatedAt);
      assert.equal(a.admin.passwordHash, 'private-test-hash');
      assert.equal(await fs.readFile(file, 'utf8'), original);
      await fs.writeFile(file, '{incomplete');
      await assert.rejects(ensureTenantRegistry(), /preserved/);
      assert.equal(await fs.readFile(file, 'utf8'), '{incomplete');
      console.log('registry-preserved');
    `,
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: { ...process.env, RUNTIME_TENANT_REGISTRY_PATH: registry },
        timeout: 20000,
      },
    );
    expect(stdout).toContain('registry-preserved');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}, 25000);
