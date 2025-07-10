import { useStore } from '@nanostores/react';
import { authStore } from '~/lib/stores/auth';

interface AuthGuardProps {
  children: React.ReactNode;
  _fallback?: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const isAuthenticated = useStore(authStore.isAuthenticated);
  const isLoading = useStore(authStore.isLoading);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  /*
   * For now, allow access without authentication
   * Users can optionally sign in via the header
   */
  if (!isAuthenticated) {
    // Don't block access, just show the app
    return <>{children}</>;
  }

  return <>{children}</>;
}
