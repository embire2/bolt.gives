import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';

const run = (command, args, options) =>
  new Promise((resolve, reject) => {
    execFile(command, args, options, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      } else {
        resolve({ stdout, stderr });
      }
    });
  });

export async function verifyIsolationSourceCopy(source, destination) {
  // Dependency caches are copied with hard links but are rebuildable, not customer source/data.
  const result = await run(
    'rsync',
    ['-nrcl', '--delete', '--exclude=node_modules/', '--out-format=%i %n', `${source}/`, `${destination}/`],
    {
      maxBuffer: 1024 * 1024,
      timeout: 180_000,
    },
  );

  if (result.stdout.trim()) {
    throw new Error('Workspace source/data checksum verification failed; originals remain unchanged.');
  }
}

export async function copyIsolationTree(source, destination, { uid, gid, extra = [] }) {
  if (!Number.isSafeInteger(uid) || uid <= 0 || !Number.isSafeInteger(gid) || gid <= 0) {
    throw new Error('Isolation copies require a non-root owner.');
  }

  // pnpm workspaces share dependency inodes; plain archive copies multiply storage and downtime.
  await run('rsync', ['-aH', `--chown=${uid}:${gid}`, ...extra, `${source}/`, `${destination}/`], {
    maxBuffer: 1024 * 1024,
  });
  await fs.chmod(destination, 0o700);
}

export async function assertFreshMigrationTargets({ source, destinations, environmentFile }) {
  const paths = [source, ...destinations, environmentFile];

  if (paths.some((value) => !path.isAbsolute(value) || path.normalize(value) !== value)) {
    throw new Error('Migration requires normalized absolute paths.');
  }

  for (const destination of [...destinations, environmentFile]) {
    if (destination === source || destination.startsWith(`${source}/`) || source.startsWith(`${destination}/`)) {
      throw new Error('Migration source and destination must be separate trees.');
    }

    // Check parents too: a symlinked parent can silently redirect a privileged copy.
    for (let current = destination; current !== path.dirname(current); current = path.dirname(current)) {
      const stat = await fs.lstat(current).catch((error) => {
        if (error.code === 'ENOENT') {
          return null;
        }

        throw error;
      });

      if (stat?.isSymbolicLink()) {
        throw new Error('Migration destinations cannot contain symlinks.');
      }

      if (current === destination && stat) {
        throw new Error('Migration target already exists. Refusing to overwrite an active or partial migration.');
      }
    }
  }

  const sourceStat = await fs.lstat(source);

  if (!sourceStat.isDirectory() || sourceStat.isSymbolicLink() || (await fs.realpath(source)) !== source) {
    throw new Error('Migration source must be a real, non-symlinked directory.');
  }
}

export function assertMigrationServicesStopped(states) {
  if (states.length !== 2 || states.some((state) => state.loadState !== 'loaded' || state.activeState !== 'inactive')) {
    throw new Error('Stop both application and runtime services before copying their workspace state.');
  }
}
