import type { JSONValue } from 'ai';
import type { Ref } from 'react';
import type { AgentCommentaryAnnotation } from '~/types/context';

function isAgentCommentaryAnnotation(value: JSONValue): value is AgentCommentaryAnnotation {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return candidate.type === 'agent-commentary' && typeof candidate.message === 'string';
}

function getPhaseLabel(phase: AgentCommentaryAnnotation['phase']): string {
  switch (phase) {
    case 'plan':
      return 'Plan';
    case 'action':
      return 'Doing';
    case 'verification':
      return 'Verifying';
    case 'next-step':
      return 'Next';
    case 'recovery':
      return 'Recovery';
    default:
      return 'Update';
  }
}

function getStatusClasses(status: AgentCommentaryAnnotation['status']): string {
  if (status === 'complete' || status === 'recovered') {
    return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
  }

  if (status === 'warning') {
    return 'text-amber-400 bg-amber-500/10 border-amber-500/30';
  }

  return 'text-sky-400 bg-sky-500/10 border-sky-500/30';
}

function parseContractDetail(detail: string | undefined): { keyChanges?: string; next?: string } {
  if (!detail) {
    return {};
  }

  const keyChangesMatch = detail.match(/Key changes:\s*([\s\S]*?)(?=\nNext:|$)/i);
  const nextMatch = detail.match(/Next:\s*([\s\S]*?)$/i);

  return {
    keyChanges: keyChangesMatch?.[1]?.trim(),
    next: nextMatch?.[1]?.trim(),
  };
}

interface CommentaryFeedProps {
  data?: JSONValue[] | undefined;
  scrollRef?: Ref<HTMLDivElement>;
}

export function CommentaryFeed(props: CommentaryFeedProps) {
  const commentaryEvents = (props.data || []).filter(isAgentCommentaryAnnotation).slice(-12);

  if (commentaryEvents.length === 0) {
    return null;
  }

  return (
    <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2 text-xs text-bolt-elements-textSecondary">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-medium text-bolt-elements-textPrimary">Live Commentary</span>
        <span className="text-[11px] text-bolt-elements-textTertiary">{commentaryEvents.length} updates</span>
      </div>
      <div
        ref={props.scrollRef}
        className="modern-scrollbar max-h-[24vh] sm:max-h-[18rem] space-y-2 overflow-x-hidden overflow-y-auto pr-1"
      >
        {commentaryEvents.map((event, index) => {
          const details = parseContractDetail(event.detail);

          return (
            <div
              key={`${event.timestamp}-${event.phase}-${index}`}
              className="rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-3 px-3 py-2"
            >
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-bolt-elements-textSecondary">
                  {getPhaseLabel(event.phase)}
                </span>
                <span className={`rounded border px-1.5 py-0.5 text-[10px] ${getStatusClasses(event.status)}`}>
                  {event.status}
                </span>
              </div>
              <div className="whitespace-pre-wrap break-words text-sm text-bolt-elements-textPrimary">
                {event.message}
              </div>
              {event.detail ? (
                <div className="mt-2 space-y-1 text-xs text-bolt-elements-textSecondary">
                  {details.keyChanges ? (
                    <div className="whitespace-pre-wrap break-words">
                      <span className="text-bolt-elements-textPrimary">Key changes:</span> {details.keyChanges}
                    </div>
                  ) : null}
                  {details.next ? (
                    <div className="whitespace-pre-wrap break-words">
                      <span className="text-bolt-elements-textPrimary">Next:</span> {details.next}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
