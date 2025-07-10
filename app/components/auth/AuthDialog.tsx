import { useState } from 'react';
import { useStore } from '@nanostores/react';
import { Dialog, DialogRoot } from '~/components/ui/Dialog';
import { Button } from '~/components/ui/Button';
import { Input } from '~/components/ui/Input';
import { Label } from '~/components/ui/Label';
import { authStore } from '~/lib/stores/auth';

interface AuthDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AuthDialog({ isOpen, onClose }: AuthDialogProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const isLoading = useStore(authStore.isLoading);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    if (mode === 'register') {
      if (formData.password !== formData.confirmPassword) {
        setErrors({ confirmPassword: 'Passwords do not match' });
        return;
      }

      if (!formData.email) {
        setErrors({ email: 'Email is required' });
        return;
      }
    }

    if (!formData.username || !formData.password) {
      setErrors({
        username: !formData.username ? 'Username is required' : '',
        password: !formData.password ? 'Password is required' : '',
      });
      return;
    }

    let result;

    if (mode === 'login') {
      result = await authStore.login(formData.username, formData.password);
    } else {
      result = await authStore.register(formData.username, formData.email, formData.password);
    }

    if (result.success) {
      onClose();
      setFormData({ username: '', email: '', password: '', confirmPassword: '' });
    } else {
      setErrors({ general: result.error || 'Authentication failed' });
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));

    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: '' }));
    }
  };

  return (
    <DialogRoot open={isOpen}>
      <Dialog onBackdrop={onClose} onClose={onClose}>
        <div className="p-6 w-full max-w-md">
          <h2 className="text-2xl font-bold mb-6 text-center">{mode === 'login' ? 'Sign In' : 'Create Account'}</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
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
                placeholder="Enter your username"
                className={errors.username ? 'border-red-500' : ''}
              />
              {errors.username && <p className="text-red-500 text-sm mt-1">{errors.username}</p>}
            </div>

            {mode === 'register' && (
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  placeholder="Enter your email"
                  className={errors.email ? 'border-red-500' : ''}
                />
                {errors.email && <p className="text-red-500 text-sm mt-1">{errors.email}</p>}
              </div>
            )}

            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={formData.password}
                onChange={(e) => handleInputChange('password', e.target.value)}
                placeholder="Enter your password"
                className={errors.password ? 'border-red-500' : ''}
              />
              {errors.password && <p className="text-red-500 text-sm mt-1">{errors.password}</p>}
            </div>

            {mode === 'register' && (
              <div>
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={formData.confirmPassword}
                  onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
                  placeholder="Confirm your password"
                  className={errors.confirmPassword ? 'border-red-500' : ''}
                />
                {errors.confirmPassword && <p className="text-red-500 text-sm mt-1">{errors.confirmPassword}</p>}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Create Account'}
            </Button>
          </form>

          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => {
                setMode(mode === 'login' ? 'register' : 'login');
                setErrors({});
                setFormData({ username: '', email: '', password: '', confirmPassword: '' });
              }}
              className="text-blue-600 hover:text-blue-800 text-sm"
            >
              {mode === 'login' ? "Don't have an account? Create one" : 'Already have an account? Sign in'}
            </button>
          </div>
        </div>
      </Dialog>
    </DialogRoot>
  );
}
