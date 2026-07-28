import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useStore } from '@nanostores/react';
import { netlifyConnection } from '@bolt/project/lib/stores/netlify';
import { vercelConnection } from '@bolt/project/lib/stores/vercel';
import { isGitLabConnected } from '@bolt/project/lib/stores/gitlabConnection';
import { workbenchStore } from '@bolt/project/lib/stores/workbench';
import { streamingState } from '@bolt/project/lib/stores/streaming';
import { classNames } from '@bolt/core/utils/classNames';
import { lazy, Suspense, useState } from 'react';
import { NetlifyDeploymentLink } from '~/components/chat/NetlifyDeploymentLink.client';
import { VercelDeploymentLink } from '~/components/chat/VercelDeploymentLink.client';
import { useVercelDeploy } from '@bolt/project/components/deploy/VercelDeploy.client';
import { useNetlifyDeploy } from '@bolt/project/components/deploy/NetlifyDeploy.client';
import { useGitHubDeploy } from '@bolt/project/components/deploy/GitHubDeploy.client';
import { useGitLabDeploy } from '@bolt/project/components/deploy/GitLabDeploy.client';
import { useCloudflareDeploy, useOpenWebDeploy } from '@bolt/project/components/deploy/HostedDeploy.client';

const LazyGitHubDeploymentDialog = lazy(() =>
  import('@bolt/project/components/deploy/GitHubDeploymentDialog').then((module) => ({
    default: module.GitHubDeploymentDialog,
  })),
);
const LazyGitLabDeploymentDialog = lazy(() =>
  import('@bolt/project/components/deploy/GitLabDeploymentDialog').then((module) => ({
    default: module.GitLabDeploymentDialog,
  })),
);

interface DeployButtonProps {
  onVercelDeploy?: () => Promise<void>;
  onNetlifyDeploy?: () => Promise<void>;
  onGitHubDeploy?: () => Promise<void>;
  onGitLabDeploy?: () => Promise<void>;
  onCloudflareDeploy?: () => Promise<void>;
  onOpenWebDeploy?: () => Promise<void>;
}

export const DeployButton = ({
  onVercelDeploy,
  onNetlifyDeploy,
  onGitHubDeploy,
  onGitLabDeploy,
  onCloudflareDeploy,
  onOpenWebDeploy,
}: DeployButtonProps) => {
  const netlifyConn = useStore(netlifyConnection);
  const vercelConn = useStore(vercelConnection);
  const gitlabIsConnected = useStore(isGitLabConnected);
  const [activePreviewIndex] = useState(0);
  const previews = useStore(workbenchStore.previews);
  const activePreview = previews[activePreviewIndex];
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployingTo, setDeployingTo] = useState<
    'netlify' | 'vercel' | 'github' | 'gitlab' | 'cloudflare' | 'openweb' | null
  >(null);
  const isStreaming = useStore(streamingState);
  const { handleVercelDeploy } = useVercelDeploy();
  const { handleNetlifyDeploy } = useNetlifyDeploy();
  const { handleGitHubDeploy } = useGitHubDeploy();
  const { handleGitLabDeploy } = useGitLabDeploy();
  const { handleCloudflareDeploy } = useCloudflareDeploy();
  const { handleOpenWebDeploy } = useOpenWebDeploy();
  const [showGitHubDeploymentDialog, setShowGitHubDeploymentDialog] = useState(false);
  const [showGitLabDeploymentDialog, setShowGitLabDeploymentDialog] = useState(false);
  const [githubDeploymentFiles, setGithubDeploymentFiles] = useState<Record<string, string> | null>(null);
  const [gitlabDeploymentFiles, setGitlabDeploymentFiles] = useState<Record<string, string> | null>(null);
  const [githubProjectName, setGithubProjectName] = useState('');
  const [gitlabProjectName, setGitlabProjectName] = useState('');

  const handleVercelDeployClick = async () => {
    setIsDeploying(true);
    setDeployingTo('vercel');

    try {
      if (onVercelDeploy) {
        await onVercelDeploy();
      } else {
        await handleVercelDeploy();
      }
    } finally {
      setIsDeploying(false);
      setDeployingTo(null);
    }
  };

  const handleNetlifyDeployClick = async () => {
    setIsDeploying(true);
    setDeployingTo('netlify');

    try {
      if (onNetlifyDeploy) {
        await onNetlifyDeploy();
      } else {
        await handleNetlifyDeploy();
      }
    } finally {
      setIsDeploying(false);
      setDeployingTo(null);
    }
  };

  const handleGitHubDeployClick = async () => {
    setIsDeploying(true);
    setDeployingTo('github');

    try {
      if (onGitHubDeploy) {
        await onGitHubDeploy();
      } else {
        const result = await handleGitHubDeploy();

        if (result && result.success && result.files) {
          setGithubDeploymentFiles(result.files);
          setGithubProjectName(result.projectName);
          setShowGitHubDeploymentDialog(true);
        }
      }
    } finally {
      setIsDeploying(false);
      setDeployingTo(null);
    }
  };

  const handleGitLabDeployClick = async () => {
    setIsDeploying(true);
    setDeployingTo('gitlab');

    try {
      if (onGitLabDeploy) {
        await onGitLabDeploy();
      } else {
        const result = await handleGitLabDeploy();

        if (result && result.success && result.files) {
          setGitlabDeploymentFiles(result.files);
          setGitlabProjectName(result.projectName);
          setShowGitLabDeploymentDialog(true);
        }
      }
    } finally {
      setIsDeploying(false);
      setDeployingTo(null);
    }
  };

  const handleCloudflareDeployClick = async () => {
    setIsDeploying(true);
    setDeployingTo('cloudflare');

    try {
      if (onCloudflareDeploy) {
        await onCloudflareDeploy();
      } else {
        await handleCloudflareDeploy();
      }
    } finally {
      setIsDeploying(false);
      setDeployingTo(null);
    }
  };

  const handleOpenWebDeployClick = async () => {
    setIsDeploying(true);
    setDeployingTo('openweb');

    try {
      if (onOpenWebDeploy) {
        await onOpenWebDeploy();
      } else {
        await handleOpenWebDeploy();
      }
    } finally {
      setIsDeploying(false);
      setDeployingTo(null);
    }
  };

  return (
    <>
      <div className="flex border border-bolt-elements-borderColor rounded-md overflow-hidden text-sm">
        <DropdownMenu.Root>
          <DropdownMenu.Trigger
            disabled={isDeploying || !activePreview || isStreaming}
            className="rounded-md items-center justify-center [&:is(:disabled,.disabled)]:cursor-not-allowed [&:is(:disabled,.disabled)]:opacity-60 px-3 py-1.5 text-xs bg-accent-500 text-white hover:text-bolt-elements-item-contentAccent [&:not(:disabled,.disabled)]:hover:bg-bolt-elements-button-primary-backgroundHover outline-accent-500 flex gap-1.7"
          >
            {isDeploying ? `Deploying to ${deployingTo}...` : 'Deploy'}
            <span className={classNames('i-ph:caret-down transition-transform')} />
          </DropdownMenu.Trigger>
          <DropdownMenu.Content
            className={classNames(
              'z-[250]',
              'bg-bolt-elements-background-depth-2',
              'rounded-lg shadow-lg',
              'border border-bolt-elements-borderColor',
              'animate-in fade-in-0 zoom-in-95',
              'py-1',
            )}
            sideOffset={5}
            align="end"
          >
            <DropdownMenu.Item
              className={classNames(
                'cursor-pointer flex items-center w-full px-4 py-2 text-sm text-bolt-elements-textPrimary hover:bg-bolt-elements-item-backgroundActive gap-2 rounded-md group relative',
                {
                  'opacity-60 cursor-not-allowed': isDeploying || !activePreview,
                },
              )}
              disabled={isDeploying || !activePreview}
              onClick={handleOpenWebDeployClick}
            >
              <span className="i-ph:globe-hemisphere-west h-5 w-5 text-emerald-500" aria-hidden="true" />
              <span className="mx-auto">Deploy to OpenWeb.Software (FREE)</span>
            </DropdownMenu.Item>

            <DropdownMenu.Item
              className={classNames(
                'cursor-pointer flex items-center w-full px-4 py-2 text-sm text-bolt-elements-textPrimary hover:bg-bolt-elements-item-backgroundActive gap-2 rounded-md group relative',
                {
                  'opacity-60 cursor-not-allowed': isDeploying || !activePreview,
                },
              )}
              disabled={isDeploying || !activePreview}
              onClick={handleCloudflareDeployClick}
            >
              <span className="i-simple-icons:cloudflare h-5 w-5 text-orange-500" aria-hidden="true" />
              <span className="mx-auto">Deploy to Cloudflare</span>
            </DropdownMenu.Item>

            <DropdownMenu.Item
              className={classNames(
                'cursor-pointer flex items-center w-full px-4 py-2 text-sm text-bolt-elements-textPrimary hover:bg-bolt-elements-item-backgroundActive gap-2 rounded-md group relative',
                {
                  'opacity-60 cursor-not-allowed': isDeploying || !activePreview || !netlifyConn.user,
                },
              )}
              disabled={isDeploying || !activePreview || !netlifyConn.user}
              onClick={handleNetlifyDeployClick}
            >
              <span className="i-simple-icons:netlify h-5 w-5 text-cyan-500" aria-hidden="true" />
              <span className="mx-auto">
                {!netlifyConn.user ? 'No Netlify Account Connected' : 'Deploy to Netlify'}
              </span>
              {netlifyConn.user && <NetlifyDeploymentLink />}
            </DropdownMenu.Item>

            <DropdownMenu.Item
              className={classNames(
                'cursor-pointer flex items-center w-full px-4 py-2 text-sm text-bolt-elements-textPrimary hover:bg-bolt-elements-item-backgroundActive gap-2 rounded-md group relative',
                {
                  'opacity-60 cursor-not-allowed': isDeploying || !activePreview || !vercelConn.user,
                },
              )}
              disabled={isDeploying || !activePreview || !vercelConn.user}
              onClick={handleVercelDeployClick}
            >
              <span className="i-simple-icons:vercel h-5 w-5 text-bolt-elements-textPrimary" aria-hidden="true" />
              <span className="mx-auto">{!vercelConn.user ? 'No Vercel Account Connected' : 'Deploy to Vercel'}</span>
              {vercelConn.user && <VercelDeploymentLink />}
            </DropdownMenu.Item>

            <DropdownMenu.Item
              className={classNames(
                'cursor-pointer flex items-center w-full px-4 py-2 text-sm text-bolt-elements-textPrimary hover:bg-bolt-elements-item-backgroundActive gap-2 rounded-md group relative',
                {
                  'opacity-60 cursor-not-allowed': isDeploying || !activePreview,
                },
              )}
              disabled={isDeploying || !activePreview}
              onClick={handleGitHubDeployClick}
            >
              <span className="i-ph:github-logo h-5 w-5 text-bolt-elements-textPrimary" aria-hidden="true" />
              <span className="mx-auto">Deploy to GitHub</span>
            </DropdownMenu.Item>

            <DropdownMenu.Item
              className={classNames(
                'cursor-pointer flex items-center w-full px-4 py-2 text-sm text-bolt-elements-textPrimary hover:bg-bolt-elements-item-backgroundActive gap-2 rounded-md group relative',
                {
                  'opacity-60 cursor-not-allowed': isDeploying || !activePreview || !gitlabIsConnected,
                },
              )}
              disabled={isDeploying || !activePreview || !gitlabIsConnected}
              onClick={handleGitLabDeployClick}
            >
              <span className="i-simple-icons:gitlab h-5 w-5 text-orange-500" aria-hidden="true" />
              <span className="mx-auto">{!gitlabIsConnected ? 'No GitLab Account Connected' : 'Deploy to GitLab'}</span>
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      </div>

      {/* GitHub Deployment Dialog */}
      {showGitHubDeploymentDialog && githubDeploymentFiles ? (
        <Suspense fallback={null}>
          <LazyGitHubDeploymentDialog
            isOpen={showGitHubDeploymentDialog}
            onClose={() => setShowGitHubDeploymentDialog(false)}
            projectName={githubProjectName}
            files={githubDeploymentFiles}
          />
        </Suspense>
      ) : null}

      {/* GitLab Deployment Dialog */}
      {showGitLabDeploymentDialog && gitlabDeploymentFiles ? (
        <Suspense fallback={null}>
          <LazyGitLabDeploymentDialog
            isOpen={showGitLabDeploymentDialog}
            onClose={() => setShowGitLabDeploymentDialog(false)}
            projectName={gitlabProjectName}
            files={gitlabDeploymentFiles}
          />
        </Suspense>
      ) : null}
    </>
  );
};
