import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readMergedRuntimeEnv, readRuntimeEnvFileSync, updateRuntimeEnvFile } from './runtime-env-file.mjs';

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

  it('shadows inherited service credentials when smtp keys are explicitly cleared', async () => {
    const envFile = await createTempEnvFile();

    await updateRuntimeEnvFile(
      {
        BOLT_ADMIN_SMTP_PASSWORD: null,
      },
      { BOLT_RUNTIME_ENV_FILE: envFile },
    );

    const snapshot = readRuntimeEnvFileSync({ BOLT_RUNTIME_ENV_FILE: envFile });
    expect(snapshot.values.BOLT_ADMIN_SMTP_PASSWORD).toBe('');
    expect(snapshot.values.EXISTING_KEY).toBe('keep');
    expect(
      readMergedRuntimeEnv({ BOLT_RUNTIME_ENV_FILE: envFile, BOLT_ADMIN_SMTP_PASSWORD: 'inherited' })
        .BOLT_ADMIN_SMTP_PASSWORD,
    ).toBe('');
  });

  it('preserves a password omitted while saving other mail settings', async () => {
    const envFile = await createTempEnvFile();
    const snapshot = await updateRuntimeEnvFile(
      { BOLT_ADMIN_SMTP_HOST: 'smtp.example.com', BOLT_ADMIN_SMTP_PASSWORD: undefined },
      { BOLT_RUNTIME_ENV_FILE: envFile },
    );
    expect(snapshot.values.BOLT_ADMIN_SMTP_PASSWORD).toBe('old-secret');
    expect(snapshot.values.BOLT_ADMIN_SMTP_HOST).toBe('smtp.example.com');
    expect((await fs.stat(envFile)).mode & 0o777).toBe(0o600);
  });

  it('uses inherited service configuration with a separate writable override file', async () => {
    const envFile = await createTempEnvFile();
    const env = {
      BOLT_RUNTIME_ENV_FILE: envFile,
      BOLT_ADMIN_SMTP_HOST: 'inherited.example.com',
      BOLT_ADMIN_SMTP_USER: 'inherited-user',
    };
    expect(readMergedRuntimeEnv(env).BOLT_ADMIN_SMTP_HOST).toBe('inherited.example.com');
    await updateRuntimeEnvFile({ BOLT_ADMIN_SMTP_HOST: 'saved.example.com' }, env);
    expect(readMergedRuntimeEnv(env).BOLT_ADMIN_SMTP_HOST).toBe('saved.example.com');
    expect(readMergedRuntimeEnv(env).BOLT_ADMIN_SMTP_USER).toBe('inherited-user');
  });

  it('rejects setting-name injection before writing', async () => {
    const envFile = await createTempEnvFile();
    const original = await fs.readFile(envFile, 'utf8');
    await expect(
      updateRuntimeEnvFile({ 'BROKEN\nINJECTED': 'value' }, { BOLT_RUNTIME_ENV_FILE: envFile }),
    ).rejects.toThrow('Invalid runtime setting');
    expect(await fs.readFile(envFile, 'utf8')).toBe(original);
  });
});
