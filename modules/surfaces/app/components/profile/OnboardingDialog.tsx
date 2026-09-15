import { useEffect, useRef, type ReactNode } from 'react';

/** Native modal containment keeps background controls inert, including for keyboard users. */
export function OnboardingDialog({ titleId, children }: { titleId: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();

    return () => dialog?.close();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-modal="true"
      onCancel={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        if (event.key !== 'Tab') {
          return;
        }

        const controls = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, [tabindex]'),
        ).filter(
          (element) =>
            element.tabIndex >= 0 && !element.matches(':disabled, [hidden]') && element.getClientRects().length > 0,
        );
        const first = controls[0];
        const last = controls.at(-1);

        if (
          first &&
          last &&
          ((event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last))
        ) {
          event.preventDefault();
          (event.shiftKey ? last : first).focus();
        }
      }}
      className="bolt-onboarding-dialog m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-[2rem] border border-[#173f32] bg-[#fffdf5] p-0 text-[#10231d] shadow-xl"
    >
      {children}
    </dialog>
  );
}
