import React, { useState, useEffect, useCallback } from 'react';
import { IconButton } from '~/components/ui/IconButton';
import type { ProviderInfo } from '@bolt/agent/types/model';
import { getApiKeysFromCookies, setApiKeysCookie } from '@bolt/agent/lib/runtime/api-key-storage';
import { useProfile } from '~/lib/profile-context';

interface APIKeyManagerProps {
  provider: ProviderInfo;
  apiKey: string;
  setApiKey: (key: string) => void;
  getApiKeyLink?: string;
  labelForGetApiKey?: string;
}

// cache which stores whether the provider's API key is set via environment variable
const providerEnvKeyStatusCache: Record<string, boolean> = {};

// eslint-disable-next-line @typescript-eslint/naming-convention
export const APIKeyManager: React.FC<APIKeyManagerProps> = ({ provider, apiKey, setApiKey }) => {
  const profile = useProfile();
  const [isEditing, setIsEditing] = useState(false);
  const [tempKey, setTempKey] = useState(apiKey);
  const [isEnvKeySet, setIsEnvKeySet] = useState(false);

  useEffect(() => {
    setTempKey(apiKey);

    if (!apiKey) {
      setIsEditing(false);
    }
  }, [apiKey]);

  // Reset states and load saved key when provider changes
  useEffect(() => {
    // Load saved API key from cookies for this provider
    const savedKeys = getApiKeysFromCookies(profile?.id);
    const savedKey = savedKeys[provider.name] || '';

    setTempKey(savedKey);
    setIsEditing(false);
  }, [provider.name, profile?.id]);

  const checkEnvApiKey = useCallback(async () => {
    // Check cache first
    if (providerEnvKeyStatusCache[provider.name] !== undefined) {
      setIsEnvKeySet(providerEnvKeyStatusCache[provider.name]);
      return;
    }

    try {
      const response = await fetch(`/api/check-env-key?provider=${encodeURIComponent(provider.name)}`);
      const data = await response.json();
      const isSet = (data as { isSet: boolean }).isSet;

      // Cache the result
      providerEnvKeyStatusCache[provider.name] = isSet;
      setIsEnvKeySet(isSet);
    } catch (error) {
      console.error('Failed to check environment API key:', error);
      setIsEnvKeySet(false);
    }
  }, [provider.name]);

  useEffect(() => {
    checkEnvApiKey();
  }, [checkEnvApiKey]);

  const handleSave = () => {
    const normalizedKey = tempKey.trim();

    // Save to parent state
    setApiKey(normalizedKey);

    // Save to cookies
    const currentKeys = getApiKeysFromCookies(profile?.id);
    const newKeys = { ...currentKeys, [provider.name]: normalizedKey };
    setApiKeysCookie(newKeys, 365, profile?.id);

    setIsEditing(false);
  };

  return (
    <div className="flex flex-wrap items-start justify-between gap-2 px-1 py-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-bolt-elements-textSecondary">{provider?.name} API Key:</span>
            {!isEditing && (
              <div className="flex items-center gap-2">
                {apiKey ? (
                  <>
                    <div className="i-ph:check-circle-fill text-green-500 w-4 h-4" />
                    <span className="text-xs text-green-500">Set via UI</span>
                  </>
                ) : isEnvKeySet ? (
                  <>
                    <div className="i-ph:check-circle-fill text-green-500 w-4 h-4" />
                    <span className="text-xs text-green-500">Set via environment variable</span>
                  </>
                ) : (
                  <>
                    <div className="i-ph:x-circle-fill text-red-500 w-4 h-4" />
                    <span className="text-xs text-red-500">Not Set (Please set via UI or ENV_VAR)</span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
        {provider.name === 'MagnetAPI' ? (
          <p className="max-w-xl text-xs leading-5 text-bolt-elements-textSecondary">
            Sign in to MagnetAPI, buy a plan, create a User API Key in its dashboard, then paste that key here. Your key
            is used only for requests you send with the MagnetAPI provider.
          </p>
        ) : null}
      </div>

      <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
        {isEditing ? (
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <input
              type="password"
              value={tempKey}
              placeholder="Enter API Key"
              onChange={(e) => setTempKey(e.target.value)}
              className="w-[min(300px,70vw)] sm:w-[300px] px-3 py-1.5 text-sm rounded border border-bolt-elements-borderColor 
                        bg-bolt-elements-prompt-background text-bolt-elements-textPrimary 
                        focus:outline-none focus:ring-2 focus:ring-bolt-elements-focus"
            />
            <IconButton
              onClick={handleSave}
              title="Save API Key"
              className="bg-green-500/10 hover:bg-green-500/20 text-green-500"
            >
              <div className="i-ph:check w-4 h-4" />
            </IconButton>
            <IconButton
              onClick={() => setIsEditing(false)}
              title="Cancel"
              className="bg-red-500/10 hover:bg-red-500/20 text-red-500"
            >
              <div className="i-ph:x w-4 h-4" />
            </IconButton>
          </div>
        ) : (
          <>
            {
              <IconButton
                onClick={() => setIsEditing(true)}
                title="Edit API Key"
                className="bg-blue-500/10 hover:bg-blue-500/20 text-blue-500"
              >
                <div className="i-ph:pencil-simple w-4 h-4" />
              </IconButton>
            }
            {provider?.getApiKeyLink && !apiKey && (
              <IconButton
                onClick={() => window.open(provider?.getApiKeyLink)}
                title="Get API Key"
                className="bg-blue-500/10 hover:bg-blue-500/20 text-blue-500 flex items-center gap-2"
              >
                <span className="text-xs whitespace-nowrap">{provider?.labelForGetApiKey || 'Get API Key'}</span>
                <div className={`${provider?.icon || 'i-ph:key'} w-4 h-4`} />
              </IconButton>
            )}
          </>
        )}
      </div>
    </div>
  );
};
