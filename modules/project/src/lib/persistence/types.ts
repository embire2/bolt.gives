import type { FileMap } from '@bolt/core/types/files';

export interface Snapshot {
  chatIndex: string;
  files: FileMap;
  summary?: string;
  runtimeSessionId?: string;
}
