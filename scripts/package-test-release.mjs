#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));

if (!/^\d+\.\d+\.\d+-(?:alpha|beta|rc)\.\d+$/.test(version)) {
  throw new Error('This packager only publishes explicitly versioned test prereleases.');
}

const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
git('diff', '--quiet');
git('diff', '--cached', '--quiet');

const tag = `v${version}`;
const commit = git('rev-parse', 'HEAD');

if (git('rev-parse', `${tag}^{commit}`) !== commit) {
  throw new Error('The release tag must identify this clean checkout.');
}

const output = path.join(root, 'output', 'releases', tag);
await fs.mkdir(output, { recursive: true });

async function pinInstaller(source, destination, before, after) {
  const text = await fs.readFile(path.join(root, source), 'utf8');

  if (text.split(before).length !== 2) {
    throw new Error(`Cannot uniquely pin ${source}; review its default release-ref contract.`);
  }

  await fs.writeFile(path.join(output, destination), text.replace(before, after), { mode: 0o644 });
}

await pinInstaller('install.sh', 'install-bolt-gives.sh', 'BRANCH="${BRANCH:-main}"', `BRANCH="\${BRANCH:-${tag}}"`);
await pinInstaller('install.ps1', 'install-bolt-gives.ps1', "[string]$Ref = 'main'", `[string]$Ref = '${tag}'`);
await fs.writeFile(
  path.join(output, 'release-manifest.json'),
  `${JSON.stringify(
    {
      version,
      tag,
      sourceCommit: commit,
      repository: 'https://github.com/embire2/bolt.gives',
      channel: 'prerelease',
      deploymentApproved: false,
      desktopUpdate: false,
      blockers: [
        'B13: Preview-origin isolation',
        'B14: Per-project process isolation',
        'B15: Intermittent browser useState crash',
        'Remaining live acceptance gates',
      ],
    },
    null,
    2,
  )}\n`,
  { mode: 0o644 },
);

const files = ['install-bolt-gives.sh', 'install-bolt-gives.ps1', 'release-manifest.json'];
const checksums = [];

for (const file of files) {
  const digest = crypto
    .createHash('sha256')
    .update(await fs.readFile(path.join(output, file)))
    .digest('hex');
  checksums.push(`${digest}  ${file}`);
}

await fs.writeFile(path.join(output, 'SHA256SUMS.txt'), `${checksums.join('\n')}\n`, { mode: 0o644 });
console.log(JSON.stringify({ version, tag, commit, output, files: [...files, 'SHA256SUMS.txt'] }));
