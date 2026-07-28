import { describe, expect, it, vi } from 'vitest';
import { createDeploymentArtifact } from './deploymentArtifact';

describe('createDeploymentArtifact', () => {
  it('waits for asynchronous artifact initialization before exposing the runner', async () => {
    const runner = { handleDeployAction: vi.fn() };
    const addArtifact = vi.fn(
      () =>
        new Promise<any>((resolve) => {
          setTimeout(() => resolve({ id: 'deploy-github-project', runner }), 5);
        }),
    );

    const artifact = await createDeploymentArtifact({ addArtifact } as any, {
      id: 'deploy-github-project',
      messageId: 'deploy-github-project',
      title: 'GitHub Deployment',
      type: 'standalone',
    });

    expect(artifact.runner).toBe(runner);
    expect(addArtifact).toHaveBeenCalledOnce();
  });
});
