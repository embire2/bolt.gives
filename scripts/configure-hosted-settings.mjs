#!/usr/bin/env node
// Separate mutable application settings from the root-owned service configuration.
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { parse } from 'dotenv';

const target = process.argv[2];

if (process.getuid() !== 0 || !['alpha', 'production'].includes(target) || !process.argv.includes('--apply')) {
  throw new Error('Usage (root): configure-hosted-settings.mjs alpha|production --apply');
}

const prefix = target === 'alpha' ? 'bolt-gives-alpha' : 'bolt-gives';
const filename = `/etc/bolt-gives/${target}-isolated.env`;
const env = parse(await fs.readFile(filename, 'utf8'));
const directory = `/srv/${prefix}-isolated-control-plane`;
const settingsPath = `${directory}/runtime-settings.env`;
const uid = Number(execFileSync('id', ['-u', 'bolt-runtime-agent'], { encoding: 'utf8' }).trim());
const gid = Number(execFileSync('id', ['-g', 'bolt-runtime-agent'], { encoding: 'utf8' }).trim());

if (!uid || !gid || env.RUNTIME_WORKSPACE_DIR !== `/srv/${prefix}-isolated-workspaces`) {
  throw new Error('The non-root isolated target must already be configured.');
}

if (env.BOLT_RUNTIME_ENV_FILE && env.BOLT_RUNTIME_ENV_FILE !== settingsPath) {
  throw new Error('Existing custom runtime settings require an explicit migration; nothing was changed.');
}

await fs.mkdir(directory, { mode: 0o700 }).catch((error) => {
  if (error.code !== 'EEXIST') {
    throw error;
  }
});

const directoryStat = await fs.lstat(directory);

if (!directoryStat.isDirectory() || (await fs.realpath(directory)) !== directory || directoryStat.mode & 0o077) {
  throw new Error('Runtime settings require a private real directory.');
}

await fs.chown(directory, uid, gid);

try {
  await fs.writeFile(settingsPath, '', { mode: 0o600, flag: 'wx' });
  await fs.chown(settingsPath, uid, gid);
} catch (error) {
  if (error.code !== 'EEXIST') {
    throw error;
  }
}

const settingsStat = await fs.lstat(settingsPath);

if (!settingsStat.isFile() || settingsStat.uid !== uid || settingsStat.mode & 0o077) {
  throw new Error('Existing settings must be a mode-0600 regular file owned by the runner.');
}

await fs.copyFile(filename, `${filename}.before-settings-${Date.now()}`, fs.constants.COPYFILE_EXCL);
env.BOLT_RUNTIME_ENV_FILE = settingsPath;
env.BOLT_PROJECT_CADDY_RELOAD_SERVICE = 'bolt-gives-caddy-reload.service';

const temporary = `${filename}.${crypto.randomUUID()}.tmp`;
await fs.writeFile(
  temporary,
  `${Object.entries(env)
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join('\n')}\n`,
  { mode: 0o600, flag: 'wx' },
);
await fs.rename(temporary, filename);
console.log(JSON.stringify({ target, settingsPath, uid, servicesChanged: false }));
