import { useCallback } from 'react';
import { UserManager } from '~/lib/db/users.db';

export function useUserChat(userId: string | null) {
  // Save chat to user's isolated storage
  const saveChat = useCallback(
    async (chatId: string, title: string, messages: any[]) => {
      if (!userId) {
        return;
      }

      try {
        await UserManager.saveChatSession(userId, chatId, title, messages);
      } catch (error) {
        console.error('Failed to save chat session:', error);
      }
    },
    [userId],
  );

  // Load user's chat sessions
  const loadUserChats = useCallback(async () => {
    if (!userId) {
      return [];
    }

    try {
      return await UserManager.getUserChatSessions(userId);
    } catch (error) {
      console.error('Failed to load chat sessions:', error);
      return [];
    }
  }, [userId]);

  // Load specific chat
  const loadChat = useCallback(
    async (chatId: string) => {
      if (!userId) {
        return null;
      }

      try {
        return await UserManager.getChatSession(userId, chatId);
      } catch (error) {
        console.error('Failed to load chat:', error);
        return null;
      }
    },
    [userId],
  );

  return {
    saveChat,
    loadUserChats,
    loadChat,
  };
}
