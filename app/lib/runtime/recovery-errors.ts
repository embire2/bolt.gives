export interface RecoverableStreamErrorFlags {
  timeoutLike: boolean;
  disconnectLike: boolean;
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
