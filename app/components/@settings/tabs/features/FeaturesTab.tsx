// Remove unused imports
import React, { memo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Switch } from '~/components/ui/Switch';
import { useSettings } from '~/lib/hooks/useSettings';
import { classNames } from '~/utils/classNames';
import { toast } from 'react-toastify';
import { PromptLibrary } from '~/lib/common/prompt-library';
import { PluginManager, type PluginManifest } from '~/lib/services/pluginManager';
import { generateDeploymentFiles, type DeploymentProvider } from '~/lib/services/deploymentWizard';
import { workbenchStore } from '~/lib/stores/workbench';

interface FeatureToggle {
  id: string;
  title: string;
  description: string;
  icon: string;
  enabled: boolean;
  beta?: boolean;
  experimental?: boolean;
  tooltip?: string;
}

const FeatureCard = memo(
  ({
    feature,
    index,
    onToggle,
  }: {
    feature: FeatureToggle;
    index: number;
    onToggle: (id: string, enabled: boolean) => void;
  }) => (
    <motion.div
      key={feature.id}
      layoutId={feature.id}
      className={classNames(
        'relative group cursor-pointer',
        'bg-bolt-elements-background-depth-2',
        'hover:bg-bolt-elements-background-depth-3',
        'transition-colors duration-200',
        'rounded-lg overflow-hidden',
      )}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
    >
      <div className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={classNames(feature.icon, 'w-5 h-5 text-bolt-elements-textSecondary')} />
            <div className="flex items-center gap-2">
              <h4 className="font-medium text-bolt-elements-textPrimary">{feature.title}</h4>
              {feature.beta && (
                <span className="px-2 py-0.5 text-xs rounded-full bg-blue-500/10 text-blue-500 font-medium">Beta</span>
              )}
              {feature.experimental && (
                <span className="px-2 py-0.5 text-xs rounded-full bg-orange-500/10 text-orange-500 font-medium">
                  Experimental
                </span>
              )}
            </div>
          </div>
          <Switch checked={feature.enabled} onCheckedChange={(checked) => onToggle(feature.id, checked)} />
        </div>
        <p className="mt-2 text-sm text-bolt-elements-textSecondary">{feature.description}</p>
        {feature.tooltip && <p className="mt-1 text-xs text-bolt-elements-textTertiary">{feature.tooltip}</p>}
      </div>
    </motion.div>
  ),
);

const FeatureSection = memo(
  ({
    title,
    features,
    icon,
    description,
    onToggleFeature,
  }: {
    title: string;
    features: FeatureToggle[];
    icon: string;
    description: string;
    onToggleFeature: (id: string, enabled: boolean) => void;
  }) => (
    <motion.div
      layout
      className="flex flex-col gap-4"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="flex items-center gap-3">
        <div className={classNames(icon, 'text-xl text-purple-500')} />
        <div>
          <h3 className="text-lg font-medium text-bolt-elements-textPrimary">{title}</h3>
          <p className="text-sm text-bolt-elements-textSecondary">{description}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {features.map((feature, index) => (
          <FeatureCard key={feature.id} feature={feature} index={index} onToggle={onToggleFeature} />
        ))}
      </div>
    </motion.div>
  ),
);

export default function FeaturesTab() {
  const {
    autoSelectTemplate,
    isLatestBranch,
    contextOptimizationEnabled,
    eventLogs,
    setAutoSelectTemplate,
    enableLatestBranch,
    enableContextOptimization,
    setEventLogs,
    setPromptId,
    promptId,
  } = useSettings();
  const [installedPlugins, setInstalledPlugins] = React.useState<PluginManifest[]>(() => PluginManager.listInstalled());
  const [marketplacePlugins, setMarketplacePlugins] = React.useState<PluginManifest[]>([]);
  const [marketplaceLoading, setMarketplaceLoading] = React.useState(false);
  const [deploymentProvider, setDeploymentProvider] = React.useState<DeploymentProvider>('netlify');
  const [projectName, setProjectName] = React.useState('bolt-gives-app');
  const [buildCommand, setBuildCommand] = React.useState('pnpm run build');
  const [outputDirectory, setOutputDirectory] = React.useState('dist');
  const [rollbackProvider, setRollbackProvider] = React.useState<DeploymentProvider>('vercel');
  const [rollbackDeploymentId, setRollbackDeploymentId] = React.useState('');
  const [rollbackToken, setRollbackToken] = React.useState('');

  // Enable features by default on first load
  React.useEffect(() => {
    // Only set defaults if values are undefined
    if (isLatestBranch === undefined) {
      enableLatestBranch(false); // Default: OFF - Don't auto-update from main branch
    }

    if (contextOptimizationEnabled === undefined) {
      enableContextOptimization(true); // Default: ON - Enable context optimization
    }

    if (autoSelectTemplate === undefined) {
      setAutoSelectTemplate(true); // Default: ON - Enable auto-select templates
    }

    if (promptId === undefined) {
      setPromptId('default'); // Default: 'default'
    }

    if (eventLogs === undefined) {
      setEventLogs(true); // Default: ON - Enable event logging
    }
  }, []); // Only run once on component mount

  React.useEffect(() => {
    setMarketplaceLoading(true);
    PluginManager.fetchMarketplace()
      .then((plugins) => setMarketplacePlugins(plugins))
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : 'Failed to load marketplace');
      })
      .finally(() => setMarketplaceLoading(false));
  }, []);

  const handleToggleFeature = useCallback(
    (id: string, enabled: boolean) => {
      switch (id) {
        case 'latestBranch': {
          enableLatestBranch(enabled);
          toast.success(`Main branch updates ${enabled ? 'enabled' : 'disabled'}`);
          break;
        }

        case 'autoSelectTemplate': {
          setAutoSelectTemplate(enabled);
          toast.success(`Auto select template ${enabled ? 'enabled' : 'disabled'}`);
          break;
        }

        case 'contextOptimization': {
          enableContextOptimization(enabled);
          toast.success(`Context optimization ${enabled ? 'enabled' : 'disabled'}`);
          break;
        }

        case 'eventLogs': {
          setEventLogs(enabled);
          toast.success(`Event logging ${enabled ? 'enabled' : 'disabled'}`);
          break;
        }

        default:
          break;
      }
    },
    [enableLatestBranch, setAutoSelectTemplate, enableContextOptimization, setEventLogs],
  );

  const handleInstallPlugin = useCallback((plugin: PluginManifest) => {
    const next = PluginManager.install(plugin);
    setInstalledPlugins(next);
    toast.success(`Installed plugin: ${plugin.name}`);
  }, []);

  const handleUninstallPlugin = useCallback((pluginName: string) => {
    const next = PluginManager.uninstall(pluginName);
    setInstalledPlugins(next);
    toast.success(`Uninstalled plugin: ${pluginName}`);
  }, []);

  const handleGenerateDeploymentFiles = useCallback(async () => {
    try {
      const files = generateDeploymentFiles({
        provider: deploymentProvider,
        projectName,
        buildCommand,
        outputDirectory,
      });

      for (const file of files) {
        const path = `/home/project/${file.path}`;
        await workbenchStore.createFile(path, file.content);
        await workbenchStore.saveFile(path);
      }

      toast.success(`Deployment workflow generated for ${deploymentProvider}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to generate deployment workflow');
    }
  }, [deploymentProvider, projectName, buildCommand, outputDirectory]);

  const handleRollback = useCallback(async () => {
    try {
      const response = await fetch('/api/deployment/rollback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          provider: rollbackProvider,
          deploymentId: rollbackDeploymentId,
          token: rollbackToken,
        }),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      toast.success('Rollback request sent successfully');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Rollback failed');
    }
  }, [rollbackProvider, rollbackDeploymentId, rollbackToken]);

  const features = {
    stable: [
      {
        id: 'latestBranch',
        title: 'Main Branch Updates',
        description: 'Get the latest updates from the main branch',
        icon: 'i-ph:git-branch',
        enabled: isLatestBranch,
        tooltip: 'Enabled by default to receive updates from the main development branch',
      },
      {
        id: 'autoSelectTemplate',
        title: 'Auto Select Template',
        description: 'Automatically select starter template',
        icon: 'i-ph:selection',
        enabled: autoSelectTemplate,
        tooltip: 'Enabled by default to automatically select the most appropriate starter template',
      },
      {
        id: 'contextOptimization',
        title: 'Context Optimization',
        description: 'Optimize context for better responses',
        icon: 'i-ph:brain',
        enabled: contextOptimizationEnabled,
        tooltip: 'Enabled by default for improved AI responses',
      },
      {
        id: 'eventLogs',
        title: 'Event Logging',
        description: 'Enable detailed event logging and history',
        icon: 'i-ph:list-bullets',
        enabled: eventLogs,
        tooltip: 'Enabled by default to record detailed logs of system events and user actions',
      },
    ],
    beta: [],
  };

  return (
    <div className="flex flex-col gap-8">
      <FeatureSection
        title="Core Features"
        features={features.stable}
        icon="i-ph:check-circle"
        description="Essential features that are enabled by default for optimal performance"
        onToggleFeature={handleToggleFeature}
      />

      {features.beta.length > 0 && (
        <FeatureSection
          title="Beta Features"
          features={features.beta}
          icon="i-ph:test-tube"
          description="New features that are ready for testing but may have some rough edges"
          onToggleFeature={handleToggleFeature}
        />
      )}

      <motion.div
        layout
        className={classNames(
          'bg-bolt-elements-background-depth-2',
          'hover:bg-bolt-elements-background-depth-3',
          'transition-all duration-200',
          'rounded-lg p-4',
          'group',
        )}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <div className="flex items-center gap-4">
          <div
            className={classNames(
              'p-2 rounded-lg text-xl',
              'bg-bolt-elements-background-depth-3 group-hover:bg-bolt-elements-background-depth-4',
              'transition-colors duration-200',
              'text-purple-500',
            )}
          >
            <div className="i-ph:book" />
          </div>
          <div className="flex-1">
            <h4 className="text-sm font-medium text-bolt-elements-textPrimary group-hover:text-purple-500 transition-colors">
              Prompt Library
            </h4>
            <p className="text-xs text-bolt-elements-textSecondary mt-0.5">
              Choose a prompt from the library to use as the system prompt
            </p>
          </div>
          <select
            value={promptId}
            onChange={(e) => {
              setPromptId(e.target.value);
              toast.success('Prompt template updated');
            }}
            className={classNames(
              'p-2 rounded-lg text-sm min-w-[200px]',
              'bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor',
              'text-bolt-elements-textPrimary',
              'focus:outline-none focus:ring-2 focus:ring-purple-500/30',
              'group-hover:border-purple-500/30',
              'transition-all duration-200',
            )}
          >
            {PromptLibrary.getList().map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </select>
        </div>
      </motion.div>

      <motion.div
        layout
        className="rounded-lg bg-bolt-elements-background-depth-2 p-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
      >
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h4 className="text-sm font-medium text-bolt-elements-textPrimary">Deployment Wizard</h4>
            <p className="text-xs text-bolt-elements-textSecondary">
              Generate CI deployment config and trigger rollback requests.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="text-xs text-bolt-elements-textSecondary">
            Provider
            <select
              value={deploymentProvider}
              onChange={(event) => setDeploymentProvider(event.target.value as DeploymentProvider)}
              className="mt-1 w-full rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-3 p-2 text-sm"
            >
              <option value="netlify">Netlify</option>
              <option value="vercel">Vercel</option>
              <option value="github-pages">GitHub Pages</option>
            </select>
          </label>
          <label className="text-xs text-bolt-elements-textSecondary">
            Project Name
            <input
              value={projectName}
              onChange={(event) => setProjectName(event.target.value)}
              className="mt-1 w-full rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-3 p-2 text-sm"
            />
          </label>
          <label className="text-xs text-bolt-elements-textSecondary">
            Build Command
            <input
              value={buildCommand}
              onChange={(event) => setBuildCommand(event.target.value)}
              className="mt-1 w-full rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-3 p-2 text-sm"
            />
          </label>
          <label className="text-xs text-bolt-elements-textSecondary">
            Output Directory
            <input
              value={outputDirectory}
              onChange={(event) => setOutputDirectory(event.target.value)}
              className="mt-1 w-full rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-3 p-2 text-sm"
            />
          </label>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button
            className="rounded-lg bg-accent-500 px-3 py-2 text-xs text-white"
            onClick={() => {
              handleGenerateDeploymentFiles().catch(() => {
                // toast handled in callback
              });
            }}
          >
            Generate Deployment Files
          </button>
          <span className="text-xs text-bolt-elements-textTertiary">
            Files are written into `/home/project/.github/workflows`.
          </span>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-4">
          <select
            value={rollbackProvider}
            onChange={(event) => setRollbackProvider(event.target.value as DeploymentProvider)}
            className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-3 p-2 text-xs"
          >
            <option value="vercel">Vercel rollback</option>
            <option value="netlify">Netlify rollback</option>
          </select>
          <input
            value={rollbackDeploymentId}
            onChange={(event) => setRollbackDeploymentId(event.target.value)}
            placeholder="Deployment/Site ID"
            className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-3 p-2 text-xs"
          />
          <input
            value={rollbackToken}
            onChange={(event) => setRollbackToken(event.target.value)}
            placeholder="API token"
            className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-3 p-2 text-xs"
            type="password"
          />
          <button className="rounded-lg bg-bolt-elements-background-depth-3 px-3 py-2 text-xs" onClick={handleRollback}>
            Rollback
          </button>
        </div>
      </motion.div>

      <motion.div
        layout
        className="rounded-lg bg-bolt-elements-background-depth-2 p-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h4 className="text-sm font-medium text-bolt-elements-textPrimary">Plugin Marketplace</h4>
            <p className="text-xs text-bolt-elements-textSecondary">
              Install community plugins from a registry JSON index.
            </p>
          </div>
          <span className="text-xs text-bolt-elements-textTertiary">Installed: {installedPlugins.length}</span>
        </div>
        {marketplaceLoading ? (
          <div className="text-xs text-bolt-elements-textSecondary">Loading marketplace...</div>
        ) : (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {marketplacePlugins.map((plugin) => {
              const installed = installedPlugins.some((item) => item.name === plugin.name);

              return (
                <div
                  key={`${plugin.name}-${plugin.version}`}
                  className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-3 p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-medium text-bolt-elements-textPrimary">{plugin.name}</div>
                      <div className="text-xs text-bolt-elements-textSecondary">{plugin.description}</div>
                      <div className="text-[10px] text-bolt-elements-textTertiary">v{plugin.version}</div>
                    </div>
                    {installed ? (
                      <button
                        className="rounded bg-bolt-elements-background-depth-1 px-2 py-1 text-xs"
                        onClick={() => handleUninstallPlugin(plugin.name)}
                      >
                        Uninstall
                      </button>
                    ) : (
                      <button
                        className="rounded bg-accent-500 px-2 py-1 text-xs text-white"
                        onClick={() => handleInstallPlugin(plugin)}
                      >
                        Install
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </motion.div>
    </div>
  );
}
