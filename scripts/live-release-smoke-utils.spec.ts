import { describe, expect, it } from 'vitest';
import { selectBreakTarget } from './live-release-smoke-utils.mjs';

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
