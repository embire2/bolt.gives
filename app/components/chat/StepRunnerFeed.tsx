import { useStore } from '@nanostores/react';
import { workbenchStore } from '~/lib/stores/workbench';

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
          </div>
        ))}
      </div>
    </div>
  );
}
