import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { classNames } from '@bolt/core/utils/classNames';

type AgentViewport = 'agent' | 'app';

interface AgentModeShellProps {
  conversation: ReactNode;
  workspace: ReactNode;
  composer: ReactNode;
  isStreaming: boolean;
  statusLabel: string;
  modeLabel: string;
}

export function AgentModeShell({
  conversation,
  workspace,
  composer,
  isStreaming,
  statusLabel,
  modeLabel,
}: AgentModeShellProps) {
  const [mobileViewport, setMobileViewport] = useState<AgentViewport>('agent');
  const [composerHeight, setComposerHeight] = useState(132);
  const composerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const composer = composerRef.current;
    let observer: ResizeObserver | undefined;

    if (composer && typeof ResizeObserver !== 'undefined') {
      const updateHeight = () => setComposerHeight(Math.ceil(composer.getBoundingClientRect().height));
      observer = new ResizeObserver(updateHeight);
      observer.observe(composer);
      updateHeight();
    }

    return () => observer?.disconnect();
  }, []);

  return (
    <section
      data-testid="agent-mode-shell"
      aria-label="Agent Mode"
      className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-bolt-elements-background-depth-1"
      style={{ '--agent-composer-height': `${composerHeight}px` } as CSSProperties}
    >
      <header className="flex min-h-12 shrink-0 items-center gap-3 border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-1/95 py-2 pl-14 pr-3 backdrop-blur sm:pl-16">
        <div className="flex min-w-0 items-center gap-2">
          <span className="i-ph:magic-wand-duotone text-lg text-bolt-elements-textPrimary" aria-hidden="true" />
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold text-bolt-elements-textPrimary">Agent Mode</h1>
            <p className="hidden truncate text-[11px] text-bolt-elements-textTertiary sm:block">
              Plan, build, inspect, and iterate in one workspace
            </p>
          </div>
        </div>

        <div
          className={classNames(
            'ml-auto flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-medium',
            isStreaming
              ? 'border-sky-500/35 bg-sky-500/10 text-sky-300'
              : statusLabel.toLowerCase().includes('repair') || statusLabel.toLowerCase().includes('attention')
                ? 'border-amber-500/35 bg-amber-500/10 text-amber-300'
                : 'border-emerald-500/35 bg-emerald-500/10 text-emerald-300',
          )}
          aria-live="polite"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
          <span>{statusLabel}</span>
          <span className="text-current/55">/</span>
          <span>{modeLabel}</span>
        </div>

        <div
          role="tablist"
          aria-label="Agent Mode mobile view"
          className="flex shrink-0 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-0.5 lg:hidden"
        >
          {(['agent', 'app'] as const).map((viewport) => {
            const selected = mobileViewport === viewport;
            const label = viewport === 'agent' ? 'Agent' : 'App';

            return (
              <button
                key={viewport}
                type="button"
                role="tab"
                aria-selected={selected}
                className={classNames(
                  'rounded-md px-2 py-1 text-[11px] font-medium transition-colors',
                  selected
                    ? 'bg-bolt-elements-background-depth-3 text-bolt-elements-textPrimary shadow-sm'
                    : 'text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary',
                )}
                onClick={() => setMobileViewport(viewport)}
              >
                {label}
              </button>
            );
          })}
        </div>
      </header>

      <div className="relative min-h-0 flex-1 lg:grid lg:grid-cols-[clamp(350px,30vw,440px)_minmax(0,1fr)]">
        <section
          data-testid="agent-mode-conversation"
          aria-label="Agent conversation"
          className={classNames(
            'h-full min-h-0 border-r border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 pb-[var(--agent-composer-height)] lg:block',
            mobileViewport === 'agent' ? 'block' : 'hidden',
          )}
        >
          {conversation}
        </section>

        <section
          data-testid="agent-mode-workspace"
          aria-label="Project workspace"
          className={classNames(
            'h-full min-h-0 overflow-hidden bg-bolt-elements-background-depth-1 pb-[var(--agent-composer-height)] lg:block lg:pb-0',
            mobileViewport === 'app' ? 'block' : 'hidden',
          )}
        >
          {workspace}
        </section>
      </div>

      <div
        ref={composerRef}
        data-testid="persistent-chat-composer"
        className="absolute bottom-0 left-0 z-prompt w-full border-t border-bolt-elements-borderColor bg-bolt-elements-background-depth-1/95 px-2 py-1.5 shadow-[0_-12px_34px_rgba(15,23,42,0.16)] backdrop-blur lg:w-[clamp(350px,30vw,440px)]"
      >
        {composer}
      </div>
    </section>
  );
}
