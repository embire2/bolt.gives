import { useStore } from '@nanostores/react';
import { ClientOnly } from 'remix-utils/client-only';
import { chatStore } from '~/lib/stores/chat';
import { classNames } from '~/utils/classNames';
import { HeaderActionButtons } from './HeaderActionButtons.client';
import { ChatDescription } from '~/lib/persistence/ChatDescription.client';
import { APP_VERSION } from '~/lib/version';

export function Header() {
  const chat = useStore(chatStore);

  return (
    <header
      className={classNames('flex items-center px-4 border-b h-[var(--header-height)]', {
        'border-transparent': !chat.started,
        'border-bolt-elements-borderColor': chat.started,
      })}
    >
      <div className="flex items-center gap-2 z-logo text-bolt-elements-textPrimary cursor-pointer">
        <div className="i-ph:sidebar-simple-duotone text-xl" />
        <a href="/" className="text-2xl font-semibold text-accent flex items-center">
          {/* <span className="i-bolt:logo-text?mask w-[46px] inline-block" /> */}
          <img
            src={`/boltlogo2.png?v=${APP_VERSION}`}
            alt="bolt.gives"
            className="w-60 h-60 object-contain"
            loading="eager"
          />
          <span className="ml-2 px-2 py-1 rounded-full border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 text-xs font-mono text-bolt-elements-textSecondary">
            v{APP_VERSION}
          </span>
        </a>
      </div>

      <span className="flex-1 px-4 truncate text-center text-bolt-elements-textPrimary">
        {chat.started ? <ClientOnly>{() => <ChatDescription />}</ClientOnly> : null}
      </span>

      <div className="flex items-center gap-3">
        <a
          href="/changelog"
          className="text-sm text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary underline-offset-4 hover:underline"
        >
          Changelog
        </a>

        {chat.started ? (
          <ClientOnly>
            {() => (
              <div className="">
                <HeaderActionButtons chatStarted={chat.started} />
              </div>
            )}
          </ClientOnly>
        ) : null}
      </div>
    </header>
  );
}
