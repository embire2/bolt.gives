import { createContext, useContext } from 'react';
import { DEFAULT_PUBLIC_URL_CONFIG, type PublicUrlConfig } from './public-urls';

const PublicUrlConfigContext = createContext<PublicUrlConfig>(DEFAULT_PUBLIC_URL_CONFIG);

export function PublicUrlConfigProvider({ value, children }: { value: PublicUrlConfig; children: React.ReactNode }) {
  return <PublicUrlConfigContext.Provider value={value}>{children}</PublicUrlConfigContext.Provider>;
}

export function usePublicUrlConfig() {
  return useContext(PublicUrlConfigContext);
}
