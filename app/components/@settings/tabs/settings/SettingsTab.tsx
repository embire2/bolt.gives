import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'react-toastify';
import { classNames } from '~/utils/classNames';
import { Switch } from '~/components/ui/Switch';
import type { UserProfile } from '~/components/@settings/core/types';
import { isMac } from '~/utils/os';
import {
  getModelOrchestratorSettings,
  setModelOrchestratorSettings,
  type ModelOrchestratorSettings,
} from '~/lib/runtime/model-orchestrator';

interface PerformanceThresholds {
  memoryMb: number;
  cpuPercent: number;
  tokenTotal: number;
}

const PERFORMANCE_THRESHOLD_KEY = 'bolt_performance_thresholds';

const getPerformanceThresholds = (): PerformanceThresholds => {
  const defaults: PerformanceThresholds = {
    memoryMb: 1200,
    cpuPercent: 80,
    tokenTotal: 25000,
  };

  if (typeof window === 'undefined') {
    return defaults;
  }

  try {
    const raw = window.localStorage.getItem(PERFORMANCE_THRESHOLD_KEY);

    if (!raw) {
      return defaults;
    }

    return { ...defaults, ...(JSON.parse(raw) as Partial<PerformanceThresholds>) };
  } catch {
    return defaults;
  }
};

// Helper to get modifier key symbols/text
const getModifierSymbol = (modifier: string): string => {
  switch (modifier) {
    case 'meta':
      return isMac ? '⌘' : 'Win';
    case 'alt':
      return isMac ? '⌥' : 'Alt';
    case 'shift':
      return '⇧';
    default:
      return modifier;
  }
};

export default function SettingsTab() {
  const [currentTimezone, setCurrentTimezone] = useState('');
  const [settings, setSettings] = useState<UserProfile>(() => {
    const saved = localStorage.getItem('bolt_user_profile');
    const defaults = {
      notifications: true,
      shoutboxEnabled: true,
      language: 'en',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };

    return saved ? { ...defaults, ...JSON.parse(saved) } : defaults;
  });
  const [modelOrchestrator, setModelOrchestrator] = useState<ModelOrchestratorSettings>(() =>
    getModelOrchestratorSettings(),
  );
  const [performanceThresholds, setPerformanceThresholds] = useState<PerformanceThresholds>(() =>
    getPerformanceThresholds(),
  );

  const [cloudEnvs, setCloudEnvs] = useState(() => {
    if (typeof window === 'undefined') {
      return {
        e2bEnabled: false,
        e2bApiKey: '',
        firecrawlEnabled: false,
        firecrawlApiKey: '',
        runtime: 'webcontainer',
      };
    }

    return {
      e2bEnabled: localStorage.getItem('bolt_e2b_enabled') === 'true',
      e2bApiKey: localStorage.getItem('bolt_e2b_api_key') || '',
      firecrawlEnabled: localStorage.getItem('bolt_firecrawl_enabled') === 'true',
      firecrawlApiKey: localStorage.getItem('bolt_firecrawl_api_key') || '',
      runtime: localStorage.getItem('bolt_runtime') || 'webcontainer',
    };
  });

  useEffect(() => {
    setCurrentTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, []);

  // Save settings automatically when they change
  useEffect(() => {
    try {
      const persistedSettings = JSON.parse(localStorage.getItem('settings') || '{}');

      // Get existing profile data
      const existingProfile = JSON.parse(localStorage.getItem('bolt_user_profile') || '{}');

      // Merge with new settings
      const updatedProfile = {
        ...existingProfile,
        notifications: settings.notifications,
        shoutboxEnabled: settings.shoutboxEnabled,
        language: settings.language,
        timezone: settings.timezone,
      };
      const nextSettings = {
        ...persistedSettings,
        notifications: settings.notifications,
        shoutboxEnabled: settings.shoutboxEnabled,
        language: settings.language,
        timezone: settings.timezone,
      };

      localStorage.setItem('bolt_user_profile', JSON.stringify(updatedProfile));
      localStorage.setItem('settings', JSON.stringify(nextSettings));
      window.dispatchEvent(new CustomEvent('bolt-settings-updated'));
      toast.success('Settings updated');
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error('Failed to update settings');
    }
  }, [settings]);

  return (
    <div className="space-y-4">
      {/* Language & Notifications */}
      <motion.div
        className="bg-white dark:bg-[#0A0A0A] rounded-lg shadow-sm dark:shadow-none p-4 space-y-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <div className="flex items-center gap-2 mb-4">
          <div className="i-ph:palette-fill w-4 h-4 text-red-500 dark:text-blue-400" />
          <span className="text-sm font-medium text-bolt-elements-textPrimary">Preferences</span>
        </div>

        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="i-ph:translate-fill w-4 h-4 text-bolt-elements-textSecondary" />
            <label className="block text-sm text-bolt-elements-textSecondary">Language</label>
          </div>
          <select
            value={settings.language}
            onChange={(e) => setSettings((prev) => ({ ...prev, language: e.target.value }))}
            className={classNames(
              'w-full px-3 py-2 rounded-lg text-sm',
              'bg-[#FAFAFA] dark:bg-[#0A0A0A]',
              'border border-[#E5E5E5] dark:border-[#1A1A1A]',
              'text-bolt-elements-textPrimary',
              'focus:outline-none focus:ring-2 focus:ring-red-500/30 dark:focus:ring-blue-500/30',
              'transition-all duration-200',
            )}
          >
            <option value="en">English</option>
            <option value="es">Español</option>
            <option value="fr">Français</option>
            <option value="de">Deutsch</option>
            <option value="it">Italiano</option>
            <option value="pt">Português</option>
            <option value="ru">Русский</option>
            <option value="zh">中文</option>
            <option value="ja">日本語</option>
            <option value="ko">한국어</option>
          </select>
        </div>

        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="i-ph:bell-fill w-4 h-4 text-bolt-elements-textSecondary" />
            <label className="block text-sm text-bolt-elements-textSecondary">Notifications</label>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-bolt-elements-textSecondary">
              {settings.notifications ? 'Notifications are enabled' : 'Notifications are disabled'}
            </span>
            <Switch
              checked={settings.notifications}
              onCheckedChange={(checked) => {
                // Update local state
                setSettings((prev) => ({ ...prev, notifications: checked }));

                // Update localStorage immediately
                const existingProfile = JSON.parse(localStorage.getItem('bolt_user_profile') || '{}');
                const updatedProfile = {
                  ...existingProfile,
                  notifications: checked,
                };
                localStorage.setItem('bolt_user_profile', JSON.stringify(updatedProfile));

                // Dispatch storage event for other components
                window.dispatchEvent(
                  new StorageEvent('storage', {
                    key: 'bolt_user_profile',
                    newValue: JSON.stringify(updatedProfile),
                  }),
                );

                toast.success(`Notifications ${checked ? 'enabled' : 'disabled'}`);
              }}
            />
          </div>
        </div>

        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="i-ph:chat-teardrop-text-fill w-4 h-4 text-bolt-elements-textSecondary" />
            <label className="block text-sm text-bolt-elements-textSecondary">Shout Out Box</label>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-bolt-elements-textSecondary">
              {settings.shoutboxEnabled
                ? 'Show cross-device shout-out messages in the header'
                : 'Hide the shout-out header icon and mute message polling'}
            </span>
            <Switch
              checked={settings.shoutboxEnabled}
              onCheckedChange={(checked) => {
                setSettings((prev) => ({ ...prev, shoutboxEnabled: checked }));

                const existingProfile = JSON.parse(localStorage.getItem('bolt_user_profile') || '{}');
                const existingSettings = JSON.parse(localStorage.getItem('settings') || '{}');
                localStorage.setItem(
                  'bolt_user_profile',
                  JSON.stringify({
                    ...existingProfile,
                    shoutboxEnabled: checked,
                  }),
                );
                localStorage.setItem(
                  'settings',
                  JSON.stringify({
                    ...existingSettings,
                    shoutboxEnabled: checked,
                  }),
                );
                window.dispatchEvent(new CustomEvent('bolt-settings-updated'));
                toast.success(`Shout Out Box ${checked ? 'enabled' : 'disabled'}`);
              }}
            />
          </div>
        </div>
      </motion.div>

      {/* Timezone */}
      <motion.div
        className="bg-white dark:bg-[#0A0A0A] rounded-lg shadow-sm dark:shadow-none p-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <div className="flex items-center gap-2 mb-4">
          <div className="i-ph:clock-fill w-4 h-4 text-red-500 dark:text-blue-400" />
          <span className="text-sm font-medium text-bolt-elements-textPrimary">Time Settings</span>
        </div>

        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="i-ph:globe-fill w-4 h-4 text-bolt-elements-textSecondary" />
            <label className="block text-sm text-bolt-elements-textSecondary">Timezone</label>
          </div>
          <select
            value={settings.timezone}
            onChange={(e) => setSettings((prev) => ({ ...prev, timezone: e.target.value }))}
            className={classNames(
              'w-full px-3 py-2 rounded-lg text-sm',
              'bg-[#FAFAFA] dark:bg-[#0A0A0A]',
              'border border-[#E5E5E5] dark:border-[#1A1A1A]',
              'text-bolt-elements-textPrimary',
              'focus:outline-none focus:ring-2 focus:ring-red-500/30 dark:focus:ring-blue-500/30',
              'transition-all duration-200',
            )}
          >
            <option value={currentTimezone}>{currentTimezone}</option>
          </select>
        </div>
      </motion.div>

      {/* Simplified Keyboard Shortcuts */}
      <motion.div
        className="bg-white dark:bg-[#0A0A0A] rounded-lg shadow-sm dark:shadow-none p-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <div className="flex items-center gap-2 mb-4">
          <div className="i-ph:keyboard-fill w-4 h-4 text-red-500 dark:text-blue-400" />
          <span className="text-sm font-medium text-bolt-elements-textPrimary">Keyboard Shortcuts</span>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between p-2 rounded-lg bg-[#FAFAFA] dark:bg-[#1A1A1A]">
            <div className="flex flex-col">
              <span className="text-sm text-bolt-elements-textPrimary">Toggle Theme</span>
              <span className="text-xs text-bolt-elements-textSecondary">Switch between light and dark mode</span>
            </div>
            <div className="flex items-center gap-1">
              <kbd className="px-2 py-1 text-xs font-semibold text-bolt-elements-textSecondary bg-white dark:bg-[#0A0A0A] border border-[#E5E5E5] dark:border-[#1A1A1A] rounded shadow-sm">
                {getModifierSymbol('meta')}
              </kbd>
              <kbd className="px-2 py-1 text-xs font-semibold text-bolt-elements-textSecondary bg-white dark:bg-[#0A0A0A] border border-[#E5E5E5] dark:border-[#1A1A1A] rounded shadow-sm">
                {getModifierSymbol('alt')}
              </kbd>
              <kbd className="px-2 py-1 text-xs font-semibold text-bolt-elements-textSecondary bg-white dark:bg-[#0A0A0A] border border-[#E5E5E5] dark:border-[#1A1A1A] rounded shadow-sm">
                {getModifierSymbol('shift')}
              </kbd>
              <kbd className="px-2 py-1 text-xs font-semibold text-bolt-elements-textSecondary bg-white dark:bg-[#0A0A0A] border border-[#E5E5E5] dark:border-[#1A1A1A] rounded shadow-sm">
                D
              </kbd>
            </div>
          </div>
        </div>
      </motion.div>

      <motion.div
        className="bg-white dark:bg-[#0A0A0A] rounded-lg shadow-sm dark:shadow-none p-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <div className="flex items-center gap-2 mb-4">
          <div className="i-ph:cpu-fill w-4 h-4 text-red-500 dark:text-blue-400" />
          <span className="text-sm font-medium text-bolt-elements-textPrimary">Model Orchestrator</span>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-bolt-elements-textSecondary">Enable automatic model selection</span>
            <Switch
              checked={modelOrchestrator.enabled}
              onCheckedChange={(enabled) => {
                const next = { ...modelOrchestrator, enabled };
                setModelOrchestrator(next);
                setModelOrchestratorSettings(next);
              }}
            />
          </div>

          <label className="block text-sm text-bolt-elements-textSecondary">
            Prompt token threshold for local models
            <input
              type="number"
              min={40}
              max={1000}
              value={modelOrchestrator.shortPromptTokenThreshold}
              onChange={(event) => {
                const shortPromptTokenThreshold = Number(event.target.value);
                const next = { ...modelOrchestrator, shortPromptTokenThreshold };
                setModelOrchestrator(next);
                setModelOrchestratorSettings(next);
              }}
              className={classNames(
                'mt-1 w-full rounded-lg border border-[#E5E5E5] dark:border-[#1A1A1A] bg-[#FAFAFA] dark:bg-[#0A0A0A] px-3 py-2 text-sm',
              )}
            />
          </label>
        </div>
      </motion.div>

      <motion.div
        className="bg-white dark:bg-[#0A0A0A] rounded-lg shadow-sm dark:shadow-none p-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.45 }}
      >
        <div className="flex items-center gap-2 mb-4">
          <div className="i-ph:gauge-fill w-4 h-4 text-red-500 dark:text-blue-400" />
          <span className="text-sm font-medium text-bolt-elements-textPrimary">Performance Thresholds</span>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <label className="text-sm text-bolt-elements-textSecondary">
            Memory (MB)
            <input
              type="number"
              value={performanceThresholds.memoryMb}
              onChange={(event) => {
                const next = { ...performanceThresholds, memoryMb: Number(event.target.value) };
                setPerformanceThresholds(next);
                localStorage.setItem(PERFORMANCE_THRESHOLD_KEY, JSON.stringify(next));
              }}
              className={classNames(
                'mt-1 w-full rounded-lg border border-[#E5E5E5] dark:border-[#1A1A1A] bg-[#FAFAFA] dark:bg-[#0A0A0A] px-3 py-2 text-sm',
              )}
            />
          </label>
          <label className="text-sm text-bolt-elements-textSecondary">
            CPU (%)
            <input
              type="number"
              value={performanceThresholds.cpuPercent}
              onChange={(event) => {
                const next = { ...performanceThresholds, cpuPercent: Number(event.target.value) };
                setPerformanceThresholds(next);
                localStorage.setItem(PERFORMANCE_THRESHOLD_KEY, JSON.stringify(next));
              }}
              className={classNames(
                'mt-1 w-full rounded-lg border border-[#E5E5E5] dark:border-[#1A1A1A] bg-[#FAFAFA] dark:bg-[#0A0A0A] px-3 py-2 text-sm',
              )}
            />
          </label>
          <label className="text-sm text-bolt-elements-textSecondary">
            Token budget
            <input
              type="number"
              value={performanceThresholds.tokenTotal}
              onChange={(event) => {
                const next = { ...performanceThresholds, tokenTotal: Number(event.target.value) };
                setPerformanceThresholds(next);
                localStorage.setItem(PERFORMANCE_THRESHOLD_KEY, JSON.stringify(next));
              }}
              className={classNames(
                'mt-1 w-full rounded-lg border border-[#E5E5E5] dark:border-[#1A1A1A] bg-[#FAFAFA] dark:bg-[#0A0A0A] px-3 py-2 text-sm',
              )}
            />
          </label>
        </div>
      </motion.div>

      {/* Cloud Environments (E2B & Firecrawl) */}
      <motion.div
        className="bg-white dark:bg-[#0A0A0A] rounded-lg shadow-sm dark:shadow-none p-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
      >
        <div className="flex items-center gap-2 mb-4">
          <div className="i-ph:cloud-fill w-4 h-4 text-red-500 dark:text-blue-400" />
          <span className="text-sm font-medium text-bolt-elements-textPrimary">Cloud Environments</span>
        </div>

        <div className="space-y-6">
          {/* Runtime Engine Selector */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="i-ph:cpu-fill w-4 h-4 text-bolt-elements-textSecondary" />
              <label className="block text-sm text-bolt-elements-textSecondary font-medium">Runtime Engine</label>
            </div>
            <select
              value={cloudEnvs.runtime}
              onChange={(e) => {
                const val = e.target.value;
                setCloudEnvs((prev) => ({ ...prev, runtime: val }));
                localStorage.setItem('bolt_runtime', val);
                toast.success(
                  `Runtime set to ${val === 'bolt-container' ? 'BoltContainer' : val === 'webcontainer' ? 'WebContainer' : val}. Reload to activate.`,
                );
              }}
              className={classNames(
                'w-full px-3 py-2 rounded-lg text-sm',
                'bg-[#FAFAFA] dark:bg-[#0A0A0A]',
                'border border-[#E5E5E5] dark:border-[#1A1A1A]',
                'text-bolt-elements-textPrimary',
                'focus:outline-none focus:ring-2 focus:ring-blue-500/30',
                'transition-all duration-200',
              )}
            >
              <option value="webcontainer">WebContainer (StackBlitz WASM — Default)</option>
              <option value="bolt-container">BoltContainer (Custom — In-Memory VFS + E2B)</option>
            </select>
            <p className="text-xs text-bolt-elements-textSecondary mt-1">
              BoltContainer uses an in-memory virtual filesystem with E2B cloud execution. Reload the page after
              changing.
            </p>
          </div>

          <hr className="border-[#E5E5E5] dark:border-[#1A1A1A]" />
          {/* E2B Sandbox */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-bolt-elements-textPrimary font-medium">
                E2B Sandbox (WebContainer Alternative)
              </span>
              <Switch
                checked={cloudEnvs.e2bEnabled}
                onCheckedChange={(enabled) => {
                  setCloudEnvs((prev) => ({ ...prev, e2bEnabled: enabled }));
                  localStorage.setItem('bolt_e2b_enabled', String(enabled));
                  toast.success(`E2B Sandbox ${enabled ? 'enabled' : 'disabled'}`);
                }}
              />
            </div>
            <label className="block text-sm text-bolt-elements-textSecondary">
              API Key (Requires page reload to take effect if turning on)
              <input
                type="password"
                placeholder="e2b_..."
                value={cloudEnvs.e2bApiKey}
                onChange={(event) => {
                  const val = event.target.value;
                  setCloudEnvs((prev) => ({ ...prev, e2bApiKey: val }));
                  localStorage.setItem('bolt_e2b_api_key', val);
                }}
                className={classNames(
                  'mt-1 w-full rounded-lg border border-[#E5E5E5] dark:border-[#1A1A1A] bg-[#FAFAFA] dark:bg-[#0A0A0A] px-3 py-2 text-sm text-bolt-elements-textPrimary',
                )}
              />
            </label>
          </div>

          <hr className="border-[#E5E5E5] dark:border-[#1A1A1A]" />

          {/* Firecrawl */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-bolt-elements-textPrimary font-medium">
                Firecrawl (Playwright Alternative)
              </span>
              <Switch
                checked={cloudEnvs.firecrawlEnabled}
                onCheckedChange={(enabled) => {
                  setCloudEnvs((prev) => ({ ...prev, firecrawlEnabled: enabled }));
                  localStorage.setItem('bolt_firecrawl_enabled', String(enabled));
                  toast.success(`Firecrawl ${enabled ? 'enabled' : 'disabled'}`);
                }}
              />
            </div>
            <label className="block text-sm text-bolt-elements-textSecondary">
              API Key (Requires page reload to take effect if turning on)
              <input
                type="password"
                placeholder="fc-..."
                value={cloudEnvs.firecrawlApiKey}
                onChange={(event) => {
                  const val = event.target.value;
                  setCloudEnvs((prev) => ({ ...prev, firecrawlApiKey: val }));
                  localStorage.setItem('bolt_firecrawl_api_key', val);
                }}
                className={classNames(
                  'mt-1 w-full rounded-lg border border-[#E5E5E5] dark:border-[#1A1A1A] bg-[#FAFAFA] dark:bg-[#0A0A0A] px-3 py-2 text-sm text-bolt-elements-textPrimary',
                )}
              />
            </label>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
