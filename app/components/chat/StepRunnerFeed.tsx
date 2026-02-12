import { useStore } from '@nanostores/react';
import { workbenchStore } from '~/lib/stores/workbench';
import type { InteractiveStepRunnerEvent } from '~/lib/runtime/interactive-step-runner';

function getSuggestedFix(event: InteractiveStepRunnerEvent): string | undefined {
  if (event.type !== 'error') {
    return undefined;
  }

  const description = event.description || '';

  if (/eslint/i.test(description)) {
    return 'Try `pnpm run lint -- --fix` and re-run `pnpm test`.';
  }

  if (/security scan/i.test(description)) {
    return 'Install Snyk (`npm i -g snyk`) or run `pnpm audit` and address reported vulnerabilities.';
  }

  if (/test suite/i.test(description) || /\bpnpm test\b/i.test(description)) {
    return 'Re-run `pnpm test` and inspect the first failing test output.';
  }

  return 'Review the step output above and re-run after applying the fix.';
}

export function StepRunnerFeed() {
  const events = useStore(workbenchStore.stepRunnerEvents);

  if (events.length === 0) {
    return null;
  }

  const recent = events.slice(-8);

  return (
    <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2 text-xs text-bolt-elements-textSecondary">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-medium text-bolt-elements-textPrimary">Interactive Step Runner</span>
        <button
          className="bg-transparent text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary"
          onClick={() => workbenchStore.clearStepRunnerEvents()}
        >
          Clear
        </button>
      </div>
      <div className="max-h-32 space-y-1 overflow-y-auto font-mono">
        {recent.map((event, index) => (
          <div key={`${event.timestamp}-${event.type}-${index}`}>
            <span className="mr-2 text-bolt-elements-textTertiary">[{event.type}]</span>
            <span className="text-bolt-elements-textPrimary">
              {event.description ||
                event.output ||
                event.error ||
                (event.type === 'complete' ? 'all steps complete' : '')}
            </span>
            {event.type === 'error' && (
              <div className="ml-10 text-bolt-elements-textTertiary">hint: {getSuggestedFix(event)}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
