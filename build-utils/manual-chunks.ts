function getPackageName(id: string) {
  const nodeModulesIndex = id.lastIndexOf('/node_modules/');

  if (nodeModulesIndex === -1) {
    return null;
  }

  const packagePath = id.slice(nodeModulesIndex + '/node_modules/'.length);
  const segments = packagePath.split('/');

  if (segments[0]?.startsWith('@')) {
    return segments.length >= 2 ? `${segments[0]}/${segments[1]}` : segments[0];
  }

  return segments[0] || null;
}

function matchPackage(id: string, packages: string[]) {
  return packages.some((pkg) => id.includes(`/${pkg}/`) || id.includes(`/${pkg}`));
}

export function getManualChunkName(id: string): string | undefined {
  if (!id.includes('node_modules')) {
    return undefined;
  }

  const packageName = getPackageName(id);

  if (
    matchPackage(id, [
      'shiki',
      '@shikijs/core',
      '@shikijs/langs',
      '@shikijs/themes',
      'vscode-oniguruma',
      'oniguruma-to-es',
      'react-markdown',
      'remark-gfm',
      'rehype-raw',
      'rehype-sanitize',
      'unified',
      'vfile',
      'devlop',
    ]) ||
    id.includes('/remark-') ||
    id.includes('/rehype-') ||
    id.includes('/micromark') ||
    id.includes('/mdast-util-') ||
    id.includes('/hast-util-') ||
    id.includes('/unist-util-')
  ) {
    return 'markdown-shiki';
  }

  if (packageName && ['react', 'react-dom', 'scheduler'].includes(packageName)) {
    return 'framework-vendor';
  }

  if (
    matchPackage(id, [
      '@uiw/codemirror-theme-vscode',
      '@lezer',
      '@codemirror/lang-',
      '@codemirror',
      '@uiw/react-codemirror',
      '@uiw/codemirror-extensions-events',
      '@uiw/codemirror-extensions-basic-setup',
    ])
  ) {
    return 'editor-codemirror';
  }

  if (matchPackage(id, ['@xterm', 'xterm'])) {
    return 'terminal-xterm';
  }

  if (matchPackage(id, ['yjs', 'y-websocket', 'y-codemirror.next'])) {
    return 'collaboration-yjs';
  }

  if (matchPackage(id, ['@octokit', 'isomorphic-git', 'jszip', 'file-saver'])) {
    return 'git-export';
  }

  if (matchPackage(id, ['chart.js', 'react-chartjs-2'])) {
    return 'charts-vendor';
  }

  if (matchPackage(id, ['jspdf'])) {
    return 'pdf-export';
  }

  if (matchPackage(id, ['@radix-ui', '@headlessui', 'framer-motion', 'lucide-react', 'react-toastify'])) {
    return 'ui-vendor';
  }

  if (matchPackage(id, ['@ai-sdk', 'ai', '@openrouter', 'ollama-ai-provider', 'zod'])) {
    return 'llm-vendor';
  }

  if (matchPackage(id, ['mermaid'])) {
    return 'diagram-vendor';
  }

  if (matchPackage(id, ['@remix-run', '@remix', 'react-router', '@cloudflare'])) {
    return 'framework-vendor';
  }

  if (matchPackage(id, ['@phosphor-icons', '@heroicons', '@iconify'])) {
    return 'icons-vendor';
  }

  if (matchPackage(id, ['crypto-browserify', 'stream-browserify', 'path-browserify', 'rollup-plugin-node-polyfills', 'vite-plugin-node-polyfills'])) {
    return 'polyfills-vendor';
  }

  if (matchPackage(id, ['react-dnd', 'react-dnd-html5-backend', 'react-beautiful-dnd'])) {
    return 'dnd-vendor';
  }

  if (matchPackage(id, ['date-fns', 'nanostores', '@nanostores', 'clsx', 'class-variance-authority'])) {
    return 'utility-vendor';
  }

  if (!packageName) {
    return 'vendor-misc';
  }

  const sanitized = packageName.replace(/^@/, '').replace(/[\/]/g, '-').replace(/[^a-zA-Z0-9-_]/g, '');
  return `vendor-${sanitized}`;
}
