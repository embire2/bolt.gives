#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { collectInitialAssetPaths, parseRemixManifestSource } from './client-bundle-budget-utils.mjs';

const rootDir = process.cwd();
const assetsDir = path.join(rootDir, 'build', 'client', 'assets');
const maxAssetBytes = Number(process.env.BOLT_CLIENT_ASSET_BUDGET_BYTES || 1_000_000);
const maxInitialRouteBytes = Number(process.env.BOLT_CLIENT_INITIAL_ROUTE_BUDGET_BYTES || 2_000_000);

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
const manifestEntry = entries.find((entry) => entry.isFile() && /^manifest-.*\.js$/.test(entry.name));

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

const initialRoutes = [];

if (manifestEntry) {
  const manifestSource = await fs.readFile(path.join(assetsDir, manifestEntry.name), 'utf8');
  const manifest = parseRemixManifestSource(manifestSource);

  for (const routeId of ['routes/_index', 'routes/chat']) {
    if (!manifest.routes?.[routeId]) {
      continue;
    }

    const assets = collectInitialAssetPaths(manifest, routeId);
    let bytes = 0;

    for (const assetPath of assets) {
      const filePath = path.join(rootDir, 'build', 'client', assetPath.replace(/^\//, ''));
      bytes += (await fs.stat(filePath)).size;
    }

    initialRoutes.push({ routeId, bytes, budget: maxInitialRouteBytes, assetCount: assets.length });
  }
}

const oversizedRoutes = initialRoutes.filter((route) => route.bytes > route.budget);

if (oversized.length > 0 || oversizedRoutes.length > 0) {
  console.error(JSON.stringify({ ok: false, oversized, oversizedRoutes, initialRoutes }, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      assetBudgetBytes: maxAssetBytes,
      initialRouteBudgetBytes: maxInitialRouteBytes,
      initialRoutes,
    },
    null,
    2,
  ),
);
