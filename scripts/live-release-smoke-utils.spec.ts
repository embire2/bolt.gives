import { describe, expect, it } from 'vitest';
import { isStaticAssetRequestUrl, selectBreakTarget } from './live-release-smoke-utils.mjs';

describe('selectBreakTarget', () => {
  it('targets the active app component referenced by index.html and main entry', () => {
    const files = {
      '/home/project/index.html': {
        type: 'file',
        isBinary: false,
        content:
          '<!doctype html><html><body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html>',
      },
      '/home/project/src/main.jsx': {
        type: 'file',
        isBinary: false,
        content: "import App from './App';\nimport './styles.css';\n",
      },
      '/home/project/src/App.jsx': {
        type: 'file',
        isBinary: false,
        content: 'export default function App() { return <div>real app</div>; }',
      },
      '/home/project/src/App.tsx': {
        type: 'file',
        isBinary: false,
        content: 'export default function App() { return <div>fallback starter</div>; }',
      },
    };

    const [filePath, dirent] = selectBreakTarget(files);

    expect(filePath).toBe('/home/project/src/App.jsx');
    expect(dirent.content).toContain('real app');
  });
});

describe('isStaticAssetRequestUrl', () => {
  it('detects hashed client asset requests', () => {
    expect(isStaticAssetRequestUrl('https://alpha1.bolt.gives/assets/Chat.client-CWWfA3Qu.js')).toBe(true);
    expect(isStaticAssetRequestUrl('https://alpha1.bolt.gives/assets/root-tcEXhidc.css')).toBe(true);
  });

  it('ignores app routes and runtime endpoints', () => {
    expect(isStaticAssetRequestUrl('https://alpha1.bolt.gives/')).toBe(false);
    expect(isStaticAssetRequestUrl('https://alpha1.bolt.gives/runtime/sessions/demo/snapshot')).toBe(false);
  });
});
