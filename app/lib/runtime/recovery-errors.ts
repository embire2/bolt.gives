export interface RecoverableStreamErrorFlags {
  timeoutLike: boolean;
  disconnectLike: boolean;
}

export interface CompletedRunDisconnectContext {
  message: string | undefined | null;
  requestStartedAt: number;
  lastRunCompletedAt?: number | null;
  lastPreviewReadyAt?: number | null;
}

export function classifyRecoverableStreamError(message: string | undefined | null): RecoverableStreamErrorFlags {
  const normalizedMessage = String(message || '').toLowerCase();

  const timeoutLike =
    normalizedMessage.includes('bolt_stream_timeout') ||
    normalizedMessage.includes('stream timed out') ||
    normalizedMessage.includes('generation stream timed out');
  const disconnectLike =
    normalizedMessage.includes('stream disconnected before completion') ||
    normalizedMessage.includes('websocket closed by server before response.completed') ||
    normalizedMessage.includes('websocket closed before completion');

  return {
    timeoutLike,
    disconnectLike,
  };
}

export function shouldIgnoreDisconnectAfterCompletedRun(context: CompletedRunDisconnectContext): boolean {
  const { disconnectLike } = classifyRecoverableStreamError(context.message);

  if (!disconnectLike) {
    return false;
  }

  const completionEvidenceAt = Math.max(context.lastRunCompletedAt ?? 0, context.lastPreviewReadyAt ?? 0);

  return completionEvidenceAt >= context.requestStartedAt && completionEvidenceAt > 0;
}
