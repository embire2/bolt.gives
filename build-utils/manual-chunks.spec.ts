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
    expect(getManualChunkName('/root/bolt.gives/node_modules/@codemirror/view/dist/index.js')).toBe(
      'editor-codemirror-core',
    );
    expect(getManualChunkName('/root/bolt.gives/node_modules/@xterm/xterm/lib/xterm.js')).toBe('terminal-xterm');
  });

  it('isolates collaboration and export tooling', () => {
    expect(getManualChunkName('/root/bolt.gives/node_modules/yjs/dist/yjs.mjs')).toBe('collaboration-yjs');
    expect(getManualChunkName('/root/bolt.gives/node_modules/@octokit/rest/dist/index.js')).toBe('git-export');
    expect(getManualChunkName('/root/bolt.gives/node_modules/jszip/lib/index.js')).toBe('git-export');
  });

  it('extracts framework, ui, and diagram dependencies from the generic vendor chunk', () => {
    expect(getManualChunkName('/root/bolt.gives/node_modules/react/index.js')).toBe('framework-vendor');
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
});
