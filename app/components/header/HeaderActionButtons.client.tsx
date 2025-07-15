import { useStore } from '@nanostores/react';
import { workbenchStore } from '~/lib/stores/workbench';
import { useState } from 'react';
import { streamingState } from '~/lib/stores/streaming';
import { ExportChatButton } from '~/components/chat/chatExportAndImport/ExportChatButton';
import { useChatHistory } from '~/lib/persistence';
import { DeployButton } from '~/components/deploy/DeployButton';
import { orchestrationStore } from '~/lib/stores/orchestration';
import { Button } from '~/components/ui/Button';

interface HeaderActionButtonsProps {
  chatStarted: boolean;
}

export function HeaderActionButtons({ chatStarted }: HeaderActionButtonsProps) {
  const [activePreviewIndex] = useState(0);
  const previews = useStore(workbenchStore.previews);
  const activePreview = previews[activePreviewIndex];
  const isStreaming = useStore(streamingState);
  const { exportChat } = useChatHistory();
  const orchestrationSession = useStore(orchestrationStore.currentSession);
  const showOrchestrationPanel = useStore(orchestrationStore.showPanel);

  const shouldShowButtons = !isStreaming && activePreview;

  const toggleOrchestration = () => {
    orchestrationStore.togglePanel();
  };

  return (
    <div className="flex items-center gap-2">
      {chatStarted && orchestrationSession && (
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleOrchestration}
          className={`${showOrchestrationPanel ? 'bg-bolt-elements-focus/10 text-bolt-elements-focus' : ''}`}
          title="Multi-Model Orchestration Panel"
        >
          <div className="i-ph:brain text-sm mr-1" />
          Orchestration
        </Button>
      )}
      {chatStarted && shouldShowButtons && <ExportChatButton exportChat={exportChat} />}
      {shouldShowButtons && <DeployButton />}
    </div>
  );
}
