#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

const rootDir = process.cwd();
const assetsDir = path.join(rootDir, 'build', 'client', 'assets');
const maxAssetBytes = Number(process.env.BOLT_CLIENT_ASSET_BUDGET_BYTES || 3_000_000);

let entries;

try {
  entries = await fs.readdir(assetsDir, { withFileTypes: true });
} catch {
  console.log(
    JSON.stringify(
      {
        ok: true,
        skipped: true,
        reason: 'build/client/assets does not exist yet; run pnpm run build before bundle budget enforcement.',
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

const oversized = [];

for (const entry of entries) {
  if (!entry.isFile() || !/\.(?:js|css)$/.test(entry.name)) {
    continue;
  }

  const filePath = path.join(assetsDir, entry.name);
  const stat = await fs.stat(filePath);

  if (stat.size > maxAssetBytes) {
    oversized.push({
      file: `assets/${entry.name}`,
      bytes: stat.size,
      budget: maxAssetBytes,
    });
  }
}

if (oversized.length > 0) {
  console.error(JSON.stringify({ ok: false, oversized }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, budgetBytes: maxAssetBytes }, null, 2));
