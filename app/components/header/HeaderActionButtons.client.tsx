import { useStore } from '@nanostores/react';
import { workbenchStore } from '~/lib/stores/workbench';
import { useState } from 'react';
import { streamingState } from '~/lib/stores/streaming';
import { ExportChatButton } from '~/components/chat/chatExportAndImport/ExportChatButton';
import { useChatHistory } from '~/lib/persistence';
import { DeployButton } from '~/components/deploy/DeployButton';

/*
 * import { orchestrationStore } from '~/lib/stores/orchestration';
 * import { Button } from '~/components/ui/Button';
 */

interface HeaderActionButtonsProps {
  chatStarted: boolean;
}

export function HeaderActionButtons({ chatStarted }: HeaderActionButtonsProps) {
  const [activePreviewIndex] = useState(0);
  const previews = useStore(workbenchStore.previews);
  const activePreview = previews[activePreviewIndex];
  const isStreaming = useStore(streamingState);
  const { exportChat } = useChatHistory();

  // const orchestrationState = useStore(orchestrationStore.state);

  const shouldShowButtons = !isStreaming && activePreview;

  /*
   * const toggleOrchestration = () => {
   *   orchestrationStore.setVisible(!orchestrationState.isVisible);
   * };
   */

  return (
    <div className="flex items-center gap-2">
      {/* Orchestration button temporarily disabled pending type fixes */}
      {/* {chatStarted && (
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleOrchestration}
          className={`${orchestrationState.isVisible ? 'bg-bolt-elements-focus/10 text-bolt-elements-focus' : ''}`}
          title="Multi-Model Orchestration"
        >
          <div className="i-ph:brain text-sm mr-1" />
          Orchestration
        </Button>
      )} */}
      {chatStarted && shouldShowButtons && <ExportChatButton exportChat={exportChat} />}
      {shouldShowButtons && <DeployButton />}
    </div>
  );
}
