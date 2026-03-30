export function getManualChunkName(id: string): string | undefined {
  if (!id.includes('node_modules')) {
    return undefined;
  }

  if (
    id.includes('/react/') ||
    id.includes('/react-dom/') ||
    id.includes('/scheduler/')
  ) {
    return 'react-core';
  }

  if (
    id.includes('/shiki') ||
    id.includes('/@shikijs/') ||
    id.includes('/vscode-oniguruma') ||
    id.includes('/oniguruma-to-es') ||
    id.includes('/react-markdown') ||
    id.includes('/remark-gfm') ||
    id.includes('/rehype-raw') ||
    id.includes('/rehype-sanitize') ||
    id.includes('/unified/') ||
    id.includes('/remark-') ||
    id.includes('/rehype-') ||
    id.includes('/micromark') ||
    id.includes('/mdast-util-') ||
    id.includes('/hast-util-') ||
    id.includes('/unist-util-') ||
    id.includes('/property-information') ||
    id.includes('/decode-named-character-reference') ||
    id.includes('/html-url-attributes') ||
    id.includes('/space-separated-tokens') ||
    id.includes('/comma-separated-tokens') ||
    id.includes('/vfile') ||
    id.includes('/devlop')
  ) {
    return 'markdown-shiki';
  }

  if (
    id.includes('/@codemirror/') ||
    id.includes('/@uiw/codemirror-theme-vscode') ||
    id.includes('/@lezer/')
  ) {
    return 'editor-codemirror';
  }

  if (id.includes('/@xterm/') || id.includes('/xterm')) {
    return 'terminal-xterm';
  }

  if (id.includes('/yjs') || id.includes('/y-websocket') || id.includes('/y-codemirror.next')) {
    return 'collaboration-yjs';
  }

  if (
    id.includes('/@octokit/') ||
    id.includes('/isomorphic-git') ||
    id.includes('/jszip') ||
    id.includes('/file-saver')
  ) {
    return 'git-export';
  }

  if (id.includes('/chart.js') || id.includes('/react-chartjs-2') || id.includes('/jspdf')) {
    return 'charts-pdf';
  }

  if (
    id.includes('/@radix-ui/') ||
    id.includes('/@headlessui/') ||
    id.includes('/framer-motion') ||
    id.includes('/lucide-react') ||
    id.includes('/react-toastify') ||
    id.includes('/clsx') ||
    id.includes('/class-variance-authority')
  ) {
    return 'ui-vendor';
  }

  if (
    id.includes('/@ai-sdk/') ||
    id.includes('/ai/') ||
    id.includes('/@openrouter/') ||
    id.includes('/ollama-ai-provider') ||
    id.includes('/zod')
  ) {
    return 'llm-vendor';
  }

  if (id.includes('/mermaid')) {
    return 'diagram-vendor';
  }

  return 'vendor';
}
