import { useState } from 'react';
import { toast } from 'react-toastify';
import {
  deployHostedRuntimeProjectToCloudflare,
  publishHostedRuntimeProject,
} from '@bolt/runtime/lib/runtime/hosted-runtime-client';
import { workbenchStore } from '@bolt/project/lib/stores/workbench';

function defaultProjectName() {
  return (
    workbenchStore.firstArtifact?.title
      ?.toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 28) || 'my-web-app'
  );
}

function requireHostedRuntimeSession() {
  const sessionId = workbenchStore.hostedRuntimeSessionId;

  if (!sessionId) {
    throw new Error('Start the hosted Preview before deploying this project.');
  }

  return sessionId;
}

export function useOpenWebDeploy() {
  const [isDeploying, setIsDeploying] = useState(false);

  const handleOpenWebDeploy = async () => {
    try {
      const sessionId = requireHostedRuntimeSession();
      const subdomain = window.prompt('Choose a free shareable bolt.gives subdomain:', defaultProjectName());

      if (!subdomain) {
        return false;
      }

      setIsDeploying(true);
      toast.info('OpenWeb.Software is publishing your project and preparing HTTPS.');

      const result = await publishHostedRuntimeProject({ sessionId, subdomain });
      const url = result.deployment.url || `https://${result.deployment.hostname}`;

      toast.success(`Published to ${url}`);
      window.open(url, '_blank', 'noopener,noreferrer');

      return result;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'OpenWeb.Software deployment failed.');
      return false;
    } finally {
      setIsDeploying(false);
    }
  };

  return { isDeploying, handleOpenWebDeploy };
}

export function useCloudflareDeploy() {
  const [isDeploying, setIsDeploying] = useState(false);

  const handleCloudflareDeploy = async () => {
    try {
      const sessionId = requireHostedRuntimeSession();
      const projectName = window.prompt(
        'Choose a Cloudflare Pages project name. bolt.gives will build and upload it securely:',
        defaultProjectName(),
      );

      if (!projectName) {
        return false;
      }

      setIsDeploying(true);
      toast.info('Building the production artifact and deploying it to Cloudflare Pages.');

      const result = await deployHostedRuntimeProjectToCloudflare({ sessionId, projectName });
      const url = result.deployment.deploymentUrl || result.deployment.pagesUrl;

      if (!url) {
        throw new Error('Cloudflare completed without returning a deployment URL.');
      }

      toast.success(`Cloudflare deployment is live at ${url}`);
      window.open(url, '_blank', 'noopener,noreferrer');

      return result;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Cloudflare deployment failed.');
      return false;
    } finally {
      setIsDeploying(false);
    }
  };

  return { isDeploying, handleCloudflareDeploy };
}
