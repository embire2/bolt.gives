import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { getLocalStorage } from '~/lib/persistence';
import { profileStore } from '~/lib/stores/profile';
import {
  SHOUTBOX_LAST_READ_AT_KEY,
  countUnreadShoutMessages,
  normalizeShoutMessages,
  type ShoutMessage,
} from '~/lib/shoutbox';

const SHOUTBOX_MESSAGES_POLL_MS = 15000;

function isShoutboxEnabled() {
  const settings = getLocalStorage('settings');
  return settings?.shoutboxEnabled !== false;
}

function getShoutboxAuthor() {
  const profile = profileStore.get();

  if (profile?.username?.trim()) {
    return profile.username.trim();
  }

  const userProfile = getLocalStorage('bolt_user_profile');

  if (userProfile?.name?.trim()) {
    return userProfile.name.trim();
  }

  return 'bolt.gives user';
}

export function Shoutbox() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ShoutMessage[]>([]);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [enabled, setEnabled] = useState(isShoutboxEnabled);
  const [lastReadAt, setLastReadAt] = useState<string | null>(() => localStorage.getItem(SHOUTBOX_LAST_READ_AT_KEY));
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const syncSettings = () => {
      setEnabled(isShoutboxEnabled());
    };

    syncSettings();
    window.addEventListener('storage', syncSettings);
    window.addEventListener('bolt-settings-updated', syncSettings as EventListener);

    return () => {
      window.removeEventListener('storage', syncSettings);
      window.removeEventListener('bolt-settings-updated', syncSettings as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!enabled) {
      setOpen(false);
      return undefined;
    }

    let active = true;

    const loadMessages = async () => {
      try {
        const response = await fetch('/api/shout/messages');
        const payload = (await response.json()) as { messages?: unknown; error?: string };

        if (!response.ok) {
          throw new Error(payload.error || 'Failed to load shout-out messages.');
        }

        if (active) {
          setMessages(normalizeShoutMessages(payload.messages));
        }
      } catch (error) {
        console.error('Failed to load shout-out messages:', error);
      }
    };

    void loadMessages();

    const timer = window.setInterval(() => {
      void loadMessages();
    }, SHOUTBOX_MESSAGES_POLL_MS);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [enabled]);

  useEffect(() => {
    if (!open || messages.length === 0) {
      return undefined;
    }

    const newestTimestamp = messages[messages.length - 1]?.createdAt || new Date().toISOString();
    localStorage.setItem(SHOUTBOX_LAST_READ_AT_KEY, newestTimestamp);
    setLastReadAt(newestTimestamp);

    return undefined;
  }, [messages, open]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handleClickOutside = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [open]);

  const unreadCount = useMemo(() => countUnreadShoutMessages(messages, lastReadAt), [lastReadAt, messages]);

  const sendMessage = async () => {
    const normalizedContent = content.trim();

    if (!normalizedContent || loading) {
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/shout/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          author: getShoutboxAuthor(),
          content: normalizedContent,
        }),
      });
      const payload = (await response.json()) as { message?: ShoutMessage; error?: string };

      if (!response.ok || !payload.message) {
        throw new Error(payload.error || 'Unable to send the shout-out message.');
      }

      setMessages((current) => normalizeShoutMessages([...current, payload.message]));
      setContent('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to send the shout-out message.');
    } finally {
      setLoading(false);
    }
  };

  if (!enabled) {
    return null;
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label="Open shout-out messages"
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-bolt-elements-textPrimary transition-colors hover:bg-bolt-elements-background-depth-2"
      >
        <div className="i-ph:chat-teardrop-text-duotone text-lg sm:text-xl" />
        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-accent-500 px-1.5 text-center text-[10px] font-semibold text-white">
            {unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 top-11 z-[80] flex w-[min(92vw,24rem)] flex-col rounded-2xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 shadow-2xl">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-bolt-elements-textPrimary">Shout Out Box</div>
              <div className="text-xs text-bolt-elements-textSecondary">
                Send quick updates to other users on this deployment.
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-xs text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary"
            >
              Close
            </button>
          </div>

          <div className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1">
            {messages.length === 0 ? (
              <div className="rounded-xl border border-dashed border-bolt-elements-borderColor p-3 text-xs text-bolt-elements-textSecondary">
                No shout-out messages yet.
              </div>
            ) : (
              messages
                .slice(-30)
                .reverse()
                .map((message) => (
                  <div
                    key={message.id}
                    className="rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs font-medium text-bolt-elements-textPrimary">{message.author}</div>
                      <div className="text-[11px] text-bolt-elements-textTertiary">
                        {new Date(message.createdAt).toLocaleString()}
                      </div>
                    </div>
                    <div className="mt-2 whitespace-pre-wrap text-xs text-bolt-elements-textSecondary">
                      {message.content}
                    </div>
                  </div>
                ))
            )}
          </div>

          <div className="mt-3 space-y-2">
            <textarea
              value={content}
              onChange={(event) => setContent(event.target.value)}
              rows={3}
              placeholder="Send a short update to other bolt.gives users on this deployment."
              className="w-full rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-sm text-bolt-elements-textPrimary"
            />
            <button
              type="button"
              onClick={() => void sendMessage()}
              disabled={loading || content.trim().length === 0}
              className="rounded-lg bg-bolt-elements-button-primary-background px-3 py-2 text-xs font-medium text-bolt-elements-button-primary-text disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? 'Sending...' : 'Send shout-out'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
