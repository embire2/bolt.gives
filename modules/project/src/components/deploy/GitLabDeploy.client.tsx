import { toast } from 'react-toastify';
import { useStore } from '@nanostores/react';
import { workbenchStore } from '@bolt/project/lib/stores/workbench';
import { webcontainer } from '@bolt/project/lib/webcontainer';
import { path } from '@bolt/core/utils/path';
import { isHostedRuntimeEnabled } from '@bolt/runtime/lib/runtime/hosted-runtime-client';
import { useState } from 'react';
import type { ActionCallbackData } from '@bolt/agent/lib/runtime/message-parser';
import { chatId } from '@bolt/project/lib/persistence/useChatHistory';
import { getLocalStorage } from '@bolt/project/lib/persistence/localStorage';
import { formatBuildFailureOutput } from './deployUtils';
import { createDeploymentArtifact } from './deploymentArtifact';
import { buildAndSnapshotHostedRepository } from './repositoryDeployment';

export function useGitLabDeploy() {
  const [isDeploying, setIsDeploying] = useState(false);
  const currentChatId = useStore(chatId);

  const handleGitLabDeploy = async () => {
    const connection = getLocalStorage('gitlab_connection');

    if (!connection?.token || !connection?.user) {
      toast.error('Please connect your GitLab account in Settings > Connections first');
      return false;
    }

    if (!currentChatId) {
      toast.error('No active chat found');
      return false;
    }

    try {
      setIsDeploying(true);

      const artifact = workbenchStore.firstArtifact;

      if (!artifact) {
        throw new Error('No active project found');
      }

      // Create a deployment artifact for visual feedback
      const deploymentId = `deploy-gitlab-project`;
      const deployArtifact = await createDeploymentArtifact(workbenchStore, {
        id: deploymentId,
        messageId: deploymentId,
        title: 'GitLab Deployment',
        type: 'standalone',
      });

      // Notify that build is starting
      deployArtifact.runner.handleDeployAction('building', 'running', { source: 'gitlab' });

      let buildOutput;
      let fileContents: Record<string, string>;

      if (isHostedRuntimeEnabled()) {
        const hostedResult = await buildAndSnapshotHostedRepository(workbenchStore.hostedRuntimeSessionId);
        buildOutput = hostedResult.buildOutput;
        fileContents = hostedResult.files;
      } else {
        const actionId = 'build-' + Date.now();
        const actionData: ActionCallbackData = {
          messageId: 'gitlab build',
          artifactId: artifact.id,
          actionId,
          action: {
            type: 'build' as const,
            content: 'npm run build',
          },
        };

        artifact.runner.addAction(actionData);
        await artifact.runner.runAction(actionData);
        buildOutput = artifact.runner.buildOutput;

        const container = await webcontainer;

        async function getAllFiles(dirPath: string, basePath: string = ''): Promise<Record<string, string>> {
          const files: Record<string, string> = {};
          const entries = await container.fs.readdir(dirPath, { withFileTypes: true });

          for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);
            const relativePath = basePath ? `${basePath}/${entry.name}` : entry.name;

            if (
              entry.isDirectory() &&
              (entry.name === 'node_modules' ||
                entry.name === '.git' ||
                entry.name === 'dist' ||
                entry.name === 'build' ||
                entry.name === '.cache' ||
                entry.name === '.next')
            ) {
              continue;
            }

            if (entry.isFile()) {
              if (entry.name.endsWith('.DS_Store') || entry.name.endsWith('.log') || entry.name.startsWith('.env')) {
                continue;
              }

              try {
                files[relativePath] = await container.fs.readFile(fullPath, 'utf-8');
              } catch (error) {
                console.warn(`Could not read file ${fullPath}:`, error);
              }
            } else if (entry.isDirectory()) {
              Object.assign(files, await getAllFiles(fullPath, relativePath));
            }
          }

          return files;
        }

        fileContents = await getAllFiles('/');
      }

      if (!buildOutput || buildOutput.exitCode !== 0) {
        // Notify that build failed
        deployArtifact.runner.handleDeployAction('building', 'failed', {
          error: formatBuildFailureOutput(buildOutput?.output),
          source: 'gitlab',
        });
        throw new Error('Build failed');
      }

      // Notify that build succeeded and deployment preparation is starting
      deployArtifact.runner.handleDeployAction('deploying', 'running', {
        source: 'gitlab',
      });

      /*
       * Show GitLab deployment dialog here - it will handle the actual deployment
       * and will receive these files to deploy
       */

      /*
       * For now, we'll just complete the deployment with a success message
       * Notify that deployment preparation is complete
       */
      deployArtifact.runner.handleDeployAction('deploying', 'complete', {
        source: 'gitlab',
      });

      // Show success toast notification
      toast.success(`🚀 GitLab deployment preparation completed successfully!`);

      return {
        success: true,
        files: fileContents,
        projectName: artifact.title || 'bolt-project',
      };
    } catch (err) {
      console.error('GitLab deploy error:', err);
      toast.error(err instanceof Error ? err.message : 'GitLab deployment preparation failed');

      return false;
    } finally {
      setIsDeploying(false);
    }
  };

  return {
    isDeploying,
    handleGitLabDeploy,
    isConnected: !!getLocalStorage('gitlab_connection')?.user,
  };
}
