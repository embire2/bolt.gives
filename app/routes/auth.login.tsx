import type { ActionFunctionArgs, LoaderFunctionArgs } from '@remix-run/node';
import { json, redirect } from '@remix-run/node';
import { Form, useActionData, useLoaderData } from '@remix-run/react';
import { useState } from 'react';
import { UserManager } from '~/lib/db/users.db';
import { getSession, commitSession } from '~/lib/auth/session.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const session = await getSession(request.headers.get('Cookie'));
  const userId = session.get('userId');

  if (userId) {
    // Already logged in, redirect to main app
    return redirect('/');
  }

  return json({
    error: session.get('error'),
    message: session.get('message'),
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const session = await getSession(request.headers.get('Cookie'));
  const formData = await request.formData();
  const username = formData.get('username') as string;
  const password = formData.get('password') as string;

  try {
    const result = await UserManager.authenticate(username, password);

    // Set session data
    session.set('userId', result.user.id);
    session.set('username', result.user.username);
    session.set('role', result.user.role);
    session.set('token', result.token);

    // Check if password change is required
    if (result.user.forcePasswordChange) {
      return redirect('/auth/change-password', {
        headers: {
          'Set-Cookie': await commitSession(session),
        },
      });
    }

    return redirect('/', {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    });
  } catch (error: any) {
    return json({ error: error.message }, { status: 400 });
  }
}

export default function LoginPage() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 to-gray-800">
      <div className="max-w-md w-full space-y-8 p-8 bg-gray-800 rounded-lg shadow-xl">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-white">Sign in to Bolt.gives</h2>
          <p className="mt-2 text-center text-sm text-gray-400">Enter your credentials to access your workspace</p>
        </div>

        <Form method="post" className="mt-8 space-y-6">
          {(actionData?.error || loaderData?.error) && (
            <div className="bg-red-500/10 border border-red-500 text-red-400 px-4 py-3 rounded">
              {actionData?.error || loaderData?.error}
            </div>
          )}

          {loaderData?.message && (
            <div className="bg-green-500/10 border border-green-500 text-green-400 px-4 py-3 rounded">
              {loaderData?.message}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-gray-300">
                Username or Email
              </label>
              <input
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                required
                className="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-white placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholder="Enter your username"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-300">
                Password
              </label>
              <div className="mt-1 relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  className="appearance-none relative block w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-white placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  placeholder="Enter your password"
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  <span className="text-gray-400 hover:text-gray-300">{showPassword ? '👁️' : '👁️‍🗨️'}</span>
                </button>
              </div>
            </div>
          </div>

          <div>
            <button
              type="submit"
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Sign in
            </button>
          </div>

          <div className="flex items-center justify-between">
            <a href="/auth/signup" className="text-sm text-blue-400 hover:text-blue-300">
              Create new account
            </a>
            <a href="/auth/forgot-password" className="text-sm text-gray-400 hover:text-gray-300">
              Forgot password?
            </a>
          </div>
        </Form>

        <div className="mt-6 text-center">
          <p className="text-xs text-gray-500">
            Default admin credentials: username: <code className="text-gray-400">admin</code>, password:{' '}
            <code className="text-gray-400">admin</code>
          </p>
        </div>
      </div>
    </div>
  );
}
