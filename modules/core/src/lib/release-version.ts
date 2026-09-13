type ReleaseVersion = { core: number[]; prerelease: string[] };

function parseReleaseVersion(version: string): ReleaseVersion {
  // Four-part numeric releases predate the web project's SemVer release line.
  const match =
    /^v?(\d+(?:\.\d+){1,3})(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/i.exec(
      version,
    );

  if (!match) {
    throw new Error('Invalid release version');
  }

  const core = match[1].split('.').map(Number);

  if (core.some((part) => !Number.isSafeInteger(part))) {
    throw new Error('Invalid release version');
  }

  return { core, prerelease: match[2]?.split('.') || [] };
}

export function compareReleaseVersions(leftVersion: string, rightVersion: string): number {
  const left = parseReleaseVersion(leftVersion);
  const right = parseReleaseVersion(rightVersion);

  for (let index = 0; index < Math.max(left.core.length, right.core.length); index++) {
    const difference = (left.core[index] || 0) - (right.core[index] || 0);

    if (difference !== 0) {
      return Math.sign(difference);
    }
  }

  if (!left.prerelease.length || !right.prerelease.length) {
    return Number(!left.prerelease.length) - Number(!right.prerelease.length);
  }

  for (let index = 0; index < Math.max(left.prerelease.length, right.prerelease.length); index++) {
    const a = left.prerelease[index];
    const b = right.prerelease[index];

    if (a === b) {
      continue;
    }

    if (a === undefined || b === undefined) {
      return a === undefined ? -1 : 1;
    }

    const aNumeric = /^\d+$/.test(a);
    const bNumeric = /^\d+$/.test(b);

    if (aNumeric && bNumeric) {
      const aValue = BigInt(a);
      const bValue = BigInt(b);

      if (aValue === bValue) {
        continue;
      }

      return aValue < bValue ? -1 : 1;
    }

    if (aNumeric !== bNumeric) {
      return aNumeric ? -1 : 1;
    }

    return a < b ? -1 : 1;
  }

  return 0;
}
