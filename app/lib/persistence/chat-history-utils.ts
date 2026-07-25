import type { Message } from 'ai';
import type { FileMap } from '~/lib/stores/files';
import type { Snapshot } from './types';

export function resolvePersistedChatRouteId(routeParamId?: string, loaderId?: string): string | undefined {
  return routeParamId?.trim() || loaderId?.trim() || undefined;
}

export function hasRestorableSnapshotFiles(snapshot?: Snapshot | null): boolean {
  if (!snapshot?.files) {
    return false;
  }

  return Object.values(snapshot.files).some((entry) => entry?.type === 'file' || entry?.type === 'folder');
}

export function shouldPersistSnapshot(files: FileMap | undefined, chatSummary?: string): boolean {
  if (chatSummary?.trim()) {
    return true;
  }

  if (!files) {
    return false;
  }

  return Object.keys(files).length > 0;
}

export function shouldNavigateAfterPersistedMessage(
  messages: Message[],
  isStreaming: boolean,
  hasWorkbenchArtifact: boolean,
): boolean {
  if (isStreaming) {
    return false;
  }

  if (hasWorkbenchArtifact) {
    return true;
  }

  return messages.some((message) => message.role === 'assistant');
}

export function resolvePersistedChatMessages(
  messages: Message[],
  snapshot: Snapshot | null | undefined,
  rewindId?: string | null,
): {
  visibleMessages: Message[];
  shouldRestoreSnapshot: boolean;
} {
  const rewindIndex = rewindId ? messages.findIndex((message) => message.id === rewindId) : -1;
  const endingIndex = rewindIndex >= 0 ? rewindIndex + 1 : messages.length;
  const visibleMessages = messages.slice(0, endingIndex);
  const snapshotIndex = snapshot?.chatIndex ? messages.findIndex((message) => message.id === snapshot.chatIndex) : -1;

  return {
    visibleMessages,
    shouldRestoreSnapshot:
      hasRestorableSnapshotFiles(snapshot) &&
      snapshotIndex >= 0 &&
      snapshotIndex < endingIndex &&
      snapshot?.chatIndex !== rewindId,
  };
}
