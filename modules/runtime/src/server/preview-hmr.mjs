/*
 * Managed Preview reloads only after the runtime verifies a complete revision.
 * Vite 5 still connects its client with server.hmr=false, including through CSS imports.
 */
export function disableManagedPreviewHmr(content, upstreamPath) {
  if (!/^\/@vite\/client(?:\?|$)/.test(upstreamPath)) {
    return content;
  }

  if (!content.includes('function createHotContext(') || !content.includes('function updateStyle(')) {
    return content;
  }

  // Remove only the Vite 5 transport bootstrap, not its exports or application WebSockets.
  return content.replace(
    /let socket;\s*try \{[\s\S]*?\nfunction setupWebSocket\(/,
    'let socket;\n// The managed runtime owns Preview reloads; no independent reconnect loop.\nfunction setupWebSocket(',
  );
}
