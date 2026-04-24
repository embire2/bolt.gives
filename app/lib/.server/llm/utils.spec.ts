import { describe, expect, it } from 'vitest';
import type { FileMap } from './constants';
import { createFilesContext, selectDeterministicContextFiles } from './utils';

describe('selectDeterministicContextFiles', () => {
  it('keeps key app entry files available for follow-up prompts without LLM context selection', () => {
    const files: FileMap = {
      '/home/project/package.json': { type: 'file', content: '{"name":"demo"}', isBinary: false },
      '/home/project/index.html': { type: 'file', content: '<div id="root"></div>', isBinary: false },
      '/home/project/src/main.tsx': { type: 'file', content: 'import "./index.css";', isBinary: false },
      '/home/project/src/App.tsx': {
        type: 'file',
        content: 'export default function App() { return null; }',
        isBinary: false,
      },
      '/home/project/src/index.css': { type: 'file', content: 'body { margin: 0; }', isBinary: false },
      '/home/project/public/logo.svg': { type: 'file', content: '<svg />', isBinary: false },
    };

    const selected = selectDeterministicContextFiles(files, {
      latestGoal: 'Improve the existing calendar app and refine the event layout.',
    });

    expect(selected).toBeTruthy();
    expect(Object.keys(selected || {})).toEqual(
      expect.arrayContaining(['package.json', 'src/App.tsx', 'src/main.tsx', 'index.html']),
    );
    expect(Object.keys(selected || {})).not.toContain('public/logo.svg');
  });

  it('creates relative-path file context for the selected workspace snapshot', () => {
    const selected: FileMap = {
      'package.json': { type: 'file', content: '{"name":"demo"}', isBinary: false },
      'src/App.tsx': { type: 'file', content: 'export default function App() { return null; }', isBinary: false },
    };

    const context = createFilesContext(selected, true);

    expect(context).toContain('filePath="package.json"');
    expect(context).toContain('filePath="src/App.tsx"');
  });
});
