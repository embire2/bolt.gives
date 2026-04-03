import { describe, expect, it } from 'vitest';
import { getManualChunkName } from './manual-chunks';

describe('getManualChunkName', () => {
  it('groups markdown and shiki dependencies together', () => {
    expect(getManualChunkName('/root/bolt.gives/node_modules/shiki/dist/index.mjs')).toBe('markdown-shiki');
    expect(getManualChunkName('/root/bolt.gives/node_modules/react-markdown/index.js')).toBe('markdown-shiki');
    expect(getManualChunkName('/root/bolt.gives/node_modules/@shikijs/core/dist/index.mjs')).toBe('markdown-shiki');
    expect(getManualChunkName('/root/bolt.gives/node_modules/unified/index.js')).toBe('markdown-shiki');
  });

  it('groups editor and terminal dependencies separately', () => {
    expect(getManualChunkName('/root/bolt.gives/node_modules/@codemirror/view/dist/index.js')).toBe('editor-view');
    expect(getManualChunkName('/root/bolt.gives/node_modules/@codemirror/state/dist/index.js')).toBe(
      'editor-state',
    );
    expect(getManualChunkName('/root/bolt.gives/node_modules/@codemirror/commands/dist/index.js')).toBe(
      'editor-commands',
    );
    expect(getManualChunkName('/root/bolt.gives/node_modules/@codemirror/lang-javascript/dist/index.js')).toBe(
      'editor-lang-javascript',
    );
    expect(getManualChunkName('/root/bolt.gives/node_modules/@codemirror/lang-python/dist/index.js')).toBe(
      'editor-lang-python',
    );
    expect(getManualChunkName('/root/bolt.gives/node_modules/@uiw/codemirror-theme-vscode/index.js')).toBe(
      'editor-themes',
    );
    expect(getManualChunkName('/root/bolt.gives/node_modules/@xterm/xterm/lib/xterm.js')).toBe('terminal-xterm');
  });

  it('separates charting and pdf export tooling from the main client shell', () => {
    expect(getManualChunkName('/root/bolt.gives/node_modules/chart.js/dist/chart.js')).toBe('charts-core');
    expect(getManualChunkName('/root/bolt.gives/node_modules/react-chartjs-2/dist/index.js')).toBe('charts-react');
    expect(getManualChunkName('/root/bolt.gives/node_modules/jspdf/dist/jspdf.es.min.js')).toBe('pdf-export');
  });

  it('isolates collaboration and export tooling', () => {
    expect(getManualChunkName('/root/bolt.gives/node_modules/yjs/dist/yjs.mjs')).toBe('collaboration-yjs');
    expect(getManualChunkName('/root/bolt.gives/node_modules/@octokit/rest/dist/index.js')).toBe(
      'git-export-octokit',
    );
    expect(getManualChunkName('/root/bolt.gives/node_modules/isomorphic-git/index.js')).toBe('git-export-core');
    expect(getManualChunkName('/root/bolt.gives/node_modules/jszip/lib/index.js')).toBe('archive-export');
    expect(getManualChunkName('/root/bolt.gives/node_modules/file-saver/dist/FileSaver.min.js')).toBe(
      'browser-downloads',
    );
  });

  it('extracts framework, ui, and diagram dependencies from the generic vendor chunk', () => {
    expect(getManualChunkName('/root/bolt.gives/node_modules/react/index.js')).toBe('react-core');
    expect(getManualChunkName('/root/bolt.gives/node_modules/@remix-run/react/dist/index.js')).toBe('remix-runtime');
    expect(getManualChunkName('/root/bolt.gives/node_modules/react-router/dist/index.js')).toBe('router-runtime');
    expect(getManualChunkName('/root/bolt.gives/node_modules/lucide-react/dist/esm/lucide-react.js')).toBe(
      'ui-vendor',
    );
    expect(getManualChunkName('/root/bolt.gives/node_modules/mermaid/dist/mermaid.core.mjs')).toBe(
      'diagram-vendor',
    );
  });

  it('returns undefined for application files', () => {
    expect(getManualChunkName('/root/bolt.gives/app/components/chat/BaseChat.tsx')).toBeUndefined();
  });

  it('splits llm and schema tooling by responsibility', () => {
    expect(getManualChunkName('/root/bolt.gives/node_modules/@ai-sdk/react/dist/index.js')).toBe('llm-react');
    expect(getManualChunkName('/root/bolt.gives/node_modules/ai/dist/index.js')).toBe('llm-core');
    expect(getManualChunkName('/root/bolt.gives/node_modules/@openrouter/ai-sdk-provider/dist/index.js')).toBe(
      'llm-openrouter',
    );
    expect(getManualChunkName('/root/bolt.gives/node_modules/zod/lib/index.js')).toBe('schema-vendor');
  });
});
