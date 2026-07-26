import { describe, expect, it } from 'vitest';
import {
  buildClientProfileAudienceLabel,
  buildClientProfilesCsv,
  filterClientProfiles,
  normalizeClientProfileFilters,
} from './client-profiles';
import type { ClientProfileRecord } from './admin-panel';

const profiles: ClientProfileRecord[] = [
  {
    id: '1',
    name: 'Alice',
    email: 'alice@example.com',
    company: 'OpenWeb',
    role: 'Founder',
    phone: null,
    country: 'South Africa',
    useCase: 'Clinic scheduler',
    requestedSubdomain: 'alice-trial',
    registrationSource: 'managed-instance:alpha1.bolt.gives',
    createdAt: '2026-04-18T09:00:00.000Z',
    updatedAt: '2026-04-18T09:00:00.000Z',
    lastInstanceSlug: 'alice-trial',
    lastInstanceStatus: 'active',
    lastInstanceUrl: 'https://alice-trial.pages.dev',
  },
  {
    id: '2',
    name: 'Bob',
    email: 'bob@example.com',
    company: 'Clinic AI',
    role: 'CTO',
    phone: null,
    country: 'Kenya',
    useCase: 'Scheduling and reminders',
    requestedSubdomain: 'bob-trial',
    registrationSource: 'managed-instance:create.bolt.gives',
    createdAt: '2026-04-18T10:00:00.000Z',
    updatedAt: '2026-04-18T10:00:00.000Z',
    lastInstanceSlug: null,
    lastInstanceStatus: null,
    lastInstanceUrl: null,
  },
];

describe('client profile helpers', () => {
  it('normalizes filter values from url search params', () => {
    const filters = normalizeClientProfileFilters(
      new URLSearchParams({
        search: ' alice ',
        company: 'OpenWeb',
        assignmentStatus: 'assigned',
      }),
    );

    expect(filters).toEqual({
      search: 'alice',
      company: 'OpenWeb',
      country: '',
      useCase: '',
      assignmentStatus: 'assigned',
    });
  });

  it('filters profiles by assignment and company', () => {
    const filtered = filterClientProfiles(profiles, {
      search: '',
      company: 'openweb',
      country: '',
      useCase: '',
      assignmentStatus: 'assigned',
    });

    expect(filtered).toHaveLength(1);
    expect(filtered[0].email).toBe('alice@example.com');
  });

  it('builds a csv export with stable columns', () => {
    const csv = buildClientProfilesCsv(profiles);

    expect(csv).toContain('name,email,company');
    expect(csv).toContain('alice@example.com');
    expect(csv).toContain('bob@example.com');
  });

  it('describes a filtered audience label', () => {
    expect(
      buildClientProfileAudienceLabel(
        {
          search: '',
          company: 'OpenWeb',
          country: 'South Africa',
          useCase: '',
          assignmentStatus: 'assigned',
        },
        3,
      ),
    ).toContain('3 recipients');
  });
});
