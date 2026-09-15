function normalizePath(path: string): string {
  return path
    .replace(/^\/home\/project\//, '')
    .replace(/^\.\//, '')
    .replace(/^\//, '');
}

export function normalizeHostedFreeFileContent(path: string, source: string): string | null {
  let content = source;
  const wrapper = content.trim().match(/^<(boltArtifact|codyArtifact)\b[^>]*>([\s\S]*)<\/\1>$/);

  if (wrapper) {
    content = wrapper[2].trim();
  }

  const action = content.trim().match(/^<(boltAction|codyAction)\b([^>]*)>([\s\S]*)<\/\1>$/);

  if (action) {
    const type = action[2].match(/\btype=(['"])(.*?)\1/)?.[2];
    const filePath = action[2].match(/\bfilePath=(['"])(.*?)\1/)?.[2];

    if (type !== 'file' || !filePath || normalizePath(filePath) !== path) {
      return null;
    }

    content = action[3];
  }

  /*
   * File-tool content cannot open/close protocol actions or smuggle nested commands.
   * Reject ambiguous payloads rather than committing an empty/truncated source file.
   */
  if (/<\/?(?:bolt|cody)(?:Artifact|Action)\b/i.test(content)) {
    return null;
  }

  if (!path.endsWith('.md')) {
    const fence = content.trim().match(/^```[\w-]*\r?\n([\s\S]*?)\r?\n```$/);

    if (fence) {
      content = fence[1];
    }
  }

  return content;
}
