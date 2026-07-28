#!/usr/bin/env node

import crypto from 'node:crypto';

const CLOUDFLARE_PROJECT_STATUSES = new Set(['active', 'building', 'failed']);

export function normalizeCloudflareProjectSlug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
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
    version: 1,
    deployments: deployments
      .map((deployment) => ({
        id: String(deployment?.id || crypto.randomUUID()),
        sessionId: String(deployment?.sessionId || ''),
        requestedName: normalizeCloudflareProjectSlug(deployment?.requestedName),
        projectName: normalizeCloudflareProjectSlug(deployment?.projectName),
        pagesUrl: typeof deployment?.pagesUrl === 'string' ? deployment.pagesUrl : null,
        deploymentUrl: typeof deployment?.deploymentUrl === 'string' ? deployment.deploymentUrl : null,
        status: CLOUDFLARE_PROJECT_STATUSES.has(deployment?.status) ? deployment.status : 'failed',
        buildOutputDirectory:
          typeof deployment?.buildOutputDirectory === 'string' ? deployment.buildOutputDirectory : null,
        lastError: typeof deployment?.lastError === 'string' ? deployment.lastError : null,
        createdAt: typeof deployment?.createdAt === 'string' ? deployment.createdAt : now,
        updatedAt: typeof deployment?.updatedAt === 'string' ? deployment.updatedAt : now,
      }))
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
    status: deployment.status,
    buildOutputDirectory: deployment.buildOutputDirectory,
    lastError: deployment.lastError,
    updatedAt: deployment.updatedAt,
  };
}
