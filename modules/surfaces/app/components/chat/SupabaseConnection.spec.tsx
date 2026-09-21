// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { projectDatabaseConnection } from '@bolt/project/lib/stores/project-database';

const runtimeMocks = vi.hoisted(() => ({
  fetchHostedProjectConnection: vi.fn(),
  saveHostedProjectConnection: vi.fn(),
  deleteHostedProjectConnection: vi.fn(),
  useProfile: vi.fn(),
}));

vi.mock('~/lib/profile-context', () => ({ useProfile: runtimeMocks.useProfile }));
vi.mock('@bolt/runtime/lib/runtime/hosted-runtime-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@bolt/runtime/lib/runtime/hosted-runtime-client')>()),
  ...runtimeMocks,
}));
vi.mock('@bolt/project/lib/stores/workbench', () => ({
  workbenchStore: { hostedRuntimeSessionId: 'database-ui-session' },
}));
vi.mock('@bolt/project/lib/stores/supabase', () => ({ updateSupabaseConnection: vi.fn() }));
vi.mock('react-toastify', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

let SupabaseConnection: (typeof import('./SupabaseConnection'))['SupabaseConnection'];

describe('Supabase setup wizard', () => {
  beforeAll(async () => {
    (window as any).__vite_plugin_react_preamble_installed__ = true;
    SupabaseConnection = (await import('./SupabaseConnection')).SupabaseConnection;
  });

  beforeEach(() => {
    runtimeMocks.useProfile.mockReturnValue({ id: 'profile-fixture' });
    runtimeMocks.fetchHostedProjectConnection.mockReset();
    runtimeMocks.fetchHostedProjectConnection.mockResolvedValue(null);
    runtimeMocks.saveHostedProjectConnection.mockReset();
    runtimeMocks.deleteHostedProjectConnection.mockReset();
    projectDatabaseConnection.set(null);
  });

  afterEach(cleanup);

  it('does not issue an unauthorized connection lookup before profile login', () => {
    runtimeMocks.useProfile.mockReturnValue(null);
    render(<SupabaseConnection />);
    expect(runtimeMocks.fetchHostedProjectConnection).not.toHaveBeenCalled();
  });

  it('offers Supabase registration in a new tab without a PostgreSQL option', () => {
    render(<SupabaseConnection />);
    fireEvent.click(screen.getByRole('button', { name: 'Open database connection' }));

    const registration = screen.getByRole('link', { name: 'Register Supabase for Free' });
    expect(registration.getAttribute('href')).toBe('https://supabase.com/dashboard/sign-up');
    expect(registration.getAttribute('target')).toBe('_blank');
    expect(screen.queryByText('PostgreSQL')).toBeNull();
  });

  it('verifies and saves a user-owned Supabase project', async () => {
    runtimeMocks.saveHostedProjectConnection.mockResolvedValue({
      provider: 'supabase',
      status: 'verified',
      label: 'calendar',
      host: 'calendar.supabase.co',
      updatedAt: '2026-09-21T12:00:00.000Z',
      verifiedAt: '2026-09-21T12:00:00.000Z',
    });
    render(<SupabaseConnection />);

    fireEvent.click(screen.getByRole('button', { name: 'Open database connection' }));
    fireEvent.click(screen.getByRole('button', { name: 'I have a Supabase account' }));
    fireEvent.change(screen.getByLabelText('Project URL'), { target: { value: 'https://calendar.supabase.co' } });
    fireEvent.change(screen.getByLabelText('Publishable or anon key'), {
      target: { value: 'public-anon-key-value' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Verify and connect' }));

    await waitFor(() =>
      expect(runtimeMocks.saveHostedProjectConnection).toHaveBeenCalledWith('database-ui-session', {
        provider: 'supabase',
        supabaseUrl: 'https://calendar.supabase.co',
        anonKey: 'public-anon-key-value',
      }),
    );
    expect(await screen.findByText('Step 3: Supabase is verified')).toBeTruthy();
  });

  it('preserves a legacy connection when Supabase replacement fails', async () => {
    runtimeMocks.fetchHostedProjectConnection.mockResolvedValue({
      provider: 'postgresql',
      status: 'verified',
      label: 'legacy@database.example',
      host: 'database.example',
      updatedAt: '2026-09-20T12:00:00.000Z',
    });
    runtimeMocks.saveHostedProjectConnection.mockRejectedValue(new Error('Supabase rejected the publishable key.'));
    render(<SupabaseConnection />);

    fireEvent.click(screen.getByRole('button', { name: 'Open database connection' }));
    expect(await screen.findByText('Legacy database connected')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Move to Supabase' }));
    fireEvent.change(screen.getByLabelText('Project URL'), { target: { value: 'https://calendar.supabase.co' } });
    fireEvent.change(screen.getByLabelText('Publishable or anon key'), { target: { value: 'invalid-public-key' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify and connect' }));

    await waitFor(() => expect(runtimeMocks.saveHostedProjectConnection).toHaveBeenCalledOnce());
    expect(projectDatabaseConnection.get()?.provider).toBe('postgresql');
  });
});
