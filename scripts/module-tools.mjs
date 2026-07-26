#!/usr/bin/env node

import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { readModuleMap } from './module-ownership.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      env: process.env,
      stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`))));
  });
}

function runCapture(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.once('error', reject);
    child.once('exit', (code) =>
      code === 0 ? resolve(stdout) : reject(new Error(stderr.trim() || `${command} exited with ${code}`)),
    );
  });
}

function isDocumentationOnlyPath(filePath) {
  return /^(?:docs\/|README\.md$|CHANGELOG\.md$|ROADMAP\.md$|AGENTS\.md$)/.test(filePath);
}

export function selectAffectedModules(map, changedPaths) {
  const moduleEntries = Object.entries(map.modules);
  const directlyAffected = new Set();
  let affectsAll = false;

  for (const changedPath of changedPaths) {
    const normalizedPath = changedPath.replaceAll('\\', '/').replace(/^\.\//, '');
    const owner = moduleEntries.find(([, config]) => normalizedPath.startsWith(`${config.root}/`));

    if (owner) {
      directlyAffected.add(owner[0]);
    } else if (!isDocumentationOnlyPath(normalizedPath)) {
      affectsAll = true;
    }
  }

  if (affectsAll) {
    return moduleEntries.map(([name]) => name);
  }

  const affected = new Set(directlyAffected);
  let changed = true;

  while (changed) {
    changed = false;

    for (const [name, config] of moduleEntries) {
      if (!affected.has(name) && config.dependsOn.some((dependency) => affected.has(dependency))) {
        affected.add(name);
        changed = true;
      }
    }
  }

  return moduleEntries.map(([name]) => name).filter((name) => affected.has(name));
}

async function getChangedPaths(baseRef = 'HEAD') {
  const outputs = await Promise.all([
    runCapture('git', ['diff', '--name-only', baseRef]),
    runCapture('git', ['diff', '--cached', '--name-only', baseRef]),
    runCapture('git', ['ls-files', '--others', '--exclude-standard']),
  ]);

  return [
    ...new Set(
      outputs.flatMap((output) =>
        output
          .split('\n')
          .map((value) => value.trim())
          .filter(Boolean),
      ),
    ),
  ];
}

async function main() {
  const [command = 'list', rawModule] = process.argv.slice(2);
  const map = await readModuleMap();

  if (command === 'list') {
    for (const [name, config] of Object.entries(map.modules)) {
      console.log(`${name}\t${config.package}\t${config.root}`);
    }
    return;
  }

  if (command === 'check') {
    const moduleName = rawModule?.replace(/^@bolt\//, '');
    const config = map.modules[moduleName];

    if (!config) {
      throw new Error(`Unknown module: ${rawModule || '<missing>'}`);
    }

    for (const task of ['lint', 'typecheck', 'test']) {
      await run('pnpm', ['--filter', config.package, 'run', task]);
    }

    return;
  }

  if (command === 'affected') {
    const changedPaths = await getChangedPaths(rawModule || 'HEAD');
    const affectedModules = selectAffectedModules(map, changedPaths);

    if (affectedModules.length === 0) {
      console.log('No production modules are affected.');
      return;
    }

    console.log(`Affected modules: ${affectedModules.join(', ')}`);

    const filters = affectedModules.flatMap((name) => ['--filter', map.modules[name].package]);
    await run('pnpm', ['exec', 'turbo', 'run', 'lint', 'typecheck', 'test', ...filters]);

    return;
  }

  throw new Error(`Unknown module command: ${command}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
