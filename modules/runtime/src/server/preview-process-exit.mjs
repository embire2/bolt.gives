export function observeUnexpectedPreviewExit(session, processKey, child, onUnexpectedExit) {
  child.once('close', (exitCode) => {
    const activeHandle = session.processes.get(processKey);

    if (!activeHandle || activeHandle.process !== child || activeHandle.intentionalStop) {
      return;
    }

    onUnexpectedExit(exitCode);
  });
}
