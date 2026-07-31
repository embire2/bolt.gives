import { ExportChatButton } from '~/components/chat/chatExportAndImport/ExportChatButton';
import { useChatHistory } from '@bolt/project/lib/persistence';
import { useProfile } from '~/lib/profile-context';

export function WorkbenchExportButton() {
  const profile = useProfile();
  const { exportChat } = useChatHistory({ loadPersistedChat: false, ownerId: profile?.id ?? null });

  return <ExportChatButton exportChat={exportChat} />;
}
