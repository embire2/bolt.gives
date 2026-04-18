import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readRuntimeEnvFileSync, updateRuntimeEnvFile } from './runtime-env-file.mjs';

const tempDirs: string[] = [];

async function createTempEnvFile() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bolt-runtime-env-'));
  tempDirs.push(dir);
  const file = path.join(dir, 'runtime.env');
  await fs.writeFile(file, 'EXISTING_KEY="keep"\nBOLT_ADMIN_SMTP_PASSWORD="old-secret"\n', 'utf8');
  return file;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe('runtime-env-file', () => {
  it('updates smtp values while preserving unrelated keys', async () => {
    const envFile = await createTempEnvFile();

    const snapshot = await updateRuntimeEnvFile(
      {
        BOLT_ADMIN_SMTP_HOST: 'smtp.example.com',
        BOLT_ADMIN_SMTP_PORT: '587',
        BOLT_ADMIN_SMTP_FROM: 'hello@example.com',
        BOLT_ADMIN_SMTP_PASSWORD: 'new-secret',
      },
      { BOLT_RUNTIME_ENV_FILE: envFile },
    );

    expect(snapshot.values.EXISTING_KEY).toBe('keep');
    expect(snapshot.values.BOLT_ADMIN_SMTP_HOST).toBe('smtp.example.com');
    expect(snapshot.values.BOLT_ADMIN_SMTP_PASSWORD).toBe('new-secret');
  });

  it('removes smtp keys when they are cleared', async () => {
    const envFile = await createTempEnvFile();

    await updateRuntimeEnvFile(
      {
        BOLT_ADMIN_SMTP_PASSWORD: null,
      },
      { BOLT_RUNTIME_ENV_FILE: envFile },
    );

    const snapshot = readRuntimeEnvFileSync({ BOLT_RUNTIME_ENV_FILE: envFile });
    expect(snapshot.values.BOLT_ADMIN_SMTP_PASSWORD).toBeUndefined();
    expect(snapshot.values.EXISTING_KEY).toBe('keep');
  });
});
