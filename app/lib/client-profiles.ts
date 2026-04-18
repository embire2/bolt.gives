import type { ClientProfileRecord } from '~/lib/admin-panel';

export type ClientProfileFilters = {
  search: string;
  company: string;
  country: string;
  useCase: string;
  assignmentStatus: 'all' | 'assigned' | 'unassigned';
};

export const DEFAULT_CLIENT_PROFILE_FILTERS: ClientProfileFilters = {
  search: '',
  company: '',
  country: '',
  useCase: '',
  assignmentStatus: 'all',
};

function normalizeFilterValue(value: string | null | undefined) {
  return String(value || '').trim();
}

export function normalizeClientProfileFilters(input: URLSearchParams | Record<string, unknown>): ClientProfileFilters {
  const get = (key: string) => {
    if (input instanceof URLSearchParams) {
      return input.get(key);
    }

    return typeof input[key] === 'string' ? String(input[key]) : null;
  };

  const assignmentStatus = normalizeFilterValue(get('assignmentStatus'));

  return {
    search: normalizeFilterValue(get('search')),
    company: normalizeFilterValue(get('company')),
    country: normalizeFilterValue(get('country')),
    useCase: normalizeFilterValue(get('useCase')),
    assignmentStatus: assignmentStatus === 'assigned' || assignmentStatus === 'unassigned' ? assignmentStatus : 'all',
  };
}

export function filterClientProfiles(
  profiles: ClientProfileRecord[],
  filters: ClientProfileFilters = DEFAULT_CLIENT_PROFILE_FILTERS,
) {
  const normalizedSearch = filters.search.trim().toLowerCase();
  const normalizedCompany = filters.company.trim().toLowerCase();
  const normalizedCountry = filters.country.trim().toLowerCase();
  const normalizedUseCase = filters.useCase.trim().toLowerCase();

  return profiles.filter((profile) => {
    if (normalizedSearch) {
      const haystack = [
        profile.name,
        profile.email,
        profile.company,
        profile.role,
        profile.country,
        profile.useCase,
        profile.requestedSubdomain,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      if (!haystack.includes(normalizedSearch)) {
        return false;
      }
    }

    if (normalizedCompany && (profile.company || '').trim().toLowerCase() !== normalizedCompany) {
      return false;
    }

    if (normalizedCountry && (profile.country || '').trim().toLowerCase() !== normalizedCountry) {
      return false;
    }

    if (normalizedUseCase && !(profile.useCase || '').trim().toLowerCase().includes(normalizedUseCase)) {
      return false;
    }

    if (filters.assignmentStatus === 'assigned' && !profile.lastInstanceSlug) {
      return false;
    }

    if (filters.assignmentStatus === 'unassigned' && profile.lastInstanceSlug) {
      return false;
    }

    return true;
  });
}

function escapeCsvField(value: string | null | undefined) {
  const normalized = String(value || '');

  if (!/[",\n]/.test(normalized)) {
    return normalized;
  }

  return `"${normalized.replace(/"/g, '""')}"`;
}

export function buildClientProfilesCsv(profiles: ClientProfileRecord[]) {
  const header = [
    'name',
    'email',
    'company',
    'role',
    'phone',
    'country',
    'use_case',
    'requested_subdomain',
    'registration_source',
    'created_at',
    'updated_at',
    'last_instance_slug',
    'last_instance_status',
    'last_instance_url',
  ];

  const rows = profiles.map((profile) =>
    [
      profile.name,
      profile.email,
      profile.company,
      profile.role,
      profile.phone,
      profile.country,
      profile.useCase,
      profile.requestedSubdomain,
      profile.registrationSource,
      profile.createdAt,
      profile.updatedAt,
      profile.lastInstanceSlug,
      profile.lastInstanceStatus,
      profile.lastInstanceUrl,
    ]
      .map(escapeCsvField)
      .join(','),
  );

  return [header.join(','), ...rows].join('\n');
}

export function buildClientProfileAudienceLabel(filters: ClientProfileFilters, count: number) {
  const parts = [];

  if (filters.company) {
    parts.push(`company:${filters.company}`);
  }

  if (filters.country) {
    parts.push(`country:${filters.country}`);
  }

  if (filters.useCase) {
    parts.push(`use-case:${filters.useCase}`);
  }

  if (filters.assignmentStatus !== 'all') {
    parts.push(`assignment:${filters.assignmentStatus}`);
  }

  if (filters.search) {
    parts.push(`search:${filters.search}`);
  }

  return parts.length > 0
    ? `${parts.join(' · ')} · ${count} recipients`
    : `all registered clients · ${count} recipients`;
}
