import { atom, map, type MapStore, type ReadableAtom, type WritableAtom } from 'nanostores';
import type { EditorDocument, ScrollPosition } from '~/components/editor/codemirror/CodeMirrorEditor';
import type { ActionRunner } from '~/lib/runtime/action-runner';
import type { ActionCallbackData, ArtifactCallbackData } from '~/lib/runtime/message-parser';
import { webcontainer } from '~/lib/webcontainer';
import type { ITerminal } from '~/types/terminal';
import { EditorStore } from './editor';
import { FilesStore, type FileMap } from './files';
import { PreviewsStore } from './previews';
import type { PreviewInfo } from './previews';
import { TerminalStore } from './terminal';
import { extractRelativePath } from '~/utils/diff';
import { description } from '~/lib/persistence';
import { createSampler } from '~/utils/sampler';
import type { ActionAlert, DeployAlert, SupabaseAlert } from '~/types/actions';
import type { BoltAction } from '~/types/actions';
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
const ARTIFACT_READY_WAIT_TIMEOUT_MS = 5_000;
const ARTIFACT_READY_POLL_INTERVAL_MS = 50;

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

  async #waitForArtifact(id: string, timeoutMs: number = ARTIFACT_READY_WAIT_TIMEOUT_MS) {
    const existingArtifact = this.#getArtifact(id);

    if (existingArtifact) {
      return existingArtifact;
    }

    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      await new Promise((resolve) => setTimeout(resolve, ARTIFACT_READY_POLL_INTERVAL_MS));

      const artifact = this.#getArtifact(id);

      if (artifact) {
        return artifact;
      }
    }

    return undefined;
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

  async addArtifact({ messageId, title, id, type }: ArtifactCallbackData) {
    const artifact = this.#getArtifact(id);

    if (artifact) {
      return;
    }

    if (!this.artifactIdList.includes(id)) {
      this.artifactIdList.push(id);
    }

    const actionRunnerModule = await import('~/lib/runtime/action-runner');

    this.artifacts.setKey(id, {
      id,
      title,
      closed: false,
      type,
      runner: new actionRunnerModule.ActionRunner(
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

  dispatchSyntheticRuntimeHandoff(options: {
    messageId: string;
    handoffId: string;
    setupCommand?: string;
    startCommand: string;
  }) {
    return this.addToExecutionQueue(async () => {
      const artifactId = `${options.messageId}-runtime-handoff`;
      await this.addArtifact({
        messageId: options.messageId,
        id: artifactId,
        artifactId,
        title: 'Runtime Handoff',
        type: 'shell',
      });

      const artifact = await this.#waitForArtifact(artifactId);

      if (!artifact) {
        const error = `Runtime handoff artifact "${artifactId}" could not be created.`;
        logger.warn(error, { handoffId: options.handoffId, messageId: options.messageId });
        this.#appendInteractiveStepEvent({
          type: 'error',
          timestamp: new Date().toISOString(),
          description: 'Runtime handoff failed to initialize',
          error,
        });

        return;
      }

      this.showWorkbench.set(true);
      this.currentView.set('preview');
      this.#appendInteractiveStepEvent({
        type: 'telemetry',
        timestamp: new Date().toISOString(),
        description: 'Workspace runtime handoff queued',
        output: `start=${options.startCommand}${options.setupCommand ? ` | setup=${options.setupCommand}` : ''}`,
      });

      const actions: BoltAction[] = [
        ...(options.setupCommand ? ([{ type: 'shell', content: options.setupCommand }] as const) : []),
        { type: 'start', content: options.startCommand },
      ];

      for (const [index, action] of actions.entries()) {
        const actionId = `${artifactId}-action-${index}`;
        const actionData: ActionCallbackData = {
          artifactId,
          messageId: options.messageId,
          actionId,
          action,
        };

        await artifact.runner.addAction(actionData);
        await this._runAction(actionData);
      }
    });
  }

  addAction(data: ActionCallbackData) {
    // this._addAction(data);

    this.addToExecutionQueue(() => this._addAction(data));
  }
  async _addAction(data: ActionCallbackData) {
    const { artifactId } = data;

    const artifact = await this.#waitForArtifact(artifactId);

    if (!artifact) {
      const error = `Workspace artifact "${artifactId}" was not ready before action registration.`;
      logger.warn(error, { artifactId, actionId: data.actionId, actionType: data.action.type });
      this.#appendInteractiveStepEvent({
        type: 'error',
        timestamp: new Date().toISOString(),
        description: 'Workspace initialization is still catching up',
        error,
      });

      return;
    }

    await artifact.runner.addAction(data);
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

    const artifact = await this.#waitForArtifact(artifactId);

    if (!artifact) {
      const error = `Workspace artifact "${artifactId}" was not ready before action execution.`;
      logger.warn(error, { artifactId, actionId: data.actionId, actionType: data.action.type });
      this.#appendInteractiveStepEvent({
        type: 'error',
        timestamp: new Date().toISOString(),
        description: 'Workspace initialization is still catching up',
        error,
      });

      return;
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
    const { downloadWorkspaceZip } = await import('~/lib/runtime/archive-export');
    await downloadWorkspaceZip({
      files: this.files.get(),
      projectDescription: description.value ?? 'project',
    });
  }

  async runTestAndSecurityScan() {
    if (this.isTestAndScanRunning.get()) {
      return;
    }

    this.isTestAndScanRunning.set(true);

    try {
      const changes = this.getFileModifcations() || {};
      const changedPaths = Object.keys(changes);
      const shell = this.boltTerminal;
      const { runWorkspaceTestAndSecurityScan } = await import('~/lib/runtime/test-security-runner');
      await runWorkspaceTestAndSecurityScan({
        files: this.files.get(),
        changedPaths,
        shell,
        createFile: (filePath, content) => this.createFile(filePath, content),
        onEvent: (event) => {
          this.#appendInteractiveStepEvent(event);
        },
      });
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
      const files = this.files.get();

      if (!files || Object.keys(files).length === 0) {
        throw new Error('No files found to push');
      }

      const { pushWorkspaceToRepository } = await import('~/lib/runtime/repository-publisher');

      return await pushWorkspaceToRepository({
        provider,
        files,
        repoName,
        commitMessage,
        username,
        token,
        isPrivate,
        branchName,
      });
    } catch (error) {
      console.error('Error pushing to repository:', error);
      throw error; // Rethrow the error for further handling
    }
  }
}

type HostedPreviewSync = Pick<PreviewInfo, 'port' | 'baseUrl' | 'revision'>;

export const workbenchStore = new WorkbenchStore();
