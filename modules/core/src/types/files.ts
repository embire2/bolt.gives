export interface ProjectFile {
  type: 'file';
  content: string;
  isBinary: boolean;
  isLocked?: boolean;
  lockedByFolder?: string;
}

export interface ProjectFolder {
  type: 'folder';
  isLocked?: boolean;
  lockedByFolder?: string;
}

export type ProjectDirent = ProjectFile | ProjectFolder;
export type FileMap = Record<string, ProjectDirent | undefined>;

// Preserve the public names used by the existing application.
export type File = ProjectFile;
export type Folder = ProjectFolder;
