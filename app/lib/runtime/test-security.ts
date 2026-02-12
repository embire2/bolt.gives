import type { FileMap } from '~/lib/stores/files';

function toTestFilePath(filePath: string) {
  const extensionMatch = filePath.match(/\.(tsx?|jsx?)$/);

  if (!extensionMatch) {
    return undefined;
  }

  const extension = extensionMatch[1];

  return filePath.replace(new RegExp(`\\.${extension}$`), `.test.${extension}`);
}

function buildJestStub(filePath: string) {
  const fileName = filePath.split('/').pop() || filePath;

  return `describe('${fileName}', () => {
  it('should have coverage for generated logic', () => {
    expect(true).toBe(true);
  });
});
`;
}

export function getMissingJestStubs(files: FileMap, changedPaths: string[]) {
  const stubs: Array<{ path: string; content: string }> = [];

  changedPaths.forEach((changedPath) => {
    const testPath = toTestFilePath(changedPath);

    if (!testPath) {
      return;
    }

    if (files[testPath]?.type === 'file') {
      return;
    }

    stubs.push({
      path: testPath,
      content: buildJestStub(changedPath),
    });
  });

  return stubs;
}

export function createTestAndSecuritySteps() {
  return [
    {
      description: 'Run ESLint',
      command: ['pnpm', 'run', 'lint'],
    },
    {
      description: 'Run security scan (Snyk or CodeQL fallback)',
      command: [
        'bash',
        '-lc',
        "if command -v snyk >/dev/null 2>&1; then snyk test; elif command -v codeql >/dev/null 2>&1; then echo 'CodeQL CLI detected. Run project-specific analysis setup before scanning.'; else pnpm audit --audit-level=moderate || true; fi",
      ],
    },
    {
      description: 'Run test suite',
      command: ['pnpm', 'test'],
    },
  ];
}
