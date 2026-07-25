import { GITHUB_ISSUES_URL } from './bug-report';

export function BugReportLauncher() {
  return (
    <a
      href={GITHUB_ISSUES_URL}
      target="_blank"
      rel="noreferrer"
      className="group relative inline-flex h-9 items-center gap-2 rounded-xl border border-rose-300 bg-rose-50 px-3 text-xs font-semibold text-rose-900 shadow-[0_0_0_1px_rgba(244,63,94,0.08)] transition-colors hover:border-rose-400 hover:bg-rose-100 dark:border-rose-400/30 dark:bg-rose-500/10 dark:text-rose-100 dark:hover:border-rose-300/60 dark:hover:bg-rose-500/15"
      aria-label="Report a bug on GitHub"
      title="Open bolt.gives GitHub Issues"
    >
      <span className="absolute -inset-1 rounded-[14px] border border-rose-400/20 opacity-60 transition-opacity group-hover:opacity-100" />
      <span className="relative i-ph:bug-beetle-fill text-base text-rose-700 dark:text-rose-200" />
      <span className="relative hidden lg:inline">Report Bug</span>
    </a>
  );
}

export { openBugReportLauncher } from './bug-report';
