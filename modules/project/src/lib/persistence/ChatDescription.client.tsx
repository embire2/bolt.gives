import { useStore } from '@nanostores/react';
import { TooltipProvider } from '@radix-ui/react-tooltip';
import WithTooltip from '~/components/ui/Tooltip';
import { useEditChatDescription } from '@bolt/project/lib/hooks';
import { description as descriptionStore } from '@bolt/project/lib/persistence';

export function ChatDescription() {
  const initialDescription = useStore(descriptionStore)!;

  const { editing, handleChange, handleBlur, handleSubmit, handleKeyDown, currentDescription, toggleEditMode } =
    useEditChatDescription({
      initialDescription,
      syncWithGlobalStore: true,
    });

  if (!initialDescription) {
    // doing this to prevent showing edit button until chat description is set
    return null;
  }

  return (
    <div className="flex min-w-0 max-w-full items-center justify-center overflow-hidden">
      {editing ? (
        <form onSubmit={handleSubmit} className="flex min-w-0 max-w-full items-center justify-center">
          <input
            type="text"
            className="mr-2 min-w-0 max-w-full rounded bg-bolt-elements-background-depth-1 px-2 text-bolt-elements-textPrimary"
            autoFocus
            value={currentDescription}
            onChange={handleChange}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            style={{ width: `${Math.max(currentDescription.length * 8, 100)}px` }}
          />
          <TooltipProvider>
            <WithTooltip tooltip="Save title">
              <div className="flex justify-between items-center p-2 rounded-md bg-bolt-elements-item-backgroundAccent">
                <button
                  type="submit"
                  className="i-ph:check-bold scale-110 hover:text-bolt-elements-item-contentAccent"
                  onMouseDown={handleSubmit}
                />
              </div>
            </WithTooltip>
          </TooltipProvider>
        </form>
      ) : (
        <>
          <span className="min-w-0 truncate">{currentDescription}</span>
          <TooltipProvider>
            <WithTooltip tooltip="Rename chat">
              <button
                type="button"
                className="ml-2 i-ph:pencil-fill scale-110 hover:text-bolt-elements-item-contentAccent"
                onClick={(event) => {
                  event.preventDefault();
                  toggleEditMode();
                }}
              />
            </WithTooltip>
          </TooltipProvider>
        </>
      )}
    </div>
  );
}
