import { ExportChatButton } from '~/components/chat/chatExportAndImport/ExportChatButton';
import { useChatHistory } from '~/lib/persistence';

export function WorkbenchExportButton() {
  const { exportChat } = useChatHistory();

  return <ExportChatButton exportChat={exportChat} />;
}
