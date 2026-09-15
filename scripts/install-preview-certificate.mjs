#!/usr/bin/env node
/*
 * Certbot deploy hook: publish a matching certificate/key pair atomically, then
 * validate/reload Caddy. A failed reload restores the previous pair.
 */
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const lineage = process.env.RENEWED_LINEAGE;

if (process.getuid() !== 0 || lineage !== '/etc/letsencrypt/live/bolt-preview-wildcards') {
  throw new Error('Only the root-owned production Preview certificate lineage is accepted.');
}

const cert = await fs.readFile(`${lineage}/fullchain.pem`);
const key = await fs.readFile(`${lineage}/privkey.pem`);
const parsed = new crypto.X509Certificate(cert);
const certificateKey = parsed.publicKey.export({ type: 'spki', format: 'der' });
const privateKey = crypto.createPublicKey(crypto.createPrivateKey(key)).export({ type: 'spki', format: 'der' });

if (!certificateKey.equals(privateKey) || Date.parse(parsed.validTo) < Date.now() + 7 * 86400_000) {
  throw new Error('Preview certificate has a mismatching key or insufficient validity.');
}

for (const domain of ['preview.instances.bolt.gives', 'alpha-preview.instances.bolt.gives']) {
  if (!parsed.checkHost(`certificate-check.${domain}`)) {
    throw new Error('Preview certificate is missing a required wildcard.');
  }
}

const gid = Number((await run('getent', ['group', 'caddy'])).stdout.split(':')[2]);

if (!gid) {
  throw new Error('The Caddy service group is required.');
}

const root = '/etc/caddy/bolt-gives-preview-certs';
await fs.mkdir(root, { mode: 0o750 }).catch((error) => {
  if (error.code !== 'EEXIST') {
    throw error;
  }
});

const rootStat = await fs.lstat(root);

if (!rootStat.isDirectory() || rootStat.uid !== 0 || (await fs.realpath(root)) !== root) {
  throw new Error('Unsafe Preview certificate directory.');
}

await fs.chown(root, 0, gid);
await fs.chmod(root, 0o750);

const release = `${Date.now()}-${crypto.randomUUID()}`;
const directory = path.join(root, release);
await fs.mkdir(directory, { mode: 0o750 });
await fs.chown(directory, 0, gid);
await fs.chmod(directory, 0o750);

for (const [filename, data] of [
  ['fullchain.pem', cert],
  ['privkey.pem', key],
]) {
  const target = path.join(directory, filename);
  await fs.writeFile(target, data, { mode: 0o640, flag: 'wx' });
  await fs.chown(target, 0, gid);
  await fs.chmod(target, 0o640);
}

const current = path.join(root, 'current');
const currentStat = await fs.lstat(current).catch((error) => {
  if (error.code !== 'ENOENT') {
    throw error;
  }

  return null;
});

if (currentStat && !currentStat.isSymbolicLink()) {
  throw new Error('Refusing to replace an unmanaged certificate path.');
}

const previous = currentStat ? await fs.readlink(current) : null;
const setCurrent = async (target) => {
  const temporary = `${current}.${crypto.randomUUID()}.tmp`;
  await fs.symlink(target, temporary);
  await fs.rename(temporary, current);
};
await setCurrent(release);

try {
  await run('/usr/bin/systemctl', ['start', 'bolt-gives-caddy-reload.service'], { timeout: 45000 });
} catch (error) {
  if (previous) {
    await setCurrent(previous);
    await run('/usr/bin/systemctl', ['start', 'bolt-gives-caddy-reload.service'], { timeout: 45000 });
  } else {
    await fs.unlink(current);
  }

  throw error;
}
console.log(
  JSON.stringify({ installed: true, fingerprint: parsed.fingerprint256, expires: parsed.validTo, caddyReloaded: true }),
);
