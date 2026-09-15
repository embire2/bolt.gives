import { useCallback, useEffect, useState } from 'react';

export const MAGNET_API_BANNER_DISMISSED_KEY = 'bolt_magnet_api_banner_dismissed_v1';

function wasDismissed(): boolean {
  try {
    return window.localStorage.getItem(MAGNET_API_BANNER_DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

export function MagnetApiBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(!wasDismissed());
  }, []);

  const dismiss = useCallback(() => {
    try {
      window.localStorage.setItem(MAGNET_API_BANNER_DISMISSED_KEY, '1');
    } catch {
      // Storage restrictions should not prevent an in-session dismissal.
    }

    setVisible(false);
  }, []);

  if (!visible) {
    return null;
  }

  return (
    <aside
      aria-label="MagnetAPI provider notice"
      className="relative z-[1100] shrink-0 border-b border-emerald-300 bg-[#ecfdf5] px-3 py-2 text-[#123c31] shadow-sm dark:border-emerald-700 dark:bg-[#092d25] dark:text-emerald-50"
    >
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 text-xs sm:flex-nowrap sm:text-sm">
        <div className="i-ph:magnet-straight-fill hidden shrink-0 text-lg text-emerald-700 sm:block dark:text-emerald-300" />
        <p className="line-clamp-2 min-w-0 basis-full flex-1 leading-5 sm:line-clamp-none sm:basis-auto">
          Configure your own AI provider, or use MagnetAPI. MagnetAPI advertises Frontier models at 90% less, including
          Opus 5, Fable 5.1, ChatGPT-5.6 Ultra, and more.
        </p>
        <a
          href="https://magnetapi.org"
          target="_blank"
          rel="noreferrer"
          className="inline-flex shrink-0 items-center justify-center rounded-md bg-[#075e4a] px-3 py-1.5 font-bold text-white shadow-sm transition hover:bg-[#064c3d] focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 dark:bg-emerald-300 dark:text-[#062a22] dark:hover:bg-emerald-200"
        >
          Visit MagnetAPI
        </a>
        <button
          type="button"
          onClick={dismiss}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-emerald-700/30 text-[#164e3f] transition hover:bg-emerald-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-emerald-200/30 dark:text-emerald-50 dark:hover:bg-emerald-900"
          aria-label="Dismiss MagnetAPI banner and do not show it again"
          title="Do not show again"
        >
          <span className="i-ph:x-bold" aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}
