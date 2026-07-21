export function parseRemixManifestSource(source) {
  const raw = String(source || '').trim();
  const assignmentIndex = raw.indexOf('=');

  if (assignmentIndex < 0) {
    throw new Error('Remix manifest assignment was not found.');
  }

  const jsonSource = raw.slice(assignmentIndex + 1).replace(/;\s*$/, '');
  return JSON.parse(jsonSource);
}

function addRouteAssets(target, route) {
  if (!route) {
    return;
  }

  for (const assetPath of [route.module, ...(route.imports || []), ...(route.css || [])]) {
    if (typeof assetPath === 'string' && assetPath.startsWith('/assets/')) {
      target.add(assetPath);
    }
  }
}

export function collectInitialAssetPaths(manifest, routeId) {
  const assets = new Set();
  addRouteAssets(assets, manifest?.entry);
  addRouteAssets(assets, manifest?.routes?.root);
  addRouteAssets(assets, manifest?.routes?.[routeId]);
  return [...assets].sort();
}
