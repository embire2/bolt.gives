import type { ActionFunctionArgs, LoaderFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { useLoaderData, useSubmit } from '@remix-run/react';
import { UserManager } from '~/lib/db/users.db';
import { requireAdmin } from '~/lib/auth/session.server';

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAdmin(request);

  const users = await UserManager.getAllUsers();
  const userCount = users.filter((u: any) => u.role === 'user').length;

  return json({ users, userCount });
}

export async function action({ request }: ActionFunctionArgs) {
  await requireAdmin(request);

  const formData = await request.formData();
  const action = formData.get('_action') as string;
  const userId = formData.get('userId') as string;

  try {
    switch (action) {
      case 'suspend':
        await UserManager.suspendUser(userId);
        break;
      case 'activate':
        await UserManager.activateUser(userId);
        break;
      case 'delete':
        await UserManager.deleteUser(userId);
        break;
      case 'makeAdmin':
        await UserManager.updateUserRole(userId, 'admin');
        break;
      case 'makeUser':
        await UserManager.updateUserRole(userId, 'user');
        break;
      default:
        return json({ error: 'Invalid action' }, { status: 400 });
    }

    return json({ success: true });
  } catch (error: any) {
    return json({ error: error.message }, { status: 400 });
  }
}

export default function AdminUsersPage() {
  const { users, userCount } = useLoaderData<typeof loader>();
  const submit = useSubmit();

  const handleAction = (action: string, userId: string, username: string) => {
    const confirmMessages: Record<string, string> = {
      delete: `Are you sure you want to delete user "${username}"? This action cannot be undone.`,
      suspend: `Are you sure you want to suspend user "${username}"?`,
      makeAdmin: `Are you sure you want to make "${username}" an admin?`,
    };

    if (confirmMessages[action]) {
      if (!window.confirm(confirmMessages[action])) {
        return;
      }
    }

    submit({ _action: action, userId }, { method: 'post' });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white">User Management</h1>
            <p className="text-gray-400 mt-2">
              {users.length} total users • {userCount}/5 regular users
            </p>
          </div>
          <div className="flex gap-4">
            <a href="/" className="px-4 py-2 bg-gray-700 text-white rounded-md hover:bg-gray-600 transition">
              ← Back to App
            </a>
            <a
              href="/auth/signup"
              className={`px-4 py-2 rounded-md transition ${
                userCount >= 5
                  ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
              {...(userCount >= 5 && { onClick: (e) => e.preventDefault() })}
            >
              + Add User
            </a>
          </div>
        </div>

        <div className="bg-gray-800 rounded-lg overflow-hidden shadow-xl">
          <table className="min-w-full divide-y divide-gray-700">
            <thead className="bg-gray-900">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">User</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Role</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Created
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Last Login
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-gray-800 divide-y divide-gray-700">
              {users.map((user: any) => (
                <tr key={user.id} className="hover:bg-gray-700/50 transition">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-white">{user.username}</div>
                      {user.email && <div className="text-sm text-gray-400">{user.email}</div>}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        user.role === 'admin' ? 'bg-purple-100 text-purple-800' : 'bg-green-100 text-green-800'
                      }`}
                    >
                      {user.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        user.status === 'active'
                          ? 'bg-green-100 text-green-800'
                          : user.status === 'suspended'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {user.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                    {new Date(user.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                    {user.last_login ? new Date(user.last_login).toLocaleDateString() : 'Never'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex gap-2">
                      {user.status === 'active' && user.username !== 'admin' && (
                        <button
                          onClick={() => handleAction('suspend', user.id, user.username)}
                          className="text-yellow-400 hover:text-yellow-300"
                        >
                          Suspend
                        </button>
                      )}
                      {user.status === 'suspended' && (
                        <button
                          onClick={() => handleAction('activate', user.id, user.username)}
                          className="text-green-400 hover:text-green-300"
                        >
                          Activate
                        </button>
                      )}
                      {user.role === 'user' && (
                        <button
                          onClick={() => handleAction('makeAdmin', user.id, user.username)}
                          className="text-purple-400 hover:text-purple-300"
                        >
                          Make Admin
                        </button>
                      )}
                      {user.role === 'admin' && user.username !== 'admin' && (
                        <button
                          onClick={() => handleAction('makeUser', user.id, user.username)}
                          className="text-blue-400 hover:text-blue-300"
                        >
                          Make User
                        </button>
                      )}
                      {user.username !== 'admin' && (
                        <button
                          onClick={() => handleAction('delete', user.id, user.username)}
                          className="text-red-400 hover:text-red-300"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-8 p-6 bg-gray-800 rounded-lg">
          <h2 className="text-xl font-semibold text-white mb-4">User Management Guidelines</h2>
          <ul className="space-y-2 text-gray-400">
            <li>• Maximum of 5 regular users allowed (excluding admin)</li>
            <li>• The default admin account cannot be deleted</li>
            <li>• Suspended users cannot log in but their data is preserved</li>
            <li>• Deleted users are soft-deleted and can be restored if needed</li>
            <li>• Each user has isolated chat sessions and history</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
