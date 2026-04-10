import type { FileMap } from '~/lib/stores/files';
import { normalizeArtifactFilePath } from './file-paths';

const SOURCE_EXTENSION_PRIORITY = ['.tsx', '.ts', '.jsx', '.js'] as const;
const DEFAULT_VITE_VERSION = '^5.4.21';
const DEFAULT_VITE_REACT_PLUGIN_VERSION = '^4.7.0';
const DEFAULT_REACT_VERSION = '^18.2.0';
const DEFAULT_TYPES_REACT_VERSION = '^18.2.0';

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
  return stripConflictingSourceVariants(coerceVitePackageJson(files));
}
