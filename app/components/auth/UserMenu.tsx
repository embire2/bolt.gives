import { useState } from 'react';
import { useStore } from '@nanostores/react';
import * as RadixPopover from '@radix-ui/react-popover';
import { Button } from '~/components/ui/Button';
import { authStore } from '~/lib/stores/auth';
import { ProfileDialog } from './ProfileDialog';

export function UserMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const user = useStore(authStore.user);
  const isAuthenticated = useStore(authStore.isAuthenticated);

  if (!isAuthenticated || !user) {
    return null;
  }

  const handleLogout = async () => {
    await authStore.logout();
    setIsOpen(false);
  };

  return (
    <>
      <RadixPopover.Root open={isOpen} onOpenChange={setIsOpen}>
        <RadixPopover.Trigger asChild>
          <Button variant="ghost" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white font-medium">
              {user.username.charAt(0).toUpperCase()}
            </div>
            <span className="hidden sm:inline-block">{user.username}</span>
          </Button>
        </RadixPopover.Trigger>

        <RadixPopover.Content className="w-64 p-4 bg-white dark:bg-gray-800 rounded-lg shadow-lg border" align="end">
          <div className="space-y-3">
            <div className="border-b pb-3">
              <p className="font-medium">{user.username}</p>
              <p className="text-sm text-gray-600">{user.email}</p>
            </div>

            <div className="space-y-2">
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start"
                onClick={() => {
                  setIsOpen(false);
                  setShowProfile(true);
                }}
              >
                Profile Settings
              </Button>
              <Button variant="ghost" size="sm" className="w-full justify-start" onClick={handleLogout}>
                Sign Out
              </Button>
            </div>
          </div>
        </RadixPopover.Content>
      </RadixPopover.Root>

      <ProfileDialog isOpen={showProfile} onClose={() => setShowProfile(false)} />
    </>
  );
}
