import React, { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { motion } from 'framer-motion';
import { toast } from 'react-toastify';
import { Button } from '~/components/ui/Button';
import { githubConnectionStore } from '~/lib/stores/githubConnection';

interface AuthDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AuthDialog({ isOpen, onClose }: AuthDialogProps) {
  const [token, setToken] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [tokenType, setTokenType] = useState<'classic' | 'fine-grained'>('classic');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!token.trim()) {
      toast.error('Please enter a valid GitHub token');
      return;
    }

    setIsSubmitting(true);

    try {
      await githubConnectionStore.connect(token.trim(), tokenType);
      toast.success('Successfully connected to GitHub!');
      onClose();
      setToken('');
    } catch (error) {
      console.error('GitHub connection failed:', error);
      toast.error(`Failed to connect to GitHub: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      setToken('');
      onClose();
    }
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={handleClose}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <Dialog.Content asChild>
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-bolt-elements-background-depth-1 rounded-lg border border-bolt-elements-borderColor shadow-xl z-50"
          >
            <div className="p-6">
              <Dialog.Title className="text-lg font-semibold text-bolt-elements-textPrimary mb-4">
                Connect to GitHub
              </Dialog.Title>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-bolt-elements-textPrimary mb-2">Token Type</label>
                  <div className="flex gap-2">
                    <label className="flex items-center">
                      <input
                        type="radio"
                        value="classic"
                        checked={tokenType === 'classic'}
                        onChange={(e) => setTokenType(e.target.value as 'classic')}
                        className="mr-2"
                      />
                      <span className="text-sm text-bolt-elements-textSecondary">Classic Token</span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="radio"
                        value="fine-grained"
                        checked={tokenType === 'fine-grained'}
                        onChange={(e) => setTokenType(e.target.value as 'fine-grained')}
                        className="mr-2"
                      />
                      <span className="text-sm text-bolt-elements-textSecondary">Fine-grained Token</span>
                    </label>
                  </div>
                </div>

                <div>
                  <label htmlFor="token" className="block text-sm font-medium text-bolt-elements-textPrimary mb-2">
                    GitHub Personal Access Token
                  </label>
                  <input
                    id="token"
                    type="password"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    className="w-full px-3 py-2 bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-md text-bolt-elements-textPrimary placeholder-bolt-elements-textTertiary focus:outline-none focus:ring-1 focus:ring-bolt-elements-borderColorActive"
                    disabled={isSubmitting}
                    autoComplete="off"
                  />
                </div>

                <div className="bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-md p-4">
                  <div className="flex items-start gap-3">
                    <div className="i-ph:info w-5 h-5 text-bolt-elements-icon-info mt-0.5 flex-shrink-0" />
                    <div className="text-sm text-bolt-elements-textSecondary space-y-2">
                      <p>To create a GitHub Personal Access Token:</p>
                      <ol className="list-decimal list-inside space-y-1 text-xs">
                        <li>Go to GitHub Settings → Developer settings → Personal access tokens</li>
                        <li>Click "Generate new token"</li>
                        <li>Select appropriate scopes (repo, user, etc.)</li>
                        <li>Copy and paste the token here</li>
                      </ol>
                      <p className="text-xs">
                        <a
                          href="https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-bolt-elements-textAccent hover:underline"
                        >
                          Learn more about creating tokens →
                        </a>
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleClose}
                    disabled={isSubmitting}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={!token.trim() || isSubmitting} className="flex-1">
                    {isSubmitting ? 'Connecting...' : 'Connect'}
                  </Button>
                </div>
              </form>
            </div>
          </motion.div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
