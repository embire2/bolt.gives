import type { Message } from 'ai';
import type { FileMap } from '~/lib/stores/files';
import type { Snapshot } from './types';

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
