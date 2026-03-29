import type { FileMap } from '~/lib/stores/files';
import { diffFiles, extractRelativePath } from '~/utils/diff';

export type TextFileSnapshot = Record<string, string>;

export interface TextFileDelta {
  modified: string[];
  created: string[];
  deleted: string[];
  diffs: Record<string, string>;
}

export interface TextSnapshotRevertOps {
  writes: Array<{ path: string; content: string }>;
  deletes: string[];
}

export function snapshotTextFiles(files: FileMap): TextFileSnapshot {
  const snapshot: TextFileSnapshot = {};

  for (const [filePath, dirent] of Object.entries(files)) {
    if (!dirent || dirent.type !== 'file') {
      continue;
    }

    if (dirent.isBinary) {
      continue;
    }

    snapshot[filePath] = dirent.content ?? '';
  }

  return snapshot;
}

export function computeTextFileDelta(before: TextFileSnapshot, after: TextFileSnapshot): TextFileDelta {
  const beforePaths = Object.keys(before);
  const afterPaths = Object.keys(after);
  const beforeSet = new Set(beforePaths);
  const afterSet = new Set(afterPaths);

  const created = afterPaths.filter((p) => !beforeSet.has(p)).sort();
  const deleted = beforePaths.filter((p) => !afterSet.has(p)).sort();
  const modified = beforePaths.filter((p) => afterSet.has(p) && before[p] !== after[p]).sort();

  const diffs: Record<string, string> = {};

  for (const fullPath of [...modified, ...created, ...deleted]) {
    const relativePath = extractRelativePath(fullPath);
    const oldContent = before[fullPath] ?? '';
    const newContent = after[fullPath] ?? '';
    const unified = diffFiles(relativePath, oldContent, newContent);

    if (unified) {
      diffs[relativePath] = unified;
    }
  }

  return { modified, created, deleted, diffs };
}

export function computeTextSnapshotRevertOps(
  baseline: TextFileSnapshot,
  current: TextFileSnapshot,
): TextSnapshotRevertOps {
  const writes: Array<{ path: string; content: string }> = [];
  const deletes: string[] = [];

  const baselinePaths = Object.keys(baseline);
  const currentPaths = Object.keys(current);
  const baselineSet = new Set(baselinePaths);

  for (const filePath of baselinePaths) {
    const baselineContent = baseline[filePath] ?? '';

    if (!(filePath in current) || current[filePath] !== baselineContent) {
      writes.push({ path: filePath, content: baselineContent });
    }
  }

  for (const filePath of currentPaths) {
    if (!baselineSet.has(filePath)) {
      deletes.push(filePath);
    }
  }

  writes.sort((a, b) => a.path.localeCompare(b.path));
  deletes.sort((a, b) => a.localeCompare(b));

  return { writes, deletes };
}

function formatPathList(paths: string[], maxItems: number) {
  const shown = paths.slice(0, maxItems).map((p) => `- ${extractRelativePath(p)}`);
  const remaining = paths.length - shown.length;

  if (remaining > 0) {
    shown.push(`- (+${remaining} more)`);
  }

  return shown.join('\n');
}

export function formatCheckpointConfirmMessage(options: {
  stepDescription: string;
  delta: TextFileDelta;
  maxFilesPerSection?: number;
  maxDiffChars?: number;
}): string {
  const maxFilesPerSection = options.maxFilesPerSection ?? 10;
  const maxDiffChars = options.maxDiffChars ?? 1800;

  const lines: string[] = [];
  lines.push('Checkpoint reached:', '', options.stepDescription);

  const hasChanges =
    options.delta.modified.length > 0 || options.delta.created.length > 0 || options.delta.deleted.length > 0;

  if (!hasChanges) {
    lines.push('', 'No file changes detected.', '', 'Continue to next step?');
    return lines.join('\n');
  }

  lines.push('', 'Changes:');

  if (options.delta.modified.length > 0) {
    lines.push(
      '',
      `Modified (${options.delta.modified.length}):`,
      formatPathList(options.delta.modified, maxFilesPerSection),
    );
  }

  if (options.delta.created.length > 0) {
    lines.push(
      '',
      `Created (${options.delta.created.length}):`,
      formatPathList(options.delta.created, maxFilesPerSection),
    );
  }

  if (options.delta.deleted.length > 0) {
    lines.push(
      '',
      `Deleted (${options.delta.deleted.length}):`,
      formatPathList(options.delta.deleted, maxFilesPerSection),
    );
  }

  const diffEntries = Object.entries(options.delta.diffs);

  if (diffEntries.length > 0 && maxDiffChars > 0) {
    lines.push('', 'Diff preview (truncated):');

    let remaining = maxDiffChars;

    for (const [relativePath, diff] of diffEntries.slice(0, 3)) {
      if (remaining <= 0) {
        break;
      }

      const header = `# ${relativePath}`;
      const chunk = diff.slice(0, remaining);
      remaining -= chunk.length;
      lines.push('', header, chunk);
    }
  }

  lines.push('', 'Continue to next step?');

  return lines.join('\n');
}
