import { useEffect, useMemo, useState } from 'react';
import Cookies from 'js-cookie';
import { motion } from 'framer-motion';
import { toast } from 'react-toastify';
import { profileStore } from '~/lib/stores/profile';
import { getLocalStorage } from '~/lib/persistence';
import { APP_VERSION } from '~/lib/version';
import { Dialog, DialogDescription, DialogRoot, DialogTitle } from '~/components/ui/Dialog';

const BUG_REPORT_CONTACT_KEY = 'bolt_bug_report_contact';

function getInitialFullName() {
  const stored = getLocalStorage(BUG_REPORT_CONTACT_KEY);

  if (stored?.fullName) {
    return String(stored.fullName);
  }

  const profile = profileStore.get();

  if (profile?.username?.trim()) {
    return profile.username.trim();
  }

  const userProfile = getLocalStorage('bolt_user_profile');

  return String(userProfile?.name || '').trim();
}

function getInitialEmail() {
  const stored = getLocalStorage(BUG_REPORT_CONTACT_KEY);

  if (stored?.email) {
    return String(stored.email);
  }

  return '';
}

function getCurrentProvider() {
  return Cookies.get('selectedProvider') || 'FREE';
}

function getCurrentModel() {
  return Cookies.get('selectedModel') || 'deepseek/deepseek-v3.2';
}

function getBrowserLabel() {
  if (typeof navigator === 'undefined') {
    return 'unknown';
  }

  const navigatorWithUAData = navigator as Navigator & {
    userAgentData?: {
      brands?: Array<{ brand?: string }>;
    };
  };

  const brandLabel = navigatorWithUAData.userAgentData?.brands
    ?.map((brand) => String(brand?.brand || '').trim())
    .filter(Boolean)
    .join(', ');

  return brandLabel || navigator.userAgent;
}

export function openBugReportLauncher() {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new CustomEvent('bolt-open-bug-report'));
}

export function BugReportLauncher() {
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState(() => getInitialFullName());
  const [email, setEmail] = useState(() => getInitialEmail());
  const [issue, setIssue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [lastStatus, setLastStatus] = useState<string | null>(null);

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener('bolt-open-bug-report', handler as EventListener);

    return () => window.removeEventListener('bolt-open-bug-report', handler as EventListener);
  }, []);

  const summary = useMemo(() => {
    return (
      issue
        .split('\n')
        .map((line) => line.trim())
        .find(Boolean)
        ?.slice(0, 140) || ''
    );
  }, [issue]);

  const submit = async () => {
    if (submitting) {
      return;
    }

    setSubmitting(true);
    setLastStatus(null);

    try {
      const response = await fetch('/api/bug-report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fullName,
          reporterEmail: email,
          issue,
          summary,
          pageUrl: window.location.href,
          appVersion: APP_VERSION,
          provider: getCurrentProvider(),
          model: getCurrentModel(),
          browser: getBrowserLabel(),
        }),
      });
      const payload = (await response.json()) as {
        success?: boolean;
        error?: string;
        notificationStatus?: string;
      };

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'Unable to submit the bug report.');
      }

      localStorage.setItem(
        BUG_REPORT_CONTACT_KEY,
        JSON.stringify({
          fullName,
          email,
        }),
      );
      setIssue('');
      setLastStatus(payload.notificationStatus || 'draft');
      toast.success('Bug report submitted. The operator team now has your contact details and issue summary.');
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to submit the bug report.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <motion.button
        type="button"
        onClick={() => setOpen(true)}
        className="group relative inline-flex h-9 items-center gap-2 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 text-xs font-medium text-rose-100 shadow-[0_0_0_1px_rgba(244,63,94,0.08)] transition-colors hover:border-rose-300/60 hover:bg-rose-500/15"
        animate={{
          y: [0, -1.5, 0],
          boxShadow: ['0 0 0 rgba(244,63,94,0.08)', '0 10px 28px rgba(244,63,94,0.22)', '0 0 0 rgba(244,63,94,0.08)'],
        }}
        transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
        aria-label="Report a bug"
        title="Report a bug"
      >
        <span className="absolute -inset-1 rounded-[14px] border border-rose-400/20 opacity-60 transition-opacity group-hover:opacity-100" />
        <div className="relative i-ph:bug-beetle-fill text-base text-rose-200" />
        <span className="relative hidden lg:inline">Report Bug</span>
      </motion.button>

      <DialogRoot open={open} onOpenChange={setOpen}>
        {open ? (
          <Dialog className="w-[min(96vw,640px)]" onClose={() => setOpen(false)} onBackdrop={() => setOpen(false)}>
            <div className="p-6">
              <DialogTitle>
                <div className="i-ph:bug-beetle-fill text-rose-400" />
                Report an issue
              </DialogTitle>
              <DialogDescription>
                Describe what broke, leave your full name and reply email, and the server will log the report in the
                private operator database and notify the support inbox.
              </DialogDescription>

              <div className="mt-5 grid gap-4">
                <label className="grid gap-2 text-sm text-bolt-elements-textSecondary">
                  Full Name
                  <input
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-bolt-elements-textPrimary"
                    placeholder="Your full name"
                  />
                </label>
                <label className="grid gap-2 text-sm text-bolt-elements-textSecondary">
                  Email Address
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-bolt-elements-textPrimary"
                    placeholder="you@example.com"
                  />
                </label>
                <label className="grid gap-2 text-sm text-bolt-elements-textSecondary">
                  What went wrong?
                  <textarea
                    rows={7}
                    value={issue}
                    onChange={(event) => setIssue(event.target.value)}
                    className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-bolt-elements-textPrimary"
                    placeholder="Explain what happened, what you expected, and what the app did instead."
                  />
                </label>
                <div className="rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-4 py-3 text-xs text-bolt-elements-textSecondary">
                  Current context: <span className="text-bolt-elements-textPrimary">{getCurrentProvider()}</span> /{' '}
                  <span className="text-bolt-elements-textPrimary">{getCurrentModel()}</span> · v{APP_VERSION}
                  {lastStatus ? (
                    <>
                      {' '}
                      · last notification <span className="text-bolt-elements-textPrimary">{lastStatus}</span>
                    </>
                  ) : null}
                </div>
              </div>

              <div className="mt-6 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg border border-bolt-elements-borderColor px-4 py-2 text-sm text-bolt-elements-textPrimary"
                >
                  Close
                </button>
                <button
                  type="button"
                  disabled={submitting || !fullName.trim() || !email.trim() || issue.trim().length < 10}
                  onClick={() => void submit()}
                  className="rounded-lg bg-bolt-elements-button-primary-background px-4 py-2 text-sm font-medium text-bolt-elements-button-primary-text disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitting ? 'Submitting...' : 'Send report'}
                </button>
              </div>
            </div>
          </Dialog>
        ) : null}
      </DialogRoot>
    </>
  );
}
