#!/usr/bin/env node

import crypto from 'node:crypto';
import path from 'node:path';

const CLOUDFLARE_PROJECT_STATUSES = new Set(['active', 'building', 'failed']);

function normalizeDeploymentHostname(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/[^a-z0-9.-]/g, '');
}

export function buildCloudflarePagesWorkerScript() {
  return `export default {
  async fetch(request, env) {
    const requestUrl = new URL(request.url);
    let response = await env.ASSETS.fetch(request);
    const acceptsHtml = request.headers.get('accept')?.includes('text/html');
    const assetLikePath = /\\.[a-z0-9]{1,16}$/i.test(requestUrl.pathname);
    const nonHtmlAssetPath = assetLikePath && !/\\.html?$/i.test(requestUrl.pathname);

    if (request.method === 'GET' && response.status === 404 && acceptsHtml && !assetLikePath) {
      const fallbackUrl = new URL('/index.html', request.url);
      response = await env.ASSETS.fetch(new Request(fallbackUrl, request));
    }

    if (nonHtmlAssetPath && response.headers.get('content-type')?.includes('text/html')) {
      response = new Response('Asset not found', {
        status: 404,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    }

    const headers = new Headers(response.headers);
    headers.set('x-bolt-deployment', 'cloudflare-pages-worker');

    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  },
};
`;
}

export function listCloudflareEntryAssetPaths(html = '') {
  const references = new Set();
  const tagPattern = /<(script|img|source|video|audio|iframe|link)\b([^>]*)>/gi;
  let match;

  while ((match = tagPattern.exec(String(html)))) {
    const attributeName = match[1].toLowerCase() === 'link' ? 'href' : 'src';
    const attributeMatch = match[2].match(new RegExp(`\\b${attributeName}\\s*=\\s*(["'])(.*?)\\1`, 'i'));
    const rawValue = String(attributeMatch?.[2] || '').trim();

    if (!rawValue || rawValue.startsWith('#') || rawValue.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(rawValue)) {
      continue;
    }

    const withoutQuery = rawValue.split(/[?#]/, 1)[0];
    let decoded;

    try {
      decoded = decodeURIComponent(withoutQuery);
    } catch {
      continue;
    }

    const relativePath = path.posix.normalize(decoded.replace(/^\/+/, '').replace(/^\.\//, ''));

    if (!relativePath || relativePath === '.' || relativePath === 'index.html' || relativePath.startsWith('../')) {
      continue;
    }

    references.add(relativePath);
  }

  return [...references].sort();
}

export function normalizeCloudflareProjectSlug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
}

export function normalizeCloudflareProjectName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 58);
}

export function buildCloudflareProjectName(sessionId, requestedName) {
  const slug = normalizeCloudflareProjectSlug(requestedName);

  if (!slug || slug.length < 3) {
    throw new Error('Choose a Cloudflare project name with at least 3 letters or numbers.');
  }

  const sessionSuffix = crypto
    .createHash('sha256')
    .update(String(sessionId || ''))
    .digest('hex')
    .slice(0, 8);

  return `bolt-${slug}-${sessionSuffix}`.slice(0, 58).replace(/-+$/g, '');
}

export function inferCloudflareBuildCommand(packageJson = {}, availableCommands = {}) {
  const scripts = packageJson?.scripts && typeof packageJson.scripts === 'object' ? packageJson.scripts : {};

  if (!scripts.build) {
    return null;
  }

  if (availableCommands.pnpm) {
    return { command: 'pnpm', args: ['run', 'build'] };
  }

  if (availableCommands.yarn) {
    return { command: 'yarn', args: ['build'] };
  }

  if (availableCommands.bun) {
    return { command: 'bun', args: ['run', 'build'] };
  }

  return { command: 'npm', args: ['run', 'build'] };
}

export function selectCloudflareBuildOutput(options = {}) {
  const directories = new Set(Array.isArray(options.directories) ? options.directories : []);
  const configured = String(options.configuredDirectory || '')
    .trim()
    .replace(/^\.?\//, '')
    .replace(/\/+$/, '');
  const candidates = [configured, 'dist', 'build', 'out', 'output', 'public'].filter(Boolean);
  const selected = candidates.find((candidate) => directories.has(candidate));

  if (selected) {
    return selected;
  }

  if (options.hasRootIndex === true && options.hasBuildScript !== true) {
    return '.';
  }

  return null;
}

export function parseCloudflareDeploymentUrl(output = '') {
  const urls = String(output || '').match(/https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.pages\.dev(?:\/\S*)?/gi) || [];

  return urls.at(-1)?.replace(/[),.;]+$/g, '') || null;
}

export function normalizeCloudflareProjectDeploymentRegistry(input) {
  const now = new Date().toISOString();
  const deployments = Array.isArray(input?.deployments) ? input.deployments : [];

  return {
    version: 2,
    deployments: deployments
      .map((deployment) => {
        const sessionId = String(deployment?.sessionId || '');
        const requestedName = normalizeCloudflareProjectSlug(deployment?.requestedName);
        const persistedProjectName = normalizeCloudflareProjectName(deployment?.projectName);
        const expectedProjectName =
          sessionId && requestedName ? buildCloudflareProjectName(sessionId, requestedName) : persistedProjectName;
        const legacyProjectName = normalizeCloudflareProjectName(normalizeCloudflareProjectSlug(expectedProjectName));
        const projectName = persistedProjectName === legacyProjectName ? expectedProjectName : persistedProjectName;

        return {
          id: String(deployment?.id || crypto.randomUUID()),
          sessionId,
          requestedName,
          projectName,
          pagesUrl: typeof deployment?.pagesUrl === 'string' ? deployment.pagesUrl : null,
          deploymentUrl: typeof deployment?.deploymentUrl === 'string' ? deployment.deploymentUrl : null,
          hostname: normalizeDeploymentHostname(deployment?.hostname),
          url:
            typeof deployment?.url === 'string' && deployment.url
              ? deployment.url
              : normalizeDeploymentHostname(deployment?.hostname)
                ? `https://${normalizeDeploymentHostname(deployment.hostname)}`
                : null,
          workerEnabled: deployment?.workerEnabled === true,
          databaseName: typeof deployment?.databaseName === 'string' ? deployment.databaseName : null,
          dnsStatus: typeof deployment?.dnsStatus === 'string' ? deployment.dnsStatus : null,
          caddyStatus: typeof deployment?.caddyStatus === 'string' ? deployment.caddyStatus : null,
          caddyMessage: typeof deployment?.caddyMessage === 'string' ? deployment.caddyMessage : null,
          status: CLOUDFLARE_PROJECT_STATUSES.has(deployment?.status) ? deployment.status : 'failed',
          buildOutputDirectory:
            typeof deployment?.buildOutputDirectory === 'string' ? deployment.buildOutputDirectory : null,
          lastError: typeof deployment?.lastError === 'string' ? deployment.lastError : null,
          createdAt: typeof deployment?.createdAt === 'string' ? deployment.createdAt : now,
          updatedAt: typeof deployment?.updatedAt === 'string' ? deployment.updatedAt : now,
        };
      })
      .filter((deployment) => deployment.sessionId && deployment.projectName),
    events: Array.isArray(input?.events) ? input.events.slice(-500) : [],
  };
}

export function appendCloudflareProjectDeploymentEvent(registry, event) {
  const nextEvents = Array.isArray(registry.events) ? registry.events.slice(-499) : [];

  nextEvents.push({
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    ...event,
  });
  registry.events = nextEvents;
}

export function sanitizeCloudflareProjectDeployment(deployment) {
  return {
    id: deployment.id,
    sessionId: deployment.sessionId,
    requestedName: deployment.requestedName,
    projectName: deployment.projectName,
    pagesUrl: deployment.pagesUrl,
    deploymentUrl: deployment.deploymentUrl,
    hostname: deployment.hostname || null,
    url: deployment.url || null,
    workerEnabled: deployment.workerEnabled === true,
    databaseName: deployment.databaseName || null,
    dnsStatus: deployment.dnsStatus || null,
    caddyStatus: deployment.caddyStatus || null,
    caddyMessage: deployment.caddyMessage || null,
    status: deployment.status,
    buildOutputDirectory: deployment.buildOutputDirectory,
    lastError: deployment.lastError,
    updatedAt: deployment.updatedAt,
  };
}
