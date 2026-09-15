import { useEffect, useState } from 'react';
import { getApiKeysFromCookies, subscribeToApiKeyChanges } from '@bolt/agent/lib/runtime/api-key-storage';
import { useProfile } from '~/lib/profile-context';

export function useProfileApiKeys() {
  const profile = useProfile();
  const [apiKeys, setApiKeys] = useState(() => getApiKeysFromCookies(profile?.id));
  useEffect(() => {
    const refresh = () => setApiKeys(getApiKeysFromCookies(profile?.id));
    refresh();

    return subscribeToApiKeyChanges(refresh);
  }, [profile?.id]);

  return [apiKeys, setApiKeys] as const;
}
