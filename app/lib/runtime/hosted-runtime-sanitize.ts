import type { FileMap } from '~/lib/stores/files';
import { normalizeArtifactFilePath } from './file-paths';

const SOURCE_EXTENSION_PRIORITY = ['.tsx', '.ts', '.jsx', '.js'] as const;
const DEFAULT_VITE_VERSION = '^5.4.21';
const DEFAULT_VITE_REACT_PLUGIN_VERSION = '^4.7.0';
const DEFAULT_REACT_VERSION = '^18.2.0';
const DEFAULT_TYPES_REACT_VERSION = '^18.2.0';
const ROOT_HTML_RE = /<div[^>]+id=(['"])root\1[^>]*><\/div>/i;
const MODULE_SCRIPT_SRC_RE =
  /<script[^>]+type=(['"])module\1[^>]+src=(['"])(\/src\/main\.(tsx|jsx))\2[^>]*><\/script>/i;
const HTML_CLOSE_RE = /<\/html>\s*$/i;
const HEAD_CLOSE_RE = /<\/head>/i;
const BODY_CLOSE_RE = /<\/body>/i;

function createCanonicalViteIndexHtml(mainEntryPath: string) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>bolt.gives app</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/${mainEntryPath}"></script>
  </body>
</html>
`;
}

function createCanonicalViteMainEntry(extension: '.tsx' | '.jsx') {
  const rootLookup = extension === '.tsx' ? "document.getElementById('root')!" : "document.getElementById('root')";

  return `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(${rootLookup}).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
`;
}

function createCanonicalIndexCss() {
  return `:root {
  font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  color: #0f172a;
  background-color: #f8fafc;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100vh;
}
`;
}

function getFileEntry(files: FileMap, filePath: string) {
  const normalizedPath = normalizeArtifactFilePath(filePath);

  return files[normalizedPath] ?? files[filePath];
}

function hasFile(files: FileMap, filePath: string) {
  const entry = getFileEntry(files, filePath);

  return entry?.type === 'file';
}

function parseJsonObject(content: string): Record<string, any> | null {
  try {
    const parsed = JSON.parse(content);

    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, any>;
    }
  } catch {
    return null;
  }

  return null;
}

function getFileTextContent(files: FileMap, filePath: string): string | undefined {
  const entry = getFileEntry(files, filePath);

  if (!entry || entry.type !== 'file' || entry.isBinary) {
    return undefined;
  }

  return entry.content;
}

function setFileTextContent(files: FileMap, filePath: string, content: string): FileMap {
  return {
    ...files,
    [normalizeArtifactFilePath(filePath)]: {
      type: 'file',
      content,
      isBinary: false,
    },
  };
}

function inferPreferredViteMainExtension(files: FileMap): '.tsx' | '.jsx' {
  if (hasFile(files, 'src/main.tsx') || hasFile(files, 'src/App.tsx') || hasFile(files, 'tsconfig.app.json')) {
    return '.tsx';
  }

  return '.jsx';
}

function looksLikeBrokenViteIndexHtml(content: string | undefined): boolean {
  if (!content) {
    return true;
  }

  if (!ROOT_HTML_RE.test(content) || !MODULE_SCRIPT_SRC_RE.test(content)) {
    return true;
  }

  return !HEAD_CLOSE_RE.test(content) || !BODY_CLOSE_RE.test(content) || !HTML_CLOSE_RE.test(content);
}

function extractReferencedMainEntryPath(content: string | undefined): string | null {
  if (!content) {
    return null;
  }

  const match = content.match(MODULE_SCRIPT_SRC_RE);

  return match?.[3]?.replace(/^\//, '') ?? null;
}

function looksLikeBrokenViteMainEntry(content: string | undefined): boolean {
  if (!content) {
    return true;
  }

  return !/createRoot/i.test(content) || !/from ['"]\.\/App['"]/i.test(content) || !/['"]root['"]/.test(content);
}

function ensureViteStarterInfrastructure(files: FileMap): FileMap {
  const looksLikeViteWorkspace =
    hasFile(files, 'vite.config.ts') ||
    hasFile(files, 'vite.config.js') ||
    hasFile(files, 'src/App.tsx') ||
    hasFile(files, 'src/App.jsx') ||
    hasFile(files, 'src/main.tsx') ||
    hasFile(files, 'src/main.jsx');

  if (!looksLikeViteWorkspace) {
    return files;
  }

  const hasAppEntry = hasFile(files, 'src/App.tsx') || hasFile(files, 'src/App.jsx');

  if (!hasAppEntry) {
    return files;
  }

  const preferredExtension = inferPreferredViteMainExtension(files);
  const preferredMainEntryPath = `src/main${preferredExtension}`;
  const currentIndexHtml = getFileTextContent(files, 'index.html');
  const referencedMainEntryPath = extractReferencedMainEntryPath(currentIndexHtml);
  const referencedMainEntryContent = referencedMainEntryPath
    ? getFileTextContent(files, referencedMainEntryPath)
    : undefined;
  const preferredMainEntryContent = getFileTextContent(files, preferredMainEntryPath);
  const indexNeedsRepair =
    looksLikeBrokenViteIndexHtml(currentIndexHtml) ||
    !referencedMainEntryPath ||
    !hasFile(files, referencedMainEntryPath) ||
    normalizeArtifactFilePath(referencedMainEntryPath) !== normalizeArtifactFilePath(preferredMainEntryPath) ||
    looksLikeBrokenViteMainEntry(referencedMainEntryContent);
  const mainEntryNeedsRepair =
    looksLikeBrokenViteMainEntry(preferredMainEntryContent) ||
    (referencedMainEntryPath !== null &&
      normalizeArtifactFilePath(referencedMainEntryPath) !== normalizeArtifactFilePath(preferredMainEntryPath));

  let nextFiles = files;

  if (indexNeedsRepair) {
    nextFiles = setFileTextContent(nextFiles, 'index.html', createCanonicalViteIndexHtml(preferredMainEntryPath));
  }

  if (mainEntryNeedsRepair) {
    nextFiles = setFileTextContent(nextFiles, preferredMainEntryPath, createCanonicalViteMainEntry(preferredExtension));
  }

  if (!hasFile(nextFiles, 'src/index.css')) {
    nextFiles = setFileTextContent(nextFiles, 'src/index.css', createCanonicalIndexCss());
  }

  return nextFiles;
}

function coerceVitePackageJson(files: FileMap): FileMap {
  const packageEntry = getFileEntry(files, 'package.json');

  if (!packageEntry || packageEntry.type !== 'file') {
    return files;
  }

  const parsed = parseJsonObject(packageEntry.content);

  if (!parsed) {
    return files;
  }

  const scripts = parsed.scripts && typeof parsed.scripts === 'object' ? parsed.scripts : {};
  const dependencies = parsed.dependencies && typeof parsed.dependencies === 'object' ? parsed.dependencies : {};
  const devDependencies =
    parsed.devDependencies && typeof parsed.devDependencies === 'object' ? parsed.devDependencies : {};
  const looksLikeViteWorkspace =
    hasFile(files, 'vite.config.ts') ||
    hasFile(files, 'vite.config.js') ||
    hasFile(files, 'src/main.tsx') ||
    hasFile(files, 'src/main.jsx');
  const looksLikeCraPackage =
    typeof scripts.start === 'string' &&
    /react-scripts\s+start/i.test(scripts.start) &&
    typeof dependencies['react-scripts'] === 'string';

  if (!looksLikeViteWorkspace || !looksLikeCraPackage) {
    return files;
  }

  const nextPackage = {
    name: typeof parsed.name === 'string' ? parsed.name : 'bolt-app',
    version: typeof parsed.version === 'string' ? parsed.version : '1.0.0',
    private: parsed.private ?? true,
    type: 'module',
    scripts: {
      dev: 'vite',
      build: 'vite build',
      preview: 'vite preview',
    },
    dependencies: {
      ...Object.fromEntries(Object.entries(dependencies).filter(([name]) => name !== 'react-scripts')),
      react: typeof dependencies.react === 'string' ? dependencies.react : DEFAULT_REACT_VERSION,
      'react-dom': typeof dependencies['react-dom'] === 'string' ? dependencies['react-dom'] : DEFAULT_REACT_VERSION,
    },
    devDependencies: {
      ...devDependencies,
      vite: typeof devDependencies.vite === 'string' ? devDependencies.vite : DEFAULT_VITE_VERSION,
      '@vitejs/plugin-react':
        typeof devDependencies['@vitejs/plugin-react'] === 'string'
          ? devDependencies['@vitejs/plugin-react']
          : DEFAULT_VITE_REACT_PLUGIN_VERSION,
      ...(hasFile(files, 'src/main.tsx') || hasFile(files, 'src/App.tsx')
        ? {
            '@types/react':
              typeof devDependencies['@types/react'] === 'string'
                ? devDependencies['@types/react']
                : DEFAULT_TYPES_REACT_VERSION,
            '@types/react-dom':
              typeof devDependencies['@types/react-dom'] === 'string'
                ? devDependencies['@types/react-dom']
                : DEFAULT_TYPES_REACT_VERSION,
          }
        : {}),
    },
  };

  return {
    ...files,
    [normalizeArtifactFilePath('package.json')]: {
      type: 'file',
      content: `${JSON.stringify(nextPackage, null, 2)}\n`,
      isBinary: false,
    },
  };
}

function stripConflictingSourceVariants(files: FileMap): FileMap {
  const nextFiles: FileMap = { ...files };
  const stems = new Map<string, string[]>();

  for (const [filePath, entry] of Object.entries(nextFiles)) {
    if (entry?.type !== 'file') {
      continue;
    }

    const normalizedPath = normalizeArtifactFilePath(filePath);
    const extension = normalizedPath.slice(normalizedPath.lastIndexOf('.')).toLowerCase();

    if (!SOURCE_EXTENSION_PRIORITY.includes(extension as (typeof SOURCE_EXTENSION_PRIORITY)[number])) {
      continue;
    }

    const stemPath = normalizedPath.slice(0, -extension.length);
    const existing = stems.get(stemPath) ?? [];
    existing.push(normalizedPath);
    stems.set(stemPath, existing);
  }

  for (const [stemPath, filePaths] of stems.entries()) {
    if (filePaths.length < 2) {
      continue;
    }

    const preferredPath =
      SOURCE_EXTENSION_PRIORITY.map((extension) => `${stemPath}${extension}`).find((candidatePath) =>
        filePaths.includes(candidatePath),
      ) ?? filePaths[0];

    for (const filePath of filePaths) {
      if (filePath !== preferredPath) {
        delete nextFiles[filePath];
      }
    }
  }

  if (hasFile(nextFiles, 'src/main.tsx') || hasFile(nextFiles, 'src/main.jsx')) {
    delete nextFiles[normalizeArtifactFilePath('src/index.js')];
    delete nextFiles[normalizeArtifactFilePath('src/index.jsx')];
  }

  return nextFiles;
}

export function sanitizeHostedRuntimeFileMap(files: FileMap): FileMap {
  return ensureViteStarterInfrastructure(stripConflictingSourceVariants(coerceVitePackageJson(files)));
}
