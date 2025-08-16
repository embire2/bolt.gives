import { useEffect } from 'react';
import { useNavigate } from '@remix-run/react';

interface AuthGuardProps {
  children: React.ReactNode;
  user?: {
    id: string;
    username: string;
    role: string;
  };
}

export function AuthGuard({ children, user }: AuthGuardProps) {
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) {
      navigate('/auth/login');
    }
  }, [user, navigate]);

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="text-white">Redirecting to login...</div>
      </div>
    );
  }

  return <>{children}</>;
}

export function UserHeader({ user }: { user: any }) {
  return (
    <div className="fixed top-0 right-0 z-50 p-4 flex items-center gap-4 bg-gray-900/80 backdrop-blur-sm rounded-bl-lg">
      <div className="text-right">
        <div className="text-sm text-white font-medium">{user.username}</div>
        <div className="text-xs text-gray-400">{user.role}</div>
      </div>
      <div className="flex gap-2">
        {user.role === 'admin' && (
          <a
            href="/admin/users"
            className="px-3 py-1 text-xs bg-purple-600 text-white rounded hover:bg-purple-700 transition"
          >
            Manage Users
          </a>
        )}
        <a
          href="/auth/logout"
          className="px-3 py-1 text-xs bg-gray-700 text-white rounded hover:bg-gray-600 transition"
        >
          Logout
        </a>
      </div>
    </div>
  );
}
