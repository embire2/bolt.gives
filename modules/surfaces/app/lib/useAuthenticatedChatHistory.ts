import { useChatHistory } from '@bolt/project/lib/persistence';
import { useProfile } from '~/lib/profile-context';

export function useAuthenticatedChatHistory() {
  const profile = useProfile();

  return useChatHistory({ ownerId: profile?.id ?? null });
}
