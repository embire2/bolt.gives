import fs from 'node:fs/promises';
import path from 'node:path';

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
