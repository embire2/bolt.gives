import { useState } from 'react';
import { useStore } from '@nanostores/react';
import { Dialog, DialogRoot } from '~/components/ui/Dialog';
import { Button } from '~/components/ui/Button';
import { Input } from '~/components/ui/Input';
import { Label } from '~/components/ui/Label';
import { authStore } from '~/lib/stores/auth';

interface ProfileDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ProfileDialog({ isOpen, onClose }: ProfileDialogProps) {
  const user = useStore(authStore.user);
  const [formData, setFormData] = useState({
    username: user?.username || '',
    email: user?.email || '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));

    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: '' }));
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setLoading(true);

    try {
      /*
       * For now, just show a success message
       * In a real implementation, you'd call an API to update the profile
       */
      console.log('Profile update not yet implemented');
      onClose();
    } catch {
      setErrors({ general: 'Failed to update profile' });
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return null;
  }

  return (
    <DialogRoot open={isOpen}>
      <Dialog onBackdrop={onClose} onClose={onClose}>
        <div className="p-6 w-full max-w-md">
          <h2 className="text-2xl font-bold mb-6">Profile Settings</h2>

          <form onSubmit={handleSave} className="space-y-4">
            {errors.general && (
              <div className="text-red-500 text-sm text-center p-2 bg-red-50 rounded">{errors.general}</div>
            )}

            <div>
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                type="text"
                value={formData.username}
                onChange={(e) => handleInputChange('username', e.target.value)}
                disabled
                className="bg-gray-100"
              />
              <p className="text-xs text-gray-500 mt-1">Username cannot be changed</p>
            </div>

            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => handleInputChange('email', e.target.value)}
                disabled
                className="bg-gray-100"
              />
              <p className="text-xs text-gray-500 mt-1">Email cannot be changed</p>
            </div>

            <div className="pt-4 border-t">
              <h3 className="text-lg font-medium mb-3">Change Password</h3>

              <div className="space-y-3">
                <div>
                  <Label htmlFor="currentPassword">Current Password</Label>
                  <Input
                    id="currentPassword"
                    type="password"
                    value={formData.currentPassword}
                    onChange={(e) => handleInputChange('currentPassword', e.target.value)}
                    placeholder="Enter current password"
                    disabled
                  />
                </div>

                <div>
                  <Label htmlFor="newPassword">New Password</Label>
                  <Input
                    id="newPassword"
                    type="password"
                    value={formData.newPassword}
                    onChange={(e) => handleInputChange('newPassword', e.target.value)}
                    placeholder="Enter new password"
                    disabled
                  />
                </div>

                <div>
                  <Label htmlFor="confirmPassword">Confirm New Password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={formData.confirmPassword}
                    onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
                    placeholder="Confirm new password"
                    disabled
                  />
                </div>

                <p className="text-xs text-gray-500">Password change functionality not yet implemented</p>
              </div>
            </div>

            <div className="flex gap-2 pt-4">
              <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
                Cancel
              </Button>
              <Button type="submit" disabled={loading} className="flex-1">
                {loading ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </form>

          <div className="mt-6 pt-4 border-t">
            <div className="text-sm text-gray-600">
              <p>
                <strong>Account created:</strong> {new Date(user.createdAt).toLocaleDateString()}
              </p>
              {user.lastLogin && (
                <p>
                  <strong>Last login:</strong> {new Date(user.lastLogin).toLocaleDateString()}
                </p>
              )}
            </div>
          </div>
        </div>
      </Dialog>
    </DialogRoot>
  );
}
