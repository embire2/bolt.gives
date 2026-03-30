import { create } from 'zustand';
import type { MCPConfig, MCPServerTools } from '~/lib/services/mcpService';

const MCP_SETTINGS_KEY = 'mcp_settings';
const isBrowser = typeof window !== 'undefined';
const MCP_INIT_TIMEOUT = 10000;
const MCP_MAX_RETRIES = 3;

type MCPSettings = {
  mcpConfig: MCPConfig;
  maxLLMSteps: number;
};

const defaultSettings = {
  maxLLMSteps: 5,
  mcpConfig: {
    mcpServers: {},
  },
} satisfies MCPSettings;

type Store = {
  isInitialized: boolean;
  isInitializing: boolean;
  settings: MCPSettings;
  serverTools: MCPServerTools;
  error: string | null;
  isUpdatingConfig: boolean;
  initializeError: string | null;
};

type Actions = {
  initialize: () => Promise<void>;
  updateSettings: (settings: MCPSettings) => Promise<void>;
  checkServersAvailabilities: () => Promise<void>;
  clearError: () => void;
};

export const useMCPStore = create<Store & Actions>((set, get) => ({
  isInitialized: false,
  isInitializing: false,
  settings: defaultSettings,
  serverTools: {},
  error: null,
  isUpdatingConfig: false,
  initializeError: null,
  clearError: () => set(() => ({ initializeError: null })),
  initialize: async () => {
    const state = get();

    if (state.isInitialized || state.isInitializing) {
      return;
    }

    if (state.initializeError) {
      console.warn('MCP initialization previously failed, skipping retry:', state.initializeError);
      return;
    }

    set(() => ({ isInitializing: true }));

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MCP_MAX_RETRIES; attempt++) {
      try {
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('MCP initialization timeout')), MCP_INIT_TIMEOUT);
        });

        if (isBrowser) {
          const savedConfig = localStorage.getItem(MCP_SETTINGS_KEY);

          if (savedConfig) {
            try {
              const settings = JSON.parse(savedConfig) as MCPSettings;

              const updatePromise = updateServerConfigWithTimeout(settings.mcpConfig, MCP_INIT_TIMEOUT);

              const serverTools = await Promise.race([updatePromise, timeoutPromise]);
              set(() => ({ settings, serverTools }));
            } catch (error) {
              console.error('Error parsing saved mcp config:', error);
              const errorMessage = error instanceof Error ? error.message : String(error);
              lastError = new Error(errorMessage);
              set(() => ({
                error: `Error parsing saved mcp config: ${errorMessage}`,
              }));
            }
          } else {
            localStorage.setItem(MCP_SETTINGS_KEY, JSON.stringify(defaultSettings));
          }
        }

        set(() => ({ isInitialized: true, isInitializing: false, initializeError: null }));
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.warn(`MCP initialization attempt ${attempt}/${MCP_MAX_RETRIES} failed:`, lastError.message);

        if (attempt < MCP_MAX_RETRIES) {
          const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
        }
      }
    }

    const finalError = lastError?.message || 'MCP initialization failed';
    set(() => ({
      isInitialized: true,
      isInitializing: false,
      initializeError: finalError,
    }));
    console.error('MCP initialization failed after max retries:', finalError);
  },
  updateSettings: async (newSettings: MCPSettings) => {
    if (get().isUpdatingConfig) {
      return;
    }

    try {
      set(() => ({ isUpdatingConfig: true }));

      const serverTools = await updateServerConfig(newSettings.mcpConfig);

      if (isBrowser) {
        localStorage.setItem(MCP_SETTINGS_KEY, JSON.stringify(newSettings));
      }

      set(() => ({ settings: newSettings, serverTools }));
    } catch (error) {
      throw error;
    } finally {
      set(() => ({ isUpdatingConfig: false }));
    }
  },
  checkServersAvailabilities: async () => {
    const response = await fetch('/api/mcp-check', {
      method: 'GET',
    });

    if (!response.ok) {
      throw new Error(`Server responded with ${response.status}: ${response.statusText}`);
    }

    const serverTools = (await response.json()) as MCPServerTools;

    set(() => ({ serverTools }));
  },
}));

async function updateServerConfig(config: MCPConfig) {
  const response = await fetch('/api/mcp-update-config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });

  if (!response.ok) {
    throw new Error(`Server responded with ${response.status}: ${response.statusText}`);
  }

  const data = (await response.json()) as MCPServerTools;

  return data;
}

async function updateServerConfigWithTimeout(config: MCPConfig, timeoutMs: number): Promise<MCPServerTools> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch('/api/mcp-update-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Server responded with ${response.status}: ${response.statusText}`);
    }

    const data = (await response.json()) as MCPServerTools;
    return data;
  } finally {
    clearTimeout(timeoutId);
  }
}
