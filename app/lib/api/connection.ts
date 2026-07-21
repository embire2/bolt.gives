export interface ConnectionStatus {
  connected: boolean;
  latency: number;
  lastChecked: string;
}

export const checkConnection = async (): Promise<ConnectionStatus> => {
  try {
    // Check if we have network connectivity
    const online = navigator.onLine;

    if (!online) {
      return {
        connected: false,
        latency: 0,
        lastChecked: new Date().toISOString(),
      };
    }

    const start = performance.now();
    const response = await fetch('/api/health', {
      method: 'HEAD',
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    const latency = Math.round(performance.now() - start);

    return {
      connected: response.ok,
      latency,
      lastChecked: new Date().toISOString(),
    };
  } catch {
    return {
      connected: false,
      latency: 0,
      lastChecked: new Date().toISOString(),
    };
  }
};
