export const GITHUB_ISSUES_URL = 'https://github.com/embire2/bolt.gives/issues';

type OpenWindow = (url?: string | URL, target?: string, features?: string) => Window | null;

export function openBugReportLauncher(
  openWindow: OpenWindow | undefined = typeof window === 'undefined' ? undefined : window.open.bind(window),
) {
  openWindow?.(GITHUB_ISSUES_URL, '_blank', 'noopener,noreferrer');
}
