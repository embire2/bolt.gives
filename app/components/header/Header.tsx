import { useStore } from '@nanostores/react';
import { ClientOnly } from 'remix-utils/client-only';
import { chatStore } from '~/lib/stores/chat';
import { classNames } from '~/utils/classNames';
import { HeaderActionButtons } from './HeaderActionButtons.client';
import { ChatDescription } from '~/lib/persistence/ChatDescription.client';
import { APP_VERSION } from '~/lib/version';

export function Header() {
  const chat = useStore(chatStore);

  const handleSidebarToggle = () => {
    if (typeof window === 'undefined') {
      return;
    }

    window.dispatchEvent(new CustomEvent('bolt-sidebar-toggle'));
  };

  return (
    <header
      className={classNames('flex items-center px-2 sm:px-3 md:px-4 border-b h-[var(--header-height)]', {
        'border-transparent': !chat.started,
        'border-bolt-elements-borderColor': chat.started,
      })}
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

      <span className="hidden md:block flex-1 px-4 truncate text-center text-bolt-elements-textPrimary">
        {chat.started ? <ClientOnly>{() => <ChatDescription />}</ClientOnly> : null}
      </span>

      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        <a
          href="/tenant"
          className="hidden sm:inline-flex text-xs sm:text-sm text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary underline-offset-4 hover:underline"
        >
          Tenant Portal
        </a>
        <a
          href="/tenant-admin"
          className="hidden sm:inline-flex text-xs sm:text-sm text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary underline-offset-4 hover:underline"
        >
          Tenant Admin
        </a>
        <a
          href="/changelog"
          className="text-xs sm:text-sm text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary underline-offset-4 hover:underline"
        >
          Changelog
        </a>

        {chat.started ? (
          <ClientOnly>
            {() => (
              <div className="hidden sm:block">
                <HeaderActionButtons chatStarted={chat.started} />
              </div>
            )}
          </ClientOnly>
        ) : null}
      </div>
    </header>
  );
}
