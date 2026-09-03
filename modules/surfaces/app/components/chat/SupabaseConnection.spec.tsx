// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { projectDatabaseConnection } from '@bolt/project/lib/stores/project-database';

const runtimeMocks = vi.hoisted(() => ({
  fetchHostedProjectConnection: vi.fn(),
  saveHostedProjectConnection: vi.fn(),
  deleteHostedProjectConnection: vi.fn(),
}));

vi.mock('@bolt/runtime/lib/runtime/hosted-runtime-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@bolt/runtime/lib/runtime/hosted-runtime-client')>()),
  ...runtimeMocks,
}));
vi.mock('@bolt/project/lib/stores/workbench', () => ({
  workbenchStore: { hostedRuntimeSessionId: 'database-ui-session' },
}));
vi.mock('@bolt/project/lib/stores/supabase', () => ({ updateSupabaseConnection: vi.fn() }));
vi.mock('@bolt/project/lib/hooks/useSupabaseConnection', () => ({
  useSupabaseConnection: () => ({
    connection: { token: '', stats: undefined },
    connecting: false,
    fetchingStats: false,
    fetchingApiKeys: false,
    handleConnect: vi.fn(),
    selectProject: vi.fn(),
    handleCreateProject: vi.fn(),
    updateToken: vi.fn(),
    isConnected: false,
  }),
}));
vi.mock('react-toastify', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

let SupabaseConnection: (typeof import('./SupabaseConnection'))['SupabaseConnection'];

describe('project Database control', () => {
  beforeAll(async () => {
    (window as any).__vite_plugin_react_preamble_installed__ = true;
    SupabaseConnection = (await import('./SupabaseConnection')).SupabaseConnection;
  });

  beforeEach(() => {
    projectDatabaseConnection.set(null);
    runtimeMocks.fetchHostedProjectConnection.mockResolvedValue(null);
    runtimeMocks.saveHostedProjectConnection.mockReset();
    runtimeMocks.deleteHostedProjectConnection.mockReset();
  });

  afterEach(cleanup);

  it('quick-connects Supabase without requiring an account management token', async () => {
    runtimeMocks.saveHostedProjectConnection.mockResolvedValue({
      provider: 'supabase',
      status: 'connected',
      label: 'calendar',
      host: 'calendar.supabase.co',
      updatedAt: '2026-09-03T12:00:00.000Z',
    });
    render(<SupabaseConnection />);

    fireEvent.click(screen.getByRole('button', { name: 'Open database connection' }));
    fireEvent.change(screen.getByLabelText('Project URL'), {
      target: { value: 'https://calendar.supabase.co' },
    });
    fireEvent.change(screen.getByLabelText('Publishable or anon key'), {
      target: { value: 'public-anon-key-value' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Connect Supabase' }));

    await waitFor(() =>
      expect(runtimeMocks.saveHostedProjectConnection).toHaveBeenCalledWith('database-ui-session', {
        provider: 'supabase',
        supabaseUrl: 'https://calendar.supabase.co',
        anonKey: 'public-anon-key-value',
      }),
    );
    expect(screen.getByRole('button', { name: 'Open database connection' }).textContent).toContain('calendar');
  });

  it('verifies a user-owned PostgreSQL URL through the hosted runtime', async () => {
    runtimeMocks.saveHostedProjectConnection.mockResolvedValue({
      provider: 'postgresql',
      status: 'connected',
      label: 'app@db.example.com',
      host: 'db.example.com',
      databaseName: 'app',
      updatedAt: '2026-09-03T12:00:00.000Z',
    });
    render(<SupabaseConnection />);

    fireEvent.click(screen.getByRole('button', { name: 'Open database connection' }));
    fireEvent.click(screen.getByRole('button', { name: 'PostgreSQL' }));
    fireEvent.change(screen.getByLabelText('Connection string'), {
      target: { value: 'postgresql://user:private@db.example.com/app?sslmode=require' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Verify and connect' }));

    await waitFor(() =>
      expect(runtimeMocks.saveHostedProjectConnection).toHaveBeenCalledWith('database-ui-session', {
        provider: 'postgresql',
        databaseUrl: 'postgresql://user:private@db.example.com/app?sslmode=require',
      }),
    );
  });
});
