export function normalizeStartCommand(command, port) {
  let normalized = command.trim();
  const hasHostFlag = (value) => /(?:^|\s)(?:--host\b|-H\b)/i.test(value);
  const hasPortFlag = (value) => /(?:^|\s)(?:--port\b|-p\b)/i.test(value);

  normalized = normalized.replace(/--host(?:=|\s+)(0\.0\.0\.0|localhost|127\.0\.0\.1)/gi, '--host 127.0.0.1');
  normalized = normalized.replace(/--port(?:=|\s+)\d+/gi, `--port ${port}`);
  normalized = normalized.replace(/\b-p\s+\d+/gi, `-p ${port}`);
  normalized = normalized.replace(/\bPORT=\d+\s*/gi, '');

  const runDevMatch = normalized.match(/\b(pnpm|npm|yarn|bun)\s+(run\s+)?dev\b/i);
  const isRunDev = Boolean(runDevMatch);
  const runDevTool = runDevMatch?.[1]?.toLowerCase();
  let hasExplicitHost = hasHostFlag(normalized);
  let hasExplicitPort = hasPortFlag(normalized);
  const isStaticServeCommand = /(^|&&\s*)(?:npx\s+--yes\s+)?serve\b/i.test(normalized);

  if (isStaticServeCommand) {
    hasExplicitPort = Boolean(extractConfiguredStartPort(normalized));
    normalized = normalized
      .replace(/\s+--host(?:=|\s+)(?:0\.0\.0\.0|localhost|127\.0\.0\.1)\b/gi, '')
      .replace(/\s+-H\s+(?:0\.0\.0\.0|localhost|127\.0\.0\.1)\b/gi, '')
      .trim();

    if (!hasExplicitPort) {
      normalized += ` --port ${port}`;
    }

    return normalized.trim();
  }

  if (/\bnext\s+dev\b/i.test(normalized)) {
    if (!/\b-H\b/i.test(normalized)) {
      normalized += ' -H 127.0.0.1';
    }

    if (!/\b-p\b/i.test(normalized)) {
      normalized += ` -p ${port}`;
    }

    return normalized;
  }

  if (isRunDev) {
    if (runDevTool && runDevTool !== 'npm') {
      normalized = normalized.replace(/\s+--\s+(?=--(?:host|port)\b)/i, ' ');
      hasExplicitHost = hasHostFlag(normalized);
      hasExplicitPort = hasPortFlag(normalized);
    }

    const forwardedArgs = [];

    if (!hasExplicitHost) {
      forwardedArgs.push('--host 127.0.0.1');
    }

    if (!hasExplicitPort) {
      forwardedArgs.push(`--port ${port}`);
    }

    if (forwardedArgs.length === 0) {
      return normalized;
    }

    if (runDevTool === 'npm') {
      return `${normalized} -- ${forwardedArgs.join(' ')}`;
    }

    return `${normalized} ${forwardedArgs.join(' ')}`;
  }

  if (!hasExplicitHost) {
    normalized += ' --host 127.0.0.1';
  }

  if (!hasExplicitPort) {
    normalized += ` --port ${port}`;
  }

  return normalized;
}

export function extractConfiguredStartPort(command) {
  if (typeof command !== 'string' || !command.trim()) {
    return undefined;
  }

  const normalized = command.trim();
  const portMatch =
    normalized.match(/(?:^|\s)--port(?:=|\s+)(\d+)\b/i) ||
    normalized.match(/(?:^|\s)-p\s+(\d+)\b/i) ||
    normalized.match(/(?:^|\s)(?:--listen|-l)\s+tcp:\/\/[^:\s]+:(\d+)\b/i) ||
    normalized.match(/(?:^|\s)(?:--listen|-l)\s+(\d+)\b/i);

  const port = Number(portMatch?.[1]);

  if (!Number.isFinite(port) || port <= 0) {
    return undefined;
  }

  return port;
}

export function rewritePreviewAssetUrls(content, previewBasePath) {
  if (typeof content !== 'string' || !content || typeof previewBasePath !== 'string' || !previewBasePath) {
    return content;
  }

  let rewritten = content
    .replace(/((?:src|href)=["'])\/(?!\/|runtime\/preview\/)/g, `$1${previewBasePath}/`)
    .replace(/(\bfrom\s*["'])\/(?!\/|runtime\/preview\/)/g, `$1${previewBasePath}/`)
    .replace(/(\bimport\s*\(\s*["'])\/(?!\/|runtime\/preview\/)/g, `$1${previewBasePath}/`)
    .replace(/(\bimport\s*["'])\/(?!\/|runtime\/preview\/)/g, `$1${previewBasePath}/`)
    .replace(/url\(\s*\/(?!\/|runtime\/preview\/)(?=[@A-Za-z0-9_.-])/g, `url(${previewBasePath}/`)
    .replace(/sourceMappingURL=\/(?!\/|runtime\/preview\/)(?=[@A-Za-z0-9_.-])/g, `sourceMappingURL=${previewBasePath}/`);

  const looksLikeViteClient =
    rewritten.includes('const importMetaUrl = new URL(import.meta.url);') &&
    rewritten.includes('const socketHost =') &&
    rewritten.includes('const directSocketHost =') &&
    rewritten.includes('const base =');

  if (!looksLikeViteClient) {
    return rewritten;
  }

  rewritten = rewritten
    .replace(
      /const serverHost = .*?;/,
      'const serverHost = `${importMetaUrl.host}${proxyPathPrefix}`;',
    )
    .replace(
      /const socketHost = .*?;/,
      'const socketHost = `${importMetaUrl.host}${proxyPathPrefix}`;',
    )
    .replace(
      /const directSocketHost = .*?;/,
      'const directSocketHost = `${importMetaUrl.host}${proxyPathPrefix}`;',
    )
    .replace(/const base = .*?;/, 'const base = proxyPathPrefix;');

  if (!rewritten.includes('const proxyPathPrefix =')) {
    rewritten = rewritten.replace(
      'const importMetaUrl = new URL(import.meta.url);',
      `const importMetaUrl = new URL(import.meta.url);
const proxyPathPrefix = importMetaUrl.pathname.replace(/\\/@vite\\/client$/, "/");`,
    );
  }

  return rewritten;
}

export function parsePreviewProxyRequestTarget(requestUrl) {
  if (typeof requestUrl !== 'string' || !requestUrl) {
    return null;
  }

  const parsedUrl = new URL(requestUrl, 'http://runtime.local');
  const match = parsedUrl.pathname.match(/^\/runtime\/preview\/([^/]+)\/(\d+)(\/.*)?$/);

  if (!match) {
    return null;
  }

  const [, sessionId, portRaw, tail = '/'] = match;

  return {
    sessionId,
    portRaw,
    previewBasePath: `/runtime/preview/${sessionId}/${portRaw}`,
    upstreamPath: `${tail || '/'}${parsedUrl.search || ''}`,
  };
}

export function extractPreviewPortFromOutput(text) {
  if (typeof text !== 'string' || !text) {
    return undefined;
  }

  const normalizedText = text.replace(/\u001b\[[0-9;]*m/g, '').replace(/\u0000/g, '');
  const matches = [...normalizedText.matchAll(/https?:\/\/(?:127\.0\.0\.1|localhost|0\.0\.0\.0|\[::1\]):(\d+)(?:\/|\b)/gi)];

  if (matches.length === 0) {
    return undefined;
  }

  const port = Number(matches.at(-1)?.[1]);

  if (!Number.isFinite(port) || port <= 0) {
    return undefined;
  }

  return port;
}

export function createPreviewProbeCoordinator(waitForPreview) {
  let generation = 0;
  let settled = false;
  let resolveReady;
  let rejectReady;

  const readyPromise = new Promise((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });

  const startProbe = (port) => {
    const probeGeneration = ++generation;

    waitForPreview(port)
      .then(() => {
        if (settled || probeGeneration !== generation) {
          return;
        }

        settled = true;
        resolveReady({ port });
      })
      .catch((error) => {
        if (settled || probeGeneration !== generation) {
          return;
        }

        rejectReady(error);
      });
  };

  return {
    readyPromise,
    startProbe,
    isSettled: () => settled,
  };
}
