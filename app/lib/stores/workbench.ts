import { atom, map, type MapStore, type ReadableAtom, type WritableAtom } from 'nanostores';
import type { EditorDocument, ScrollPosition } from '~/components/editor/codemirror/CodeMirrorEditor';
import { ActionRunner } from '~/lib/runtime/action-runner';
import type { ActionCallbackData, ArtifactCallbackData } from '~/lib/runtime/message-parser';
import { webcontainer } from '~/lib/webcontainer';
import type { ITerminal } from '~/types/terminal';
import { unreachable } from '~/utils/unreachable';
import { EditorStore } from './editor';
import { FilesStore, type FileMap } from './files';
import { PreviewsStore } from './previews';
import type { PreviewInfo } from './previews';
import { TerminalStore } from './terminal';
import { extractRelativePath } from '~/utils/diff';
import { description } from '~/lib/persistence';
import { createSampler } from '~/utils/sampler';
import type { ActionAlert, DeployAlert, SupabaseAlert } from '~/types/actions';
import type { InteractiveStepRunnerEvent } from '~/lib/runtime/interactive-step-runner';
import {
  AUTONOMY_MODE_STORAGE_KEY,
  DEFAULT_AUTONOMY_MODE,
  isActionAutoAllowed,
  type AutonomyMode,
} from '~/lib/runtime/autonomy';
import { createResilientExecutionQueue } from '~/lib/runtime/serial-execution-queue';
import { createScopedLogger } from '~/utils/logger';
import { toWorkbenchAbsoluteFilePath } from '~/lib/runtime/file-paths';
import { extractHostedRuntimeSessionIdFromPreviewBaseUrl } from '~/lib/runtime/hosted-runtime-client';

const logger = createScopedLogger('WorkbenchStore');
const hotData = import.meta.hot?.data ?? {};
const DEFAULT_ACTION_STREAM_SAMPLE_INTERVAL_MS = 100;
const MAX_INTERACTIVE_STEP_EVENTS = 140;
const INTERACTIVE_EVENTS_FLUSH_MS = 220;
const MAX_INTERACTIVE_EVENT_OUTPUT_CHARS = 1200;

function resolveActionStreamSampleIntervalMs(): number {
  const rawValue = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env
    ?.VITE_ACTION_STREAM_SAMPLE_INTERVAL_MS;
  const parsed = Number(rawValue);

  if (Number.isFinite(parsed) && parsed >= 16 && parsed <= 2_000) {
    return Math.floor(parsed);
  }

  return DEFAULT_ACTION_STREAM_SAMPLE_INTERVAL_MS;
}

const ACTION_STREAM_SAMPLE_INTERVAL_MS = resolveActionStreamSampleIntervalMs();

function createHostedRuntimeSessionId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '');
  }

  return `${Date.now()}`;
}

export interface ArtifactState {
  id: string;
  title: string;
  type?: string;
  closed: boolean;
  runner: ActionRunner;
}

export type ArtifactUpdateState = Pick<ArtifactState, 'title' | 'closed'>;

type Artifacts = MapStore<Record<string, ArtifactState>>;

export type WorkbenchViewType = 'code' | 'diff' | 'preview';

export class WorkbenchStore {
  #previewsStore = new PreviewsStore(webcontainer);
  #filesStore = new FilesStore(webcontainer);
  #editorStore = new EditorStore(this.#filesStore);
  #terminalStore = new TerminalStore(webcontainer);

  #reloadedMessages = new Set<string>();

  artifacts: Artifacts = hotData?.artifacts ?? map({});

  showWorkbench: WritableAtom<boolean> = hotData?.showWorkbench ?? atom(false);
  currentView: WritableAtom<WorkbenchViewType> = hotData?.currentView ?? atom('code');
  unsavedFiles: WritableAtom<Set<string>> = hotData?.unsavedFiles ?? atom(new Set<string>());
  actionAlert: WritableAtom<ActionAlert | undefined> = hotData?.actionAlert ?? atom<ActionAlert | undefined>(undefined);
  supabaseAlert: WritableAtom<SupabaseAlert | undefined> =
    hotData?.supabaseAlert ?? atom<SupabaseAlert | undefined>(undefined);
  deployAlert: WritableAtom<DeployAlert | undefined> = hotData?.deployAlert ?? atom<DeployAlert | undefined>(undefined);
  autonomyMode: WritableAtom<AutonomyMode> = hotData?.autonomyMode ?? atom<AutonomyMode>(DEFAULT_AUTONOMY_MODE);
  interactiveStepEvents: WritableAtom<InteractiveStepRunnerEvent[]> =
    hotData?.interactiveStepEvents ?? atom<InteractiveStepRunnerEvent[]>([]);
  isTestAndScanRunning: WritableAtom<boolean> = hotData?.isTestAndScanRunning ?? atom<boolean>(false);
  isRuntimeScannerEnabled: WritableAtom<boolean> = hotData?.isRuntimeScannerEnabled ?? atom<boolean>(false);
  modifiedFiles = new Set<string>();
  artifactIdList: string[] = [];
  #enqueueExecution = createResilientExecutionQueue((error) => {
    logger.error('Workbench execution queue task failed', error);
  });
  #actionDecisions = new Map<string, 'approved' | 'rejected'>();
  #pendingInteractiveEvents: InteractiveStepRunnerEvent[] = [];
  #interactiveEventsFlushHandle: ReturnType<typeof setTimeout> | null = null;
  #readyPreviewSignatures = new Set<string>();
  #hostedRuntimeSessionId = hotData?.hostedRuntimeSessionId ?? createHostedRuntimeSessionId();
  constructor() {
    if (typeof window !== 'undefined') {
      try {
        const persisted = window.localStorage.getItem(AUTONOMY_MODE_STORAGE_KEY) as AutonomyMode | null;

        if (persisted) {
          this.autonomyMode.set(persisted);
        }
      } catch {
        // no-op: persistence failures should not block startup
      }
    }

    if (import.meta.hot) {
      const hot = import.meta.hot as any;
      hot.data ??= {};
      hot.data.artifacts = this.artifacts;
      hot.data.unsavedFiles = this.unsavedFiles;
      hot.data.showWorkbench = this.showWorkbench;
      hot.data.currentView = this.currentView;
      hot.data.actionAlert = this.actionAlert;
      hot.data.supabaseAlert = this.supabaseAlert;
      hot.data.deployAlert = this.deployAlert;
      hot.data.autonomyMode = this.autonomyMode;
      hot.data.interactiveStepEvents = this.interactiveStepEvents;
      hot.data.isTestAndScanRunning = this.isTestAndScanRunning;
      hot.data.isRuntimeScannerEnabled = this.isRuntimeScannerEnabled;
      hot.data.hostedRuntimeSessionId = this.#hostedRuntimeSessionId;

      // Ensure binary files are properly preserved across hot reloads
      const filesMap = this.files.get();

      for (const [path, dirent] of Object.entries(filesMap)) {
        if (dirent?.type === 'file' && dirent.isBinary && dirent.content) {
          // Make sure binary content is preserved
          this.files.setKey(path, { ...dirent });
        }
      }
    }

    this.#previewsStore.previews.subscribe((previews) => {
      const nextReadySignatures = new Set<string>();

      for (const preview of previews) {
        if (!preview.ready || !preview.baseUrl) {
          continue;
        }

        const signature = `${preview.port}:${preview.baseUrl}`;
        nextReadySignatures.add(signature);

        if (this.#readyPreviewSignatures.has(signature)) {
          continue;
        }

        this.#appendInteractiveStepEvent({
          type: 'telemetry',
          timestamp: new Date().toISOString(),
          description: 'Preview ready',
          output: `${preview.baseUrl} (port ${preview.port})`,
        });
      }

      this.#readyPreviewSignatures = nextReadySignatures;
    });
  }

  addToExecutionQueue(callback: () => Promise<void>) {
    return this.#enqueueExecution(callback);
  }

  #sanitizeInteractiveEvent(event: InteractiveStepRunnerEvent): InteractiveStepRunnerEvent {
    const sanitized: InteractiveStepRunnerEvent = { ...event };

    if (typeof sanitized.output === 'string' && sanitized.output.length > MAX_INTERACTIVE_EVENT_OUTPUT_CHARS) {
      sanitized.output = sanitized.output.slice(-MAX_INTERACTIVE_EVENT_OUTPUT_CHARS);
    }

    if (typeof sanitized.error === 'string' && sanitized.error.length > MAX_INTERACTIVE_EVENT_OUTPUT_CHARS) {
      sanitized.error = sanitized.error.slice(-MAX_INTERACTIVE_EVENT_OUTPUT_CHARS);
    }

    return sanitized;
  }

  #mergeInteractiveEvent(
    existing: InteractiveStepRunnerEvent[],
    incoming: InteractiveStepRunnerEvent,
  ): InteractiveStepRunnerEvent[] {
    if (existing.length === 0) {
      return [incoming];
    }

    const last = existing[existing.length - 1];

    if (
      (incoming.type === 'stdout' || incoming.type === 'stderr') &&
      last.type === incoming.type &&
      last.stepIndex === incoming.stepIndex
    ) {
      const mergedOutput = `${last.output || ''}${last.output ? '\n' : ''}${incoming.output || ''}`.slice(
        -MAX_INTERACTIVE_EVENT_OUTPUT_CHARS,
      );

      const mergedEvent: InteractiveStepRunnerEvent = {
        ...last,
        timestamp: incoming.timestamp,
        output: mergedOutput,
      };

      return [...existing.slice(0, -1), mergedEvent];
    }

    if (
      incoming.type === 'telemetry' &&
      last.type === 'telemetry' &&
      (incoming.output || '') === (last.output || '') &&
      (incoming.description || '') === (last.description || '')
    ) {
      return [...existing.slice(0, -1), { ...last, timestamp: incoming.timestamp }];
    }

    return [...existing, incoming];
  }

  #flushInteractiveEvents() {
    if (this.#interactiveEventsFlushHandle) {
      clearTimeout(this.#interactiveEventsFlushHandle);
      this.#interactiveEventsFlushHandle = null;
    }

    if (this.#pendingInteractiveEvents.length === 0) {
      return;
    }

    let next = [...this.interactiveStepEvents.get()];

    for (const pending of this.#pendingInteractiveEvents) {
      next = this.#mergeInteractiveEvent(next, this.#sanitizeInteractiveEvent(pending));
    }

    this.#pendingInteractiveEvents = [];
    this.interactiveStepEvents.set(next.slice(-MAX_INTERACTIVE_STEP_EVENTS));
  }

  #scheduleInteractiveEventsFlush() {
    if (this.#interactiveEventsFlushHandle) {
      return;
    }

    this.#interactiveEventsFlushHandle = setTimeout(() => {
      this.#flushInteractiveEvents();
    }, INTERACTIVE_EVENTS_FLUSH_MS);
  }

  #appendInteractiveStepEvent(event: InteractiveStepRunnerEvent) {
    this.#pendingInteractiveEvents.push(event);

    if (event.type === 'stdout' || event.type === 'stderr' || event.type === 'telemetry') {
      this.#scheduleInteractiveEventsFlush();
      return;
    }

    this.#flushInteractiveEvents();
  }

  get previews() {
    return this.#previewsStore.previews;
  }

  get hostedRuntimeSessionId() {
    return this.#hostedRuntimeSessionId;
  }

  get files() {
    return this.#filesStore.files;
  }

  get currentDocument(): ReadableAtom<EditorDocument | undefined> {
    return this.#editorStore.currentDocument;
  }

  get selectedFile(): ReadableAtom<string | undefined> {
    return this.#editorStore.selectedFile;
  }

  get firstArtifact(): ArtifactState | undefined {
    return this.#getArtifact(this.artifactIdList[0]);
  }

  get filesCount(): number {
    return this.#filesStore.filesCount;
  }

  get showTerminal() {
    return this.#terminalStore.showTerminal;
  }
  get boltTerminal() {
    return this.#terminalStore.boltTerminal;
  }
  get alert() {
    return this.actionAlert;
  }
  setAlert(alert: ActionAlert | undefined) {
    this.actionAlert.set(alert);
  }
  setPreviewAlert(alert: ActionAlert) {
    this.actionAlert.set(alert);
  }
  clearAlert() {
    this.actionAlert.set(undefined);
  }
  clearPreviewAlert() {
    if (this.actionAlert.get()?.source === 'preview') {
      this.actionAlert.set(undefined);
    }
  }

  syncHostedPreview(preview: HostedPreviewSync) {
    const currentPreviews = this.#previewsStore.previews.get();
    const nextPreview = {
      port: preview.port,
      ready: true,
      baseUrl: preview.baseUrl,
      revision: preview.revision,
    };
    const nextHostedSessionId = extractHostedRuntimeSessionIdFromPreviewBaseUrl(preview.baseUrl);
    const existingPreview = currentPreviews.find((candidate) => {
      if (candidate.port === preview.port || candidate.baseUrl === preview.baseUrl) {
        return true;
      }

      if (!nextHostedSessionId) {
        return false;
      }

      return extractHostedRuntimeSessionIdFromPreviewBaseUrl(candidate.baseUrl) === nextHostedSessionId;
    });

    if (existingPreview) {
      this.#previewsStore.replacePreview(existingPreview, nextPreview);
    } else {
      this.#previewsStore.setPreview(nextPreview);
    }

    if (!existingPreview) {
      this.currentView.set('preview');
      this.showWorkbench.set(true);
    }
  }

  get SupabaseAlert() {
    return this.supabaseAlert;
  }

  clearSupabaseAlert() {
    this.supabaseAlert.set(undefined);
  }

  get DeployAlert() {
    return this.deployAlert;
  }

  setAutonomyMode(mode: AutonomyMode) {
    this.autonomyMode.set(mode);

    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(AUTONOMY_MODE_STORAGE_KEY, mode);
      } catch {
        // no-op: persistence failures should not block mode updates
      }
    }
  }

  clearDeployAlert() {
    this.deployAlert.set(undefined);
  }

  get stepRunnerEvents() {
    return this.interactiveStepEvents;
  }

  clearStepRunnerEvents() {
    if (this.#interactiveEventsFlushHandle) {
      clearTimeout(this.#interactiveEventsFlushHandle);
      this.#interactiveEventsFlushHandle = null;
    }

    this.#pendingInteractiveEvents = [];
    this.interactiveStepEvents.set([]);
  }

  get testAndScanRunning() {
    return this.isTestAndScanRunning;
  }

  get runtimeScannerEnabled() {
    return this.isRuntimeScannerEnabled;
  }

  toggleRuntimeScanner() {
    this.isRuntimeScannerEnabled.set(!this.isRuntimeScannerEnabled.get());
  }

  toggleTerminal(value?: boolean) {
    this.#terminalStore.toggleTerminal(value);
  }

  attachTerminal(terminal: ITerminal) {
    this.#terminalStore.attachTerminal(terminal);
  }
  attachBoltTerminal(terminal: ITerminal) {
    this.#terminalStore.attachBoltTerminal(terminal);
  }

  detachTerminal(terminal: ITerminal) {
    this.#terminalStore.detachTerminal(terminal);
  }

  onTerminalResize(cols: number, rows: number) {
    this.#terminalStore.onTerminalResize(cols, rows);
  }

  setDocuments(files: FileMap) {
    this.#editorStore.setDocuments(files);

    if (this.#filesStore.filesCount > 0 && this.currentDocument.get() === undefined) {
      // we find the first file and select it
      for (const [filePath, dirent] of Object.entries(files)) {
        if (dirent?.type === 'file') {
          this.setSelectedFile(filePath);
          break;
        }
      }
    }
  }

  setShowWorkbench(show: boolean) {
    this.showWorkbench.set(show);
  }

  setCurrentDocumentContent(newContent: string) {
    const filePath = this.currentDocument.get()?.filePath;

    if (!filePath) {
      return;
    }

    const originalContent = this.#filesStore.getFile(filePath)?.content;
    const unsavedChanges = originalContent !== undefined && originalContent !== newContent;

    this.#editorStore.updateFile(filePath, newContent);

    const currentDocument = this.currentDocument.get();

    if (currentDocument) {
      const previousUnsavedFiles = this.unsavedFiles.get();

      if (unsavedChanges && previousUnsavedFiles.has(currentDocument.filePath)) {
        return;
      }

      const newUnsavedFiles = new Set(previousUnsavedFiles);

      if (unsavedChanges) {
        newUnsavedFiles.add(currentDocument.filePath);
      } else {
        newUnsavedFiles.delete(currentDocument.filePath);
      }

      this.unsavedFiles.set(newUnsavedFiles);
    }
  }

  setCurrentDocumentScrollPosition(position: ScrollPosition) {
    const editorDocument = this.currentDocument.get();

    if (!editorDocument) {
      return;
    }

    const { filePath } = editorDocument;

    this.#editorStore.updateScrollPosition(filePath, position);
  }

  setSelectedFile(filePath: string | undefined) {
    this.#editorStore.setSelectedFile(filePath);
  }

  async saveFile(filePath: string) {
    const documents = this.#editorStore.documents.get();
    const document = documents[filePath];

    if (document === undefined) {
      return;
    }

    /*
     * For scoped locks, we would need to implement diff checking here
     * to determine if the user is modifying existing code or just adding new code
     * This is a more complex feature that would be implemented in a future update
     */

    await this.#filesStore.saveFile(filePath, document.value);

    const newUnsavedFiles = new Set(this.unsavedFiles.get());
    newUnsavedFiles.delete(filePath);

    this.unsavedFiles.set(newUnsavedFiles);
  }

  async saveCurrentDocument() {
    const currentDocument = this.currentDocument.get();

    if (currentDocument === undefined) {
      return;
    }

    await this.saveFile(currentDocument.filePath);
  }

  resetCurrentDocument() {
    const currentDocument = this.currentDocument.get();

    if (currentDocument === undefined) {
      return;
    }

    const { filePath } = currentDocument;
    const file = this.#filesStore.getFile(filePath);

    if (!file) {
      return;
    }

    this.setCurrentDocumentContent(file.content);
  }

  resetAllUnsavedFiles() {
    const unsaved = Array.from(this.unsavedFiles.get());

    for (const filePath of unsaved) {
      const file = this.#filesStore.getFile(filePath);

      if (!file || file.isBinary) {
        continue;
      }

      this.#editorStore.updateFile(filePath, file.content);
    }

    this.unsavedFiles.set(new Set<string>());
  }

  async saveAllFiles() {
    for (const filePath of this.unsavedFiles.get()) {
      await this.saveFile(filePath);
    }
  }

  getFileModifcations() {
    return this.#filesStore.getFileModifications();
  }

  getModifiedFiles() {
    return this.#filesStore.getModifiedFiles();
  }

  resetAllFileModifications() {
    this.#filesStore.resetFileModifications();
  }

  /**
   * Lock a file to prevent edits
   * @param filePath Path to the file to lock
   * @returns True if the file was successfully locked
   */
  lockFile(filePath: string) {
    return this.#filesStore.lockFile(filePath);
  }

  /**
   * Lock a folder and all its contents to prevent edits
   * @param folderPath Path to the folder to lock
   * @returns True if the folder was successfully locked
   */
  lockFolder(folderPath: string) {
    return this.#filesStore.lockFolder(folderPath);
  }

  /**
   * Unlock a file to allow edits
   * @param filePath Path to the file to unlock
   * @returns True if the file was successfully unlocked
   */
  unlockFile(filePath: string) {
    return this.#filesStore.unlockFile(filePath);
  }

  /**
   * Unlock a folder and all its contents to allow edits
   * @param folderPath Path to the folder to unlock
   * @returns True if the folder was successfully unlocked
   */
  unlockFolder(folderPath: string) {
    return this.#filesStore.unlockFolder(folderPath);
  }

  /**
   * Check if a file is locked
   * @param filePath Path to the file to check
   * @returns Object with locked status, lock mode, and what caused the lock
   */
  isFileLocked(filePath: string) {
    return this.#filesStore.isFileLocked(filePath);
  }

  /**
   * Check if a folder is locked
   * @param folderPath Path to the folder to check
   * @returns Object with locked status, lock mode, and what caused the lock
   */
  isFolderLocked(folderPath: string) {
    return this.#filesStore.isFolderLocked(folderPath);
  }

  async createFile(filePath: string, content: string | Uint8Array = '') {
    try {
      const success = await this.#filesStore.createFile(filePath, content);

      if (success) {
        this.setSelectedFile(filePath);

        /*
         * For empty files, we need to ensure they're not marked as unsaved
         * Only check for empty string, not empty Uint8Array
         */
        if (typeof content === 'string' && content === '') {
          const newUnsavedFiles = new Set(this.unsavedFiles.get());
          newUnsavedFiles.delete(filePath);
          this.unsavedFiles.set(newUnsavedFiles);
        }
      }

      return success;
    } catch (error) {
      console.error('Failed to create file:', error);
      throw error;
    }
  }

  /**
   * Write file content directly to the workspace, without relying on the editor buffer.
   * Used for workflow checkpoint reverts and other non-editor mutations.
   */
  async writeFile(filePath: string, content: string) {
    const existing = this.#filesStore.getFile(filePath);

    if (existing) {
      await this.#filesStore.saveFile(filePath, content);
    } else {
      await this.#filesStore.createFile(filePath, content);
    }

    // Keep editor buffers in sync for open documents.
    const doc = this.#editorStore.documents.get()[filePath];

    if (doc) {
      this.#editorStore.updateFile(filePath, content);
    }

    // Ensure the file isn't marked as unsaved, since it's already persisted.
    const nextUnsaved = new Set(this.unsavedFiles.get());

    if (nextUnsaved.has(filePath)) {
      nextUnsaved.delete(filePath);
      this.unsavedFiles.set(nextUnsaved);
    }
  }

  async createFolder(folderPath: string) {
    try {
      return await this.#filesStore.createFolder(folderPath);
    } catch (error) {
      console.error('Failed to create folder:', error);
      throw error;
    }
  }

  async deleteFile(filePath: string) {
    try {
      const currentDocument = this.currentDocument.get();
      const isCurrentFile = currentDocument?.filePath === filePath;

      const success = await this.#filesStore.deleteFile(filePath);

      if (success) {
        const newUnsavedFiles = new Set(this.unsavedFiles.get());

        if (newUnsavedFiles.has(filePath)) {
          newUnsavedFiles.delete(filePath);
          this.unsavedFiles.set(newUnsavedFiles);
        }

        if (isCurrentFile) {
          const files = this.files.get();
          let nextFile: string | undefined = undefined;

          for (const [path, dirent] of Object.entries(files)) {
            if (dirent?.type === 'file') {
              nextFile = path;
              break;
            }
          }

          this.setSelectedFile(nextFile);
        }
      }

      return success;
    } catch (error) {
      console.error('Failed to delete file:', error);
      throw error;
    }
  }

  async deleteFolder(folderPath: string) {
    try {
      const currentDocument = this.currentDocument.get();
      const isInCurrentFolder = currentDocument?.filePath?.startsWith(folderPath + '/');

      const success = await this.#filesStore.deleteFolder(folderPath);

      if (success) {
        const unsavedFiles = this.unsavedFiles.get();
        const newUnsavedFiles = new Set<string>();

        for (const file of unsavedFiles) {
          if (!file.startsWith(folderPath + '/')) {
            newUnsavedFiles.add(file);
          }
        }

        if (newUnsavedFiles.size !== unsavedFiles.size) {
          this.unsavedFiles.set(newUnsavedFiles);
        }

        if (isInCurrentFolder) {
          const files = this.files.get();
          let nextFile: string | undefined = undefined;

          for (const [path, dirent] of Object.entries(files)) {
            if (dirent?.type === 'file') {
              nextFile = path;
              break;
            }
          }

          this.setSelectedFile(nextFile);
        }
      }

      return success;
    } catch (error) {
      console.error('Failed to delete folder:', error);
      throw error;
    }
  }

  async restoreSnapshot(snapshotFiles: FileMap) {
    await this.#filesStore.restoreSnapshot(snapshotFiles);
    this.#editorStore.setDocuments(snapshotFiles);
    this.showWorkbench.set(true);
    this.currentView.set('code');

    const selectedFile = this.currentDocument.get()?.filePath;

    if (selectedFile && snapshotFiles[selectedFile]?.type === 'file') {
      return;
    }

    const firstSnapshotFile = Object.entries(snapshotFiles).find(([, dirent]) => dirent?.type === 'file')?.[0];
    this.setSelectedFile(firstSnapshotFile);
  }

  abortAllActions() {
    const artifacts = Object.values(this.artifacts.get());
    let abortedActions = 0;

    for (const artifact of artifacts) {
      const actions = artifact.runner.actions.get();

      for (const action of Object.values(actions)) {
        if (action.status === 'running' || action.status === 'pending') {
          action.abort();
          abortedActions++;
        }
      }
    }

    if (abortedActions === 0) {
      return;
    }

    const abortEvent: InteractiveStepRunnerEvent = {
      type: 'error',
      timestamp: new Date().toISOString(),
      description: 'Execution aborted',
      error: `Aborted ${abortedActions} action${abortedActions === 1 ? '' : 's'} by user request.`,
    };

    this.#appendInteractiveStepEvent(abortEvent);
  }

  setReloadedMessages(messages: string[]) {
    this.#reloadedMessages = new Set(messages);
  }

  addArtifact({ messageId, title, id, type }: ArtifactCallbackData) {
    const artifact = this.#getArtifact(id);

    if (artifact) {
      return;
    }

    if (!this.artifactIdList.includes(id)) {
      this.artifactIdList.push(id);
    }

    this.artifacts.setKey(id, {
      id,
      title,
      closed: false,
      type,
      runner: new ActionRunner(
        webcontainer,
        () => this.boltTerminal,
        () => this.files.get(),
        (preview) => {
          const existingPreview = this.#previewsStore.previews
            .get()
            .find((candidate) => candidate.port === preview.port || candidate.baseUrl === preview.baseUrl);

          this.#previewsStore.setPreview({
            port: preview.port,
            ready: true,
            baseUrl: preview.baseUrl,
            revision: preview.revision,
          });

          if (!existingPreview) {
            this.currentView.set('preview');
            this.showWorkbench.set(true);
          }
        },
        this.#hostedRuntimeSessionId,
        (alert) => {
          if (this.#reloadedMessages.has(messageId)) {
            return;
          }

          this.actionAlert.set(alert);
        },
        (alert) => {
          if (this.#reloadedMessages.has(messageId)) {
            return;
          }

          this.supabaseAlert.set(alert);
        },
        (alert) => {
          if (this.#reloadedMessages.has(messageId)) {
            return;
          }

          this.deployAlert.set(alert);
        },
        (event) => {
          if (this.#reloadedMessages.has(messageId)) {
            return;
          }

          this.#appendInteractiveStepEvent(event);
        },
      ),
    });
  }

  updateArtifact({ artifactId }: ArtifactCallbackData, state: Partial<ArtifactUpdateState>) {
    if (!artifactId) {
      return;
    }

    const artifact = this.#getArtifact(artifactId);

    if (!artifact) {
      return;
    }

    this.artifacts.setKey(artifactId, { ...artifact, ...state });
  }
  addAction(data: ActionCallbackData) {
    // this._addAction(data);

    this.addToExecutionQueue(() => this._addAction(data));
  }
  async _addAction(data: ActionCallbackData) {
    const { artifactId } = data;

    const artifact = this.#getArtifact(artifactId);

    if (!artifact) {
      unreachable('Artifact not found');
    }

    return artifact.runner.addAction(data);
  }

  runAction(data: ActionCallbackData, isStreaming: boolean = false) {
    if (isStreaming) {
      this.actionStreamSampler(data, isStreaming);
    } else {
      this.addToExecutionQueue(() => this._runAction(data, isStreaming));
    }
  }
  async _runAction(data: ActionCallbackData, isStreaming: boolean = false) {
    const { artifactId } = data;

    const artifact = this.#getArtifact(artifactId);

    if (!artifact) {
      unreachable('Artifact not found');
    }

    const action = artifact.runner.actions.get()[data.actionId];

    if (!action || action.executed) {
      return;
    }

    const autonomyMode = this.autonomyMode.get();
    const decisionKey = `${artifactId}:${data.actionId}`;
    const existingDecision = this.#actionDecisions.get(decisionKey);

    if (existingDecision === 'rejected') {
      return;
    }

    if (!isActionAutoAllowed(data.action, autonomyMode)) {
      if (autonomyMode === 'read-only') {
        logger.warn('Autonomy read-only blocked action', {
          actionType: data.action.type,
          actionId: data.actionId,
          artifactId,
          actionTarget: data.action.type === 'file' ? data.action.filePath : data.action.content,
        });
        artifact.runner.actions.setKey(data.actionId, {
          ...action,
          status: 'failed',
          executed: true,
          error: 'Blocked by read-only autonomy mode',
        } as any);
        this.#actionDecisions.set(decisionKey, 'rejected');
        this.actionAlert.set({
          type: 'warning',
          title: 'Action blocked by autonomy mode',
          description:
            'Read-Only mode prevented this project action. Switch to Safe Auto or Full Auto to scaffold/install/run apps.',
          content: `Blocked action type: ${data.action.type}.`,
          source: 'terminal',
        });

        return;
      }

      if (existingDecision !== 'approved') {
        if (isStreaming) {
          return;
        }

        if (typeof window === 'undefined') {
          return;
        }

        const approved = window.confirm(
          `Autonomy mode (${autonomyMode}) requires review.\n\nAllow ${data.action.type} action now?`,
        );

        if (!approved) {
          this.#actionDecisions.set(decisionKey, 'rejected');
          artifact.runner.actions.setKey(data.actionId, {
            ...action,
            status: 'failed',
            executed: true,
            error: 'Rejected in review-required autonomy mode',
          } as any);

          return;
        }

        this.#actionDecisions.set(decisionKey, 'approved');
      }
    }

    if (data.action.type === 'file') {
      const wc = await webcontainer;
      const fullPath = toWorkbenchAbsoluteFilePath(data.action.filePath, wc.workdir);

      /*
       * For scoped locks, we would need to implement diff checking here
       * to determine if the AI is modifying existing code or just adding new code
       * This is a more complex feature that would be implemented in a future update
       */

      if (this.selectedFile.value !== fullPath) {
        this.setSelectedFile(fullPath);
      }

      const hasReadyPreview = this.#previewsStore.previews.get().some((preview) => preview.ready && preview.baseUrl);

      if (this.currentView.value !== 'code' && !hasReadyPreview) {
        this.currentView.set('code');
      }

      const doc = this.#editorStore.documents.get()[fullPath];

      if (isStreaming) {
        if (doc) {
          this.#editorStore.updateFile(fullPath, data.action.content);
        }

        await artifact.runner.runAction(data, true);

        return;
      }

      /*
       * Persist the completed file change through the files store first so hosted-runtime
       * snapshots include unopened files before the runtime sync runs.
       */
      await this.writeFile(fullPath, data.action.content);
      await artifact.runner.runAction(data);
      this.resetAllFileModifications();
    } else {
      await artifact.runner.runAction(data);
    }
  }

  actionStreamSampler = createSampler(async (data: ActionCallbackData, isStreaming: boolean = false) => {
    return await this._runAction(data, isStreaming);
  }, ACTION_STREAM_SAMPLE_INTERVAL_MS);

  #getArtifact(id: string) {
    const artifacts = this.artifacts.get();
    return artifacts[id];
  }

  async downloadZip() {
    const [{ default: jsZip }, fileSaver] = await Promise.all([import('jszip'), import('file-saver')]);
    const zip = new jsZip();
    const files = this.files.get();

    // Get the project name from the description input, or use a default name
    const projectName = (description.value ?? 'project').toLocaleLowerCase().split(' ').join('_');

    // Generate a simple 6-character hash based on the current timestamp
    const timestampHash = Date.now().toString(36).slice(-6);
    const uniqueProjectName = `${projectName}_${timestampHash}`;

    for (const [filePath, dirent] of Object.entries(files)) {
      if (dirent?.type === 'file' && !dirent.isBinary) {
        const relativePath = extractRelativePath(filePath);

        // split the path into segments
        const pathSegments = relativePath.split('/');

        // if there's more than one segment, we need to create folders
        if (pathSegments.length > 1) {
          let currentFolder = zip;

          for (let i = 0; i < pathSegments.length - 1; i++) {
            currentFolder = currentFolder.folder(pathSegments[i])!;
          }
          currentFolder.file(pathSegments[pathSegments.length - 1], dirent.content);
        } else {
          // if there's only one segment, it's a file in the root
          zip.file(relativePath, dirent.content);
        }
      }
    }

    // Generate the zip file and save it
    const content = await zip.generateAsync({ type: 'blob' });
    fileSaver.saveAs(content, `${uniqueProjectName}.zip`);
  }

  async runTestAndSecurityScan() {
    if (this.isTestAndScanRunning.get()) {
      return;
    }

    this.isTestAndScanRunning.set(true);

    try {
      const changes = this.getFileModifcations() || {};
      const changedPaths = Object.keys(changes);
      const [{ getMissingJestStubs, createTestAndSecuritySteps }, interactiveStepRunnerModule, collaborationClient] =
        await Promise.all([
          import('~/lib/runtime/test-security'),
          import('~/lib/runtime/interactive-step-runner'),
          import('~/lib/collaboration/client'),
        ]);
      const missingStubs = getMissingJestStubs(this.files.get(), changedPaths);

      for (const stub of missingStubs) {
        await this.createFile(stub.path, stub.content);
      }

      const shell = this.boltTerminal;
      await shell.ready();

      let eventSocket: WebSocket | undefined;

      try {
        if (typeof window !== 'undefined') {
          const base = collaborationClient.getCollaborationServerUrl();
          eventSocket = new WebSocket(`${base.replace(/\/$/, '')}/events`);
        }
      } catch {
        eventSocket = undefined;
      }

      const steps = createTestAndSecuritySteps();
      const runner = new interactiveStepRunnerModule.InteractiveStepRunner(
        {
          executeStep: async (step, context) => {
            const commandText =
              step.command[0] === 'bash' && step.command[1] === '-lc' && step.command[2]
                ? `bash -lc ${JSON.stringify(step.command[2])}`
                : step.command.join(' ');
            const resp = await shell.executeCommand(`quality-${Date.now()}`, commandText, undefined, (chunk) =>
              context.onStdout(chunk),
            );

            return {
              exitCode: resp?.exitCode ?? 1,
              stdout: resp?.output || '',
              stderr: resp?.exitCode === 0 ? '' : resp?.output || '',
            };
          },
        },
        eventSocket,
      );

      runner.addEventListener('event', (event) => {
        const detail = (event as CustomEvent<InteractiveStepRunnerEvent>).detail;
        this.#appendInteractiveStepEvent(detail);
      });

      await runner.run(steps);

      if (
        eventSocket &&
        (eventSocket.readyState === WebSocket.OPEN || eventSocket.readyState === WebSocket.CONNECTING)
      ) {
        eventSocket.close();
      }
    } finally {
      this.isTestAndScanRunning.set(false);
    }
  }

  async syncFiles(targetHandle: FileSystemDirectoryHandle) {
    const files = this.files.get();
    const syncedFiles = [];

    for (const [filePath, dirent] of Object.entries(files)) {
      if (dirent?.type === 'file' && !dirent.isBinary) {
        const relativePath = extractRelativePath(filePath);
        const pathSegments = relativePath.split('/');
        let currentHandle = targetHandle;

        for (let i = 0; i < pathSegments.length - 1; i++) {
          currentHandle = await currentHandle.getDirectoryHandle(pathSegments[i], { create: true });
        }

        // create or get the file
        const fileHandle = await currentHandle.getFileHandle(pathSegments[pathSegments.length - 1], {
          create: true,
        });

        // write the file content
        const writable = await fileHandle.createWritable();
        await writable.write(dirent.content);
        await writable.close();

        syncedFiles.push(relativePath);
      }
    }

    return syncedFiles;
  }

  async pushToRepository(
    provider: 'github' | 'gitlab',
    repoName: string,
    commitMessage?: string,
    username?: string,
    token?: string,
    isPrivate: boolean = false,
    branchName: string = 'main',
  ) {
    try {
      const isGitHub = provider === 'github';
      const isGitLab = provider === 'gitlab';

      const cookies = (await import('js-cookie')).default;
      const authToken = token || cookies.get(isGitHub ? 'githubToken' : 'gitlabToken');
      const owner = username || cookies.get(isGitHub ? 'githubUsername' : 'gitlabUsername');

      if (!authToken || !owner) {
        throw new Error(`${provider} token or username is not set in cookies or provided.`);
      }

      const files = this.files.get();

      if (!files || Object.keys(files).length === 0) {
        throw new Error('No files found to push');
      }

      if (isGitHub) {
        const octokitModule = await import('@octokit/rest');

        // Initialize Octokit with the auth token.
        const octokit = new octokitModule.Octokit({ auth: authToken });

        // Check if the repository already exists before creating it
        let repo: any;
        let visibilityJustChanged = false;

        try {
          const resp = await octokit.repos.get({ owner, repo: repoName });
          repo = resp.data;
          console.log('Repository already exists, using existing repo');

          // Check if we need to update visibility of existing repo
          if (repo.private !== isPrivate) {
            console.log(
              `Updating repository visibility from ${repo.private ? 'private' : 'public'} to ${isPrivate ? 'private' : 'public'}`,
            );

            try {
              // Update repository visibility using the update method
              const { data: updatedRepo } = await octokit.repos.update({
                owner,
                repo: repoName,
                private: isPrivate,
              });

              console.log('Repository visibility updated successfully');
              repo = updatedRepo;
              visibilityJustChanged = true;

              // Add a delay after changing visibility to allow GitHub to fully process the change
              console.log('Waiting for visibility change to propagate...');
              await new Promise((resolve) => setTimeout(resolve, 3000)); // 3 second delay
            } catch (visibilityError) {
              console.error('Failed to update repository visibility:', visibilityError);

              // Continue with push even if visibility update fails
            }
          }
        } catch (error) {
          if (error instanceof Error && 'status' in error && error.status === 404) {
            // Repository doesn't exist, so create a new one
            console.log(`Creating new repository with private=${isPrivate}`);

            // Create new repository with specified privacy setting
            const createRepoOptions = {
              name: repoName,
              private: isPrivate,
              auto_init: true,
            };

            console.log('Create repo options:', createRepoOptions);

            const { data: newRepo } = await octokit.repos.createForAuthenticatedUser(createRepoOptions);

            console.log('Repository created:', newRepo.html_url, 'Private:', newRepo.private);
            repo = newRepo;

            // Add a small delay after creating a repository to allow GitHub to fully initialize it
            console.log('Waiting for repository to initialize...');
            await new Promise((resolve) => setTimeout(resolve, 2000)); // 2 second delay
          } else {
            console.error('Cannot create repo:', error);
            throw error; // Some other error occurred
          }
        }

        // Get all files
        const files = this.files.get();

        if (!files || Object.keys(files).length === 0) {
          throw new Error('No files found to push');
        }

        // Function to push files with retry logic
        const pushFilesToRepo = async (attempt = 1): Promise<string> => {
          const maxAttempts = 3;

          try {
            console.log(`Pushing files to repository (attempt ${attempt}/${maxAttempts})...`);

            // Create blobs for each file
            const blobs = await Promise.all(
              Object.entries(files).map(async ([filePath, dirent]) => {
                if (dirent?.type === 'file' && dirent.content) {
                  const { data: blob } = await octokit.git.createBlob({
                    owner: repo.owner.login,
                    repo: repo.name,
                    content: Buffer.from(dirent.content).toString('base64'),
                    encoding: 'base64',
                  });
                  return { path: extractRelativePath(filePath), sha: blob.sha };
                }

                return null;
              }),
            );

            const validBlobs = blobs.filter(Boolean); // Filter out any undefined blobs

            if (validBlobs.length === 0) {
              throw new Error('No valid files to push');
            }

            // Refresh repository reference to ensure we have the latest data
            const repoRefresh = await octokit.repos.get({ owner, repo: repoName });
            repo = repoRefresh.data;

            // Get the latest commit SHA (assuming main branch, update dynamically if needed)
            const { data: ref } = await octokit.git.getRef({
              owner: repo.owner.login,
              repo: repo.name,
              ref: `heads/${repo.default_branch || 'main'}`, // Handle dynamic branch
            });
            const latestCommitSha = ref.object.sha;

            // Create a new tree
            const { data: newTree } = await octokit.git.createTree({
              owner: repo.owner.login,
              repo: repo.name,
              base_tree: latestCommitSha,
              tree: validBlobs.map((blob) => ({
                path: blob!.path,
                mode: '100644',
                type: 'blob',
                sha: blob!.sha,
              })),
            });

            // Create a new commit
            const { data: newCommit } = await octokit.git.createCommit({
              owner: repo.owner.login,
              repo: repo.name,
              message: commitMessage || 'Initial commit from your app',
              tree: newTree.sha,
              parents: [latestCommitSha],
            });

            // Update the reference
            await octokit.git.updateRef({
              owner: repo.owner.login,
              repo: repo.name,
              ref: `heads/${repo.default_branch || 'main'}`, // Handle dynamic branch
              sha: newCommit.sha,
            });

            console.log('Files successfully pushed to repository');

            return repo.html_url;
          } catch (error) {
            console.error(`Error during push attempt ${attempt}:`, error);

            // If we've just changed visibility and this is not our last attempt, wait and retry
            if ((visibilityJustChanged || attempt === 1) && attempt < maxAttempts) {
              const delayMs = attempt * 2000; // Increasing delay with each attempt
              console.log(`Waiting ${delayMs}ms before retry...`);
              await new Promise((resolve) => setTimeout(resolve, delayMs));

              return pushFilesToRepo(attempt + 1);
            }

            throw error; // Rethrow if we're out of attempts
          }
        };

        // Execute the push function with retry logic
        const repoUrl = await pushFilesToRepo();

        // Return the repository URL
        return repoUrl;
      }

      if (isGitLab) {
        const { GitLabApiService: gitLabApiServiceClass } = await import('~/lib/services/gitlabApiService');
        const gitLabApiService = new gitLabApiServiceClass(authToken, 'https://gitlab.com');

        // Check or create repo
        let repo = await gitLabApiService.getProject(owner, repoName);

        if (!repo) {
          repo = await gitLabApiService.createProject(repoName, isPrivate);
          await new Promise((r) => setTimeout(r, 2000)); // Wait for repo initialization
        }

        // Check if branch exists, create if not
        const branchRes = await gitLabApiService.getFile(repo.id, 'README.md', branchName).catch(() => null);

        if (!branchRes || !branchRes.ok) {
          // Create branch from default
          await gitLabApiService.createBranch(repo.id, branchName, repo.default_branch);
          await new Promise((r) => setTimeout(r, 1000));
        }

        const actions = Object.entries(files).reduce(
          (acc, [filePath, dirent]) => {
            if (dirent?.type === 'file' && dirent.content) {
              acc.push({
                action: 'create',
                file_path: extractRelativePath(filePath),
                content: dirent.content,
              });
            }

            return acc;
          },
          [] as { action: 'create' | 'update'; file_path: string; content: string }[],
        );

        // Check which files exist and update action accordingly
        for (const action of actions) {
          const fileCheck = await gitLabApiService.getFile(repo.id, action.file_path, branchName);

          if (fileCheck.ok) {
            action.action = 'update';
          }
        }

        // Commit all files
        await gitLabApiService.commitFiles(repo.id, {
          branch: branchName,
          commit_message: commitMessage || 'Commit multiple files',
          actions,
        });

        return repo.web_url;
      }

      // Should not reach here since we only handle GitHub and GitLab
      throw new Error(`Unsupported provider: ${provider}`);
    } catch (error) {
      console.error('Error pushing to repository:', error);
      throw error; // Rethrow the error for further handling
    }
  }
}

type HostedPreviewSync = Pick<PreviewInfo, 'port' | 'baseUrl' | 'revision'>;

export const workbenchStore = new WorkbenchStore();
