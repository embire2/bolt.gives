import { describe, expect, it } from 'vitest';
import { getToolAutonomyResolution, isActionAutoAllowed, isReadOnlyShellCommand, isSafeToolCall } from './autonomy';

describe('autonomy helpers', () => {
  it('identifies safe tool names by read semantics', () => {
    expect(isSafeToolCall('web_search')).toBe(true);
    expect(isSafeToolCall('read_file')).toBe(true);
    expect(isSafeToolCall('delete_file')).toBe(false);
    expect(isSafeToolCall('deploy_app')).toBe(false);
  });

  it('accepts only simple read-only shell commands', () => {
    expect(isReadOnlyShellCommand('ls -la')).toBe(true);
    expect(isReadOnlyShellCommand('git status')).toBe(true);
    expect(isReadOnlyShellCommand('rm -rf node_modules')).toBe(false);
    expect(isReadOnlyShellCommand('cat package.json && npm run build')).toBe(false);
  });

  it('enforces action policies by mode', () => {
    expect(isActionAutoAllowed({ type: 'file', filePath: 'app.ts', content: 'x' }, 'auto-apply-safe')).toBe(true);
    expect(isActionAutoAllowed({ type: 'shell', content: 'npm run build' }, 'auto-apply-safe')).toBe(false);
    expect(isActionAutoAllowed({ type: 'shell', content: 'ls -la' }, 'read-only')).toBe(true);
    expect(isActionAutoAllowed({ type: 'file', filePath: 'app.ts', content: 'x' }, 'read-only')).toBe(false);
    expect(isActionAutoAllowed({ type: 'shell', content: 'npm run build' }, 'full-auto')).toBe(true);
  });

  it('resolves tool-call behavior by autonomy mode', () => {
    expect(getToolAutonomyResolution('full-auto', 'deploy_app')).toBe('approve');
    expect(getToolAutonomyResolution('review-required', 'web_search')).toBe('manual');
    expect(getToolAutonomyResolution('auto-apply-safe', 'web_search')).toBe('approve');
    expect(getToolAutonomyResolution('auto-apply-safe', 'delete_file')).toBe('manual');
    expect(getToolAutonomyResolution('read-only', 'delete_file')).toBe('reject');
  });
});
