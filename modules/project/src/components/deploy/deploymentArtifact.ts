import type { ArtifactCallbackData } from '@bolt/agent/lib/runtime/message-parser';
import type { ArtifactState, WorkbenchStore } from '@bolt/project/lib/stores/workbench';

export async function createDeploymentArtifact(
  store: Pick<WorkbenchStore, 'addArtifact'>,
  input: ArtifactCallbackData,
): Promise<ArtifactState> {
  const artifact = await store.addArtifact(input);

  if (!artifact?.runner) {
    throw new Error(`Unable to prepare ${input.title || 'deployment'} status tracking.`);
  }

  return artifact;
}
