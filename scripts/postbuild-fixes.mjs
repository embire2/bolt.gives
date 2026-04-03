import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const targets = [path.join(root, 'build', 'server'), path.join(root, 'build', 'client')];
const from = 'isomorphic-git/http/web/index.js';
const to = 'isomorphic-git/http/web';

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const files = [];

  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(abs)));
      continue;
    }
    if (entry.isFile() && /\.(?:js|mjs|cjs|map)$/.test(entry.name)) {
      files.push(abs);
    }
  }

  return files;
}

let changed = 0;
for (const target of targets) {
  for (const file of await walk(target)) {
    const source = await fs.readFile(file, 'utf8');
    if (!source.includes(from)) continue;
    await fs.writeFile(file, source.split(from).join(to), 'utf8');
    changed += 1;
  }
}

console.log(`[postbuild-fixes] rewrote ${changed} file(s)`);
