#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const moduleMapPath = path.join(repoRoot, 'modules', 'module-map.json');
const SOURCE_EXTENSION_RE = /\.(?:[cm]?[jt]sx?|css|scss)$/i;
const IMPORT_RE = /(?:from\s*|import\s*\(|import\s*)['"](@bolt\/([^/'"]+)(?:\/[^'"]*)?)['"]/g;

export async function readModuleMap() {
  return JSON.parse(await fs.readFile(moduleMapPath, 'utf8'));
}

export function normalizeRepoPath(filePath) {
  return filePath.replaceAll('\\', '/').split(path.sep).join('/').replace(/^\.\//, '');
}

export async function collectSourceFiles(rootPath) {
  const files = [];

  async function visit(currentPath) {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === '.cache' || entry.name === 'dist') {
        continue;
      }

      const targetPath = path.join(currentPath, entry.name);

      if (entry.isDirectory()) {
        await visit(targetPath);
      } else if (SOURCE_EXTENSION_RE.test(entry.name)) {
        files.push(targetPath);
      }
    }
  }

  try {
    await visit(rootPath);
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }
  }

  return files;
}

export async function checkModuleBoundaries({ enforceLineLimit = false } = {}) {
  const map = await readModuleMap();
  const maxNewFileLines = Number(map.maxNewFileLines || 1000);
  const legacyFileLineBudgets = map.legacyFileLineBudgets || {};
  const packageToModule = new Map(
    Object.entries(map.modules).map(([moduleName, config]) => [config.package.replace('@bolt/', ''), moduleName]),
  );
  const errors = [];
  const stats = {};

  for (const [moduleName, config] of Object.entries(map.modules)) {
    const sourceFiles = await collectSourceFiles(path.join(repoRoot, config.root));
    let lines = 0;

    for (const filePath of sourceFiles) {
      const source = await fs.readFile(filePath, 'utf8');
      const lineCount = source.split('\n').length;
      const repoPath = normalizeRepoPath(path.relative(repoRoot, filePath));
      lines += lineCount;

      if (enforceLineLimit && lineCount > maxNewFileLines) {
        const legacyBudget = Number(legacyFileLineBudgets[repoPath] || 0);

        if (!legacyBudget) {
          errors.push(`${repoPath}: ${lineCount} lines exceeds ${maxNewFileLines}`);
        } else if (lineCount > legacyBudget) {
          errors.push(`${repoPath}: ${lineCount} lines exceeds legacy budget ${legacyBudget}`);
        }
      }

      for (const match of source.matchAll(IMPORT_RE)) {
        const importedModule = packageToModule.get(match[2]);

        if (!importedModule) {
          errors.push(`${repoPath}: unknown module import ${match[1]}`);
          continue;
        }

        if (importedModule !== moduleName && !config.dependsOn.includes(importedModule)) {
          errors.push(`${repoPath}: ${moduleName} cannot import ${importedModule}`);
        }
      }
    }

    stats[moduleName] = { files: sourceFiles.length, lines };
  }

  return { errors, stats };
}

async function main() {
  const strict = process.argv.includes('--strict');
  const result = await checkModuleBoundaries({ enforceLineLimit: strict });

  console.log(JSON.stringify({ ok: result.errors.length === 0, ...result }, null, 2));

  if (result.errors.length > 0) {
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exit(1);
  });
}
