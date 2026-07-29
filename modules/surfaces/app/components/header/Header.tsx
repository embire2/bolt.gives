import { useStore } from '@nanostores/react';
import { ClientOnly } from 'remix-utils/client-only';
import { lazy, Suspense } from 'react';
import { chatStore } from '@bolt/project/lib/stores/chat';
import { classNames } from '@bolt/core/utils/classNames';
import { ChatDescription } from '@bolt/project/lib/persistence/ChatDescription.client';
import { APP_VERSION } from '@bolt/core/lib/version';
import { getProfileFirstName, useProfile } from '~/lib/profile-context';
import { BugReportLauncher } from './BugReportLauncher.client';
import { UsageBalanceBadge } from './UsageBalanceBadge.client';

const HeaderActionButtons = lazy(() =>
  import('./HeaderActionButtons.client').then((module) => ({
    default: module.HeaderActionButtons,
  })),
);

export function Header() {
  const chat = useStore(chatStore);
  const profile = useProfile();
  const firstName = getProfileFirstName(profile);

  const handleSidebarToggle = () => {
    if (typeof window === 'undefined') {
      return;
    }

    window.dispatchEvent(new CustomEvent('bolt-sidebar-toggle'));
  };

  return (
    <header
      className={classNames(
        'relative flex items-center justify-between px-2 sm:px-3 md:px-4 border-b h-[var(--header-height)]',
        {
          'border-transparent': !chat.started,
          'border-bolt-elements-borderColor': chat.started,
        },
      )}
    >
      <div className="flex items-center gap-1.5 sm:gap-2 z-logo text-bolt-elements-textPrimary">
        <button
          type="button"
          onClick={handleSidebarToggle}
          aria-label="Open sidebar"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-bolt-elements-textPrimary transition-colors hover:bg-bolt-elements-background-depth-2"
        >
          <div className="i-ph:sidebar-simple-duotone text-lg sm:text-xl" />
        </button>
        <a href="/" className="text-2xl font-semibold text-accent flex items-center">
          {/* <span className="i-bolt:logo-text?mask w-[46px] inline-block" /> */}
          <img
            src={`/boltlogo2.png?v=${APP_VERSION}`}
            alt="bolt.gives"
            className="h-[calc(var(--header-height)-14px)] w-auto max-w-[120px] sm:max-w-[180px] md:max-w-[220px] object-contain"
            loading="eager"
          />
          <span className="hidden sm:inline-flex ml-2 px-2 py-1 rounded-full border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 text-xs font-mono text-bolt-elements-textSecondary">
            v{APP_VERSION}
          </span>
        </a>
      </div>

      <span className="mx-3 hidden min-w-0 flex-1 overflow-hidden rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-1 text-center font-medium text-bolt-elements-textPrimary shadow-sm md:block">
        {chat.started ? <ClientOnly>{() => <ChatDescription />}</ClientOnly> : null}
      </span>

      <div className="flex shrink-0 items-center justify-end gap-1.5 sm:gap-2">
        <ClientOnly>{() => <BugReportLauncher />}</ClientOnly>
        <ClientOnly>{() => <UsageBalanceBadge />}</ClientOnly>
        <a
          href="/changelog"
          className="hidden text-xs text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary xl:inline-flex"
        >
          Changelog
        </a>
        <a
          href={profile ? '/profile' : '/login'}
          className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full border border-[#173f32] bg-[#173f32] px-3 text-xs font-black text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-[#245543] sm:px-4"
          title={profile ? `Open ${profile.name}'s profile` : 'Login to your bolt.gives profile'}
        >
          <span className={profile ? 'i-ph:user-circle-fill text-[#c9f36a]' : 'i-ph:sign-in text-[#c9f36a]'} />
          <span>{profile ? `Hi, ${firstName}` : 'Login'}</span>
        </a>

        {chat.started ? (
          <ClientOnly>
            {() => (
              <div className="hidden sm:block">
                <Suspense fallback={null}>
                  <HeaderActionButtons chatStarted={chat.started} />
                </Suspense>
              </div>
            )}
          </ClientOnly>
        ) : null}
      </div>
    </header>
  );
}
