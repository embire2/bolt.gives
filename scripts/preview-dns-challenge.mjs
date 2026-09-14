#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { Resolver } from 'node:dns/promises';
import { parse } from 'dotenv';
import {
  cpanelPreviewDnsConfig,
  readCpanelPreviewZone,
  updateCpanelPreviewChallenge,
} from '@bolt/control-plane/server/cpanel-preview-dns.mjs';

const mode = process.argv[2];

if (process.getuid() !== 0 || !['check', 'auth', 'cleanup'].includes(mode)) {
  throw new Error(
    'Usage (root): preview-dns-challenge.mjs check|auth|cleanup. Auth/cleanup read Certbot environment variables.',
  );
}

const filename = process.env.BOLT_CPANEL_DNS_ENV_FILE || '/root/.config/bolt-gives/cpanel-dns.env';
const stat = await fs.lstat(filename);

if (!stat.isFile() || stat.uid !== 0 || (stat.mode & 0o077) !== 0 || (await fs.realpath(filename)) !== filename) {
  throw new Error('DNS configuration must be a root-owned, mode-0600 file without symlink ancestors.');
}

const config = cpanelPreviewDnsConfig(parse(await fs.readFile(filename, 'utf8')));

if (mode === 'check') {
  const zone = await readCpanelPreviewZone(config);
  console.log(
    JSON.stringify({ connected: true, zone: config.zone, serial: zone.serial, previewNamespaces: config.domains }),
  );
} else {
  const value = process.env.CERTBOT_VALIDATION || '';
  const result = await updateCpanelPreviewChallenge(
    config,
    { domain: process.env.CERTBOT_DOMAIN, value, remove: mode === 'cleanup' },
    {
      beforeChange: async (zone) => {
        const backup = path.join(path.dirname(filename), `zone-before-${Date.now()}-${crypto.randomUUID()}.json`);
        await fs.writeFile(backup, JSON.stringify(zone), { mode: 0o600, flag: 'wx' });
      },
    },
  );

  if (mode === 'auth') {
    const discovery = new Resolver({ timeout: 5000, tries: 1 });
    const nameservers = await discovery.resolveNs(config.zone);
    const addresses = [];

    for (const ns of nameservers) {
      addresses.push((await discovery.resolve4(ns))[0]);
    }

    if (!addresses.length) {
      throw new Error('No authoritative DNS servers resolved.');
    }

    const resolvers = [...new Set([...addresses, '1.1.1.1', '8.8.8.8'])].map((address) => {
      const resolver = new Resolver({ timeout: 5000, tries: 1 });
      resolver.setServers([address]);

      return resolver;
    });
    const deadline = Date.now() + 10 * 60_000;
    let visible = false;

    while (Date.now() < deadline) {
      visible = true;

      for (const resolver of resolvers) {
        const records = await resolver.resolveTxt(result.name).catch(() => []);

        if (!records.some((parts) => parts.join('') === value)) {
          visible = false;
        }
      }

      if (visible) {
        break;
      }

      console.log('Waiting for the certificate TXT record to reach authoritative and public DNS.');
      await new Promise((resolve) => setTimeout(resolve, 10_000));
    }

    if (!visible) {
      throw new Error('Certificate TXT propagation was not verified within ten minutes.');
    }
  }

  console.log(
    JSON.stringify({
      mode,
      name: result.name,
      changed: result.changed,
      ...(mode === 'auth' ? { propagationVerified: true } : {}),
    }),
  );
}
