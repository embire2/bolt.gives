import { ExportChatButton } from '~/components/chat/chatExportAndImport/ExportChatButton';
import { useChatHistory } from '@bolt/project/lib/persistence';

export function WorkbenchExportButton() {
  const { exportChat } = useChatHistory({ loadPersistedChat: false });

  return <ExportChatButton exportChat={exportChat} />;
}
