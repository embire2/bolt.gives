import { describe, expect, it, vi } from 'vitest';
import { GITHUB_ISSUES_URL, openBugReportLauncher } from './bug-report';

describe('bug report destination', () => {
  it('opens the public bolt.gives GitHub Issues page', () => {
    const openWindow = vi.fn(() => null);

    openBugReportLauncher(openWindow);

    expect(GITHUB_ISSUES_URL).toBe('https://github.com/embire2/bolt.gives/issues');
    expect(openWindow).toHaveBeenCalledWith(GITHUB_ISSUES_URL, '_blank', 'noopener,noreferrer');
  });
});
