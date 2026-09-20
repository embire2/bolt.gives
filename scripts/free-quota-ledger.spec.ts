import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';

it('serializes concurrent usage, deduplicates retries and refuses a corrupt ledger', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'bolt-quota-ledger-'));
  const ledger = path.join(root, 'quota.json');

  try {
    const { stdout } = await promisify(execFile)(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `
      import fs from 'node:fs/promises';
      import assert from 'node:assert/strict';
      import { recordFreeUsageQuota, checkFreeUsageQuota } from './scripts/runtime-server.mjs';
      const base = { subjectHash: 'a'.repeat(64), now: new Date('2026-09-20T12:00:00Z'), activeDurationMs: 60000, usage: { totalTokens: 5000 } };
      await Promise.all(Array.from({ length: 20 }, (_, i) => recordFreeUsageQuota({ ...base, runId: 'run-' + i })));
      await Promise.all(Array.from({ length: 5 }, () => recordFreeUsageQuota({ ...base, runId: 'run-0' })));
      const decision = await checkFreeUsageQuota(base);
      assert.equal(decision.usedTokens, 20);
      assert.equal(decision.allowed, false);
      assert.equal(decision.resetAt, '2026-09-20T22:00:00.000Z');
      assert.equal((await checkFreeUsageQuota({ ...base, now: new Date('2026-09-20T22:00:00Z') })).usedTokens, 0);
      const file = process.env.RUNTIME_FREE_USAGE_QUOTA_PATH;
      assert.equal((await fs.stat(file)).mode & 0o777, 0o600);
      await fs.writeFile(file, '{broken');
      await assert.rejects(checkFreeUsageQuota(base));
      console.log('quota-contract-passed');
    `,
      ],
      {
        cwd: process.cwd(),
        env: { ...process.env, RUNTIME_FREE_USAGE_QUOTA_PATH: ledger, BOLT_FREE_DAILY_TOKEN_LIMIT: '20' },
        timeout: 20000,
      },
    );
    expect(stdout).toContain('quota-contract-passed');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}, 25000);
