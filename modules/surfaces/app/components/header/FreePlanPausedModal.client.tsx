type FreePlanPausedModalProps = {
  open: boolean;
  resetAt?: string | null;
  onDismiss: () => void;
};

function formatResetTime(resetAt?: string | null) {
  if (!resetAt) {
    return '00:00 GMT+2';
  }

  const reset = new Date(resetAt);

  if (Number.isNaN(reset.getTime())) {
    return '00:00 GMT+2';
  }

  return `${reset.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })} (00:00 GMT+2)`;
}

export function FreePlanPausedModal({ open, resetAt, onDismiss }: FreePlanPausedModalProps) {
  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[600] flex items-center justify-center overflow-y-auto bg-[#10231d]/85 px-4 py-8 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="free-plan-paused-title"
    >
      <section className="relative w-full max-w-2xl overflow-hidden rounded-[2rem] border border-[#10231d] bg-[#fffdf5] text-[#10231d] shadow-[14px_14px_0_#c9f36a]">
        <div className="grid md:grid-cols-[1.05fr_0.95fr]">
          <div className="p-7 sm:p-10">
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-700/30 bg-amber-100 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.16em] text-amber-900">
              <span className="h-2 w-2 rounded-full bg-amber-600" />
              FREE service paused
            </div>
            <h2 id="free-plan-paused-title" className="mt-6 font-serif text-5xl leading-[0.92] tracking-[-0.04em]">
              Today&apos;s Agent tokens are used.
            </h2>
            <p className="mt-5 text-sm leading-6 text-[#52645e]">
              You have used your daily allocation of 100 Agent tokens. Hosted FREE coding is paused until your balance
              resets at {formatResetTime(resetAt)}.
            </p>

            <div className="mt-7 rounded-2xl border border-[#173f32]/20 bg-[#eef2ec] p-5">
              <div className="text-xs font-black uppercase tracking-[0.16em] text-[#527065]">Continue right now</div>
              <p className="mt-2 text-sm leading-6">
                Upgrade this project to Custom Domain, or dismiss this message and select a provider configured with
                your own API key.
              </p>
            </div>
          </div>

          <div className="flex flex-col justify-between border-t border-[#10231d] bg-[#173f32] p-7 text-white md:border-l md:border-t-0 sm:p-9">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.2em] text-[#c9f36a]">Launch promotion</div>
              <div className="mt-5 flex items-end gap-3">
                <span className="font-serif text-6xl leading-none">$5</span>
                <span className="pb-1 text-sm font-bold">/ month</span>
              </div>
              <div className="mt-2 text-sm text-white/65">
                Regular value <span className="line-through">$20/month</span>
              </div>
              <ul className="mt-7 space-y-3 text-sm leading-5 text-white/85">
                <li className="flex gap-2">
                  <span className="text-[#c9f36a]">✓</span> 10,000 Agent tokens each paid month
                </li>
                <li className="flex gap-2">
                  <span className="text-[#c9f36a]">✓</span> Your own Custom Domain
                </li>
                <li className="flex gap-2">
                  <span className="text-[#c9f36a]">✓</span> Deep Build and priority recovery
                </li>
              </ul>
            </div>

            <div className="mt-9 space-y-3">
              <a
                href="/pricing"
                className="flex w-full items-center justify-between rounded-xl border border-[#10231d] bg-[#c9f36a] px-5 py-4 text-sm font-black text-[#10231d] shadow-[4px_4px_0_#fffdf5] transition hover:-translate-y-0.5"
              >
                Upgrade for $5/month
                <span aria-hidden="true">→</span>
              </a>
              <button
                type="button"
                onClick={onDismiss}
                className="w-full rounded-xl border border-white/30 px-5 py-3 text-xs font-bold text-white transition hover:bg-white/10"
              >
                I&apos;ll use my own API key
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
