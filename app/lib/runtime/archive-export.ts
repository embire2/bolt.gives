import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import type { FileMap } from '~/lib/stores/files';
import { extractRelativePath } from '~/utils/diff';

export async function downloadWorkspaceZip(options: { files: FileMap; projectDescription?: string }) {
  const zip = new JSZip();
  const projectName = (options.projectDescription || 'project').toLocaleLowerCase().split(' ').join('_');
  const timestampHash = Date.now().toString(36).slice(-6);
  const uniqueProjectName = `${projectName}_${timestampHash}`;

  for (const [filePath, dirent] of Object.entries(options.files)) {
    if (dirent?.type !== 'file' || dirent.isBinary) {
      continue;
    }

    const relativePath = extractRelativePath(filePath);
    const pathSegments = relativePath.split('/');

    if (pathSegments.length > 1) {
      let currentFolder = zip;

      for (let index = 0; index < pathSegments.length - 1; index++) {
        currentFolder = currentFolder.folder(pathSegments[index])!;
      }

      currentFolder.file(pathSegments[pathSegments.length - 1], dirent.content);
      continue;
    }

    zip.file(relativePath, dirent.content);
  }

  const content = await zip.generateAsync({ type: 'blob' });
  saveAs(content, `${uniqueProjectName}.zip`);
}
