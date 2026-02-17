import { useStore } from '@nanostores/react';
import { workbenchStore } from '~/lib/stores/workbench';
import type { InteractiveStepRunnerEvent } from '~/lib/runtime/interactive-step-runner';
import type { JSONValue } from 'ai';
import type { AgentCommentaryAnnotation } from '~/types/context';

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

function isAgentCommentaryAnnotation(value: JSONValue): value is AgentCommentaryAnnotation {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return candidate.type === 'agent-commentary' && typeof candidate.message === 'string';
}

interface StepRunnerFeedProps {
  data?: JSONValue[] | undefined;
}

export function StepRunnerFeed(props: StepRunnerFeedProps) {
  const events = useStore(workbenchStore.stepRunnerEvents);
  const commentaryEvents = (props.data || []).filter(isAgentCommentaryAnnotation).slice(-8);

  if (events.length === 0 && commentaryEvents.length === 0) {
    return null;
  }

  const recent = events.slice(-8);

  return (
    <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2 text-xs text-bolt-elements-textSecondary">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-medium text-bolt-elements-textPrimary">Execution Timeline</span>
        <button
          className="bg-transparent text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary"
          onClick={() => workbenchStore.clearStepRunnerEvents()}
        >
          Clear
        </button>
      </div>
      <div className="max-h-40 space-y-1 overflow-y-auto font-mono">
        {commentaryEvents.map((event, index) => (
          <div key={`${event.timestamp}-${event.phase}-${index}`}>
            <span className="mr-2 text-bolt-elements-textTertiary">[commentary/{event.phase}]</span>
            <span className="text-bolt-elements-textPrimary">{event.message}</span>
            {event.detail ? <div className="ml-10 text-bolt-elements-textTertiary">{event.detail}</div> : null}
          </div>
        ))}
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
