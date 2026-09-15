#!/usr/bin/env node
// Install with the two adjacent control-plane helpers; no npm dependencies.
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Resolver } from 'node:dns/promises';
import {
  cpanelPreviewDnsConfig,
  readCpanelPreviewZone,
} from '../modules/control-plane/src/server/cpanel-preview-dns.mjs';
import {
  assertForwardZoneSerial,
  renderCpanelZone,
  verifySecondarySerial,
  writePublicZoneCandidate,
} from '../modules/control-plane/src/server/cpanel-zone-file.mjs';

const run = promisify(execFile);
const resolver = new Resolver({ timeout: 1000, tries: 1 });
resolver.setServers(['127.0.0.1']);

async function verifyLoadedSerial(zoneName, serial) {
  await verifySecondarySerial(zoneName, serial, (name) => resolver.resolveSoa(name));
}

const configPath = process.env.BOLT_DNS_SYNC_CONFIG || '/etc/bolt-gives-dns-sync.json';
const stat = await fs.lstat(configPath);

if (
  process.getuid() !== 0 ||
  !stat.isFile() ||
  stat.uid !== 0 ||
  stat.mode & 0o077 ||
  (await fs.realpath(configPath)) !== configPath
) {
  throw new Error('DNS sync configuration must be a root-owned mode-0600 regular file.');
}

const config = cpanelPreviewDnsConfig(JSON.parse(await fs.readFile(configPath, 'utf8')));
const directory = `/var/cache/bind/${config.zone}-cpanel`;
const filename = `${directory}/zone.db`;
const prepared = process.argv.includes('--prepare');
await fs.mkdir(directory, { mode: 0o755 }).catch((error) => {
  if (error.code !== 'EEXIST') {
    throw error;
  }
});

const parent = await fs.lstat(directory);

if (!parent.isDirectory() || parent.uid !== 0 || parent.mode & 0o022 || (await fs.realpath(directory)) !== directory) {
  throw new Error('Unsafe DNS zone directory.');
}

const previousStat = await fs.lstat(filename).catch((error) => {
  if (error.code !== 'ENOENT') {
    throw error;
  }

  return null;
});

if (previousStat && (!previousStat.isFile() || previousStat.uid !== 0)) {
  throw new Error('Unsafe existing DNS zone file.');
}

if (prepared && previousStat) {
  throw new Error('Prepare is one-time only; existing DNS zone preserved.');
}

const zone = await readCpanelPreviewZone(config);
const candidate = renderCpanelZone(zone, config.zone);
const previous = previousStat ? await fs.readFile(filename, 'utf8') : null;

if (candidate === previous) {
  await fs.chmod(filename, 0o644);

  const loaded = await resolver.resolveSoa(config.zone).catch(() => null);

  if (String(loaded?.serial) !== zone.serial) {
    await run('/usr/sbin/rndc', ['reload', config.zone], { timeout: 15000 });
  }

  await verifyLoadedSerial(config.zone, zone.serial);
  console.log(JSON.stringify({ zone: config.zone, serial: zone.serial, changed: false, servingVerified: true }));
} else {
  if (previous) {
    assertForwardZoneSerial(previous, zone.serial);
  }

  const temporary = `${filename}.${crypto.randomUUID()}.tmp`;

  try {
    await writePublicZoneCandidate(temporary, candidate);
    await run('/usr/bin/named-checkzone', [config.zone, temporary], { timeout: 15000 });

    if (previous) {
      await fs.copyFile(filename, `${filename}.last-good`);
    }

    await fs.rename(temporary, filename);

    try {
      if (!prepared) {
        await run('/usr/sbin/rndc', ['reload', config.zone], { timeout: 15000 });
        await verifyLoadedSerial(config.zone, zone.serial);
      }
    } catch (error) {
      if (previous) {
        await fs.copyFile(`${filename}.last-good`, filename);
        await fs.chmod(filename, 0o644);
        await run('/usr/sbin/rndc', ['reload', config.zone], { timeout: 15000 });
      }

      throw error;
    }
    console.log(JSON.stringify({ zone: config.zone, serial: zone.serial, changed: true, prepared }));
  } finally {
    await fs.unlink(temporary).catch((error) => {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    });
  }
}
