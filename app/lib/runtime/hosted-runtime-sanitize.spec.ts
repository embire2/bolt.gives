import { describe, expect, it } from 'vitest';
import type { FileMap } from '~/lib/stores/files';
import { sanitizeHostedRuntimeFileMap } from './hosted-runtime-sanitize';

describe('sanitizeHostedRuntimeFileMap', () => {
  it('rewrites CRA package metadata back to a Vite contract when the workspace is clearly Vite-based', () => {
    const files: FileMap = {
      '/home/project/package.json': {
        type: 'file',
        content: JSON.stringify(
          {
            name: 'taskboard-pro',
            private: true,
            dependencies: {
              react: '^18.2.0',
              'react-dom': '^18.2.0',
              'react-scripts': '5.0.1',
            },
            scripts: {
              start: 'react-scripts start',
            },
          },
          null,
          2,
        ),
        isBinary: false,
      },
      '/home/project/vite.config.ts': {
        type: 'file',
        content: "import { defineConfig } from 'vite';\nexport default defineConfig({});\n",
        isBinary: false,
      },
      '/home/project/src/main.tsx': {
        type: 'file',
        content: "import App from './App';\n",
        isBinary: false,
      },
      '/home/project/src/App.tsx': {
        type: 'file',
        content: 'export default function App(){return null}\n',
        isBinary: false,
      },
    };

    const sanitized = sanitizeHostedRuntimeFileMap(files);
    const packageEntry = sanitized['/home/project/package.json'];

    expect(packageEntry?.type).toBe('file');

    const packageJson = JSON.parse(String(packageEntry && packageEntry.type === 'file' ? packageEntry.content : ''));

    expect(packageJson.scripts.dev).toBe('vite');
    expect(packageJson.scripts.preview).toBe('vite preview');
    expect(packageJson.dependencies['react-scripts']).toBeUndefined();
    expect(packageJson.devDependencies.vite).toBeTruthy();
    expect(packageJson.devDependencies['@vitejs/plugin-react']).toBeTruthy();
  });

  it('prunes stale source variants and CRA entry files when a Vite main entry is present', () => {
    const files: FileMap = {
      '/home/project/src/App.tsx': {
        type: 'file',
        content: 'export default function App(){return <main>tsx</main>}\n',
        isBinary: false,
      },
      '/home/project/src/App.js': {
        type: 'file',
        content: 'export default function App(){return <main>js</main>}\n',
        isBinary: false,
      },
      '/home/project/src/main.tsx': {
        type: 'file',
        content: "import App from './App';\n",
        isBinary: false,
      },
      '/home/project/src/index.js': {
        type: 'file',
        content: "import App from './App';\n",
        isBinary: false,
      },
    };

    const sanitized = sanitizeHostedRuntimeFileMap(files);

    expect(sanitized['/home/project/src/App.tsx']).toBeTruthy();
    expect(sanitized['/home/project/src/App.js']).toBeUndefined();
    expect(sanitized['/home/project/src/main.tsx']).toBeTruthy();
    expect(sanitized['/home/project/src/index.js']).toBeUndefined();
  });
});
