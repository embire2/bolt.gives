import path from 'node:path';

const SOURCE_EXTENSIONS = ['.jsx', '.js', '.tsx', '.ts', '.mjs', '.mts', '.cts'];
const STATIC_ASSET_PATH_RE = /\/assets\/.+\.(?:js|css|map|png|jpe?g|svg|webp|ico|woff2?|ttf|eot)$/i;

function dirname(filePath) {
  return filePath.replace(/\\/g, '/').replace(/\/[^/]+$/, '') || '/';
}

function resolveRelativeImport(fromPath, specifier, files, preferredExtensions = SOURCE_EXTENSIONS) {
  const normalizedFrom = fromPath.replace(/\\/g, '/');
  const fromDir = dirname(normalizedFrom);
  const rawTarget = path.posix.normalize(path.posix.join(fromDir, specifier));
  const candidates = [];

  if (files[rawTarget]?.type === 'file') {
    candidates.push(rawTarget);
  }

  for (const extension of preferredExtensions) {
    candidates.push(`${rawTarget}${extension}`);
  }

  for (const extension of preferredExtensions) {
    candidates.push(path.posix.join(rawTarget, `index${extension}`));
  }

  return candidates.find((candidate, index) => candidates.indexOf(candidate) === index && files[candidate]?.type === 'file') || null;
}

function detectEntryFile(files) {
  const indexHtml = Object.entries(files).find(([filePath, dirent]) => {
    return dirent?.type === 'file' && !dirent.isBinary && /(^|\/)index\.html$/i.test(filePath);
  });

  if (indexHtml?.[1]?.content) {
    const html = String(indexHtml[1].content);
    const scriptSrcMatch = html.match(/<script[^>]+type=["']module["'][^>]+src=["']([^"']+)["']/i);

    if (scriptSrcMatch?.[1]) {
      const resolved = resolveRelativeImport(indexHtml[0], scriptSrcMatch[1], files);

      if (resolved) {
        return resolved;
      }
    }
  }

  const entryCandidates = [
    /(^|\/)src\/main\.(jsx|js|tsx|ts)$/i,
    /(^|\/)src\/index\.(jsx|js|tsx|ts)$/i,
    /(^|\/)app\/page\.(jsx|js|tsx|ts)$/i,
  ];

  for (const pattern of entryCandidates) {
    const match = Object.entries(files).find(([filePath, dirent]) => {
      return dirent?.type === 'file' && !dirent.isBinary && typeof dirent.content === 'string' && pattern.test(filePath);
    });

    if (match) {
      return match[0];
    }
  }

  return null;
}

function resolvePrimaryAppImport(entryPath, entryContent, files) {
  const importPattern =
    /\bimport\s+([A-Za-z_$][\w$]*)\s+from\s+['"]([^'"]+)['"]|import\s+['"]([^'"]+)['"]/g;
  const entryExt = path.posix.extname(entryPath).toLowerCase();
  const preferredExtensions =
    entryExt === '.tsx' || entryExt === '.ts' ? ['.tsx', '.ts', '.jsx', '.js', '.mjs', '.mts', '.cts'] : SOURCE_EXTENSIONS;

  for (const match of entryContent.matchAll(importPattern)) {
    const importedName = match[1] || '';
    const rawSpecifier = match[2] || match[3] || '';

    if (!rawSpecifier.startsWith('.')) {
      continue;
    }

    if (importedName && importedName !== 'App') {
      continue;
    }

    const resolved = resolveRelativeImport(entryPath, rawSpecifier, files, preferredExtensions);

    if (resolved) {
      return resolved;
    }
  }

  return null;
}

export function selectBreakTarget(files) {
  const normalizedFiles = files || {};
  const entryPath = detectEntryFile(normalizedFiles);

  if (entryPath) {
    const entryContent = String(normalizedFiles[entryPath]?.content || '');
    const activeImport = resolvePrimaryAppImport(entryPath, entryContent, normalizedFiles);

    if (activeImport) {
      return [activeImport, normalizedFiles[activeImport]];
    }

    return [entryPath, normalizedFiles[entryPath]];
  }

  const preferredPatterns = [
    /(^|\/)src\/App\.(jsx|js|tsx|ts)$/i,
    /(^|\/)app\/page\.(jsx|js|tsx|ts)$/i,
    /(^|\/)src\/main\.(jsx|js|tsx|ts)$/i,
  ];

  for (const pattern of preferredPatterns) {
    const match = Object.entries(normalizedFiles).find(([filePath, dirent]) => {
      return dirent?.type === 'file' && !dirent.isBinary && typeof dirent.content === 'string' && pattern.test(filePath);
    });

    if (match) {
      return match;
    }
  }

  throw new Error('Could not find a generated application entry file to corrupt for recovery testing.');
}

export function isStaticAssetRequestUrl(url) {
  try {
    const parsed = new URL(url);

    return STATIC_ASSET_PATH_RE.test(parsed.pathname);
  } catch {
    return STATIC_ASSET_PATH_RE.test(String(url || ''));
  }
}
