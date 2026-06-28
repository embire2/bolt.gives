export type UpdatePolicy = 'optional' | 'mandatory';

export type ParsedUpdatePolicy = {
  policy: UpdatePolicy;
  features: string[];
};

const POLICY_RE =
  /^\s*(?:update\s+policy|policy|release\s+policy)\s*:\s*(mandatory|required|force|forced|optional|recommended)\s*$/im;
const FEATURE_SECTION_RE = /^\s*(?:changed|changes|what(?:'s| is)\s+new|new\s+features|features|highlights)\s*:?\s*$/i;
const STOP_SECTION_RE = /^\s*(?:validation|linux\s+install|install|notes|release\s+links|attached\s+asset)\s*:?\s*$/i;

function normalizePolicy(value: string | undefined | null): UpdatePolicy | null {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();

  if (['mandatory', 'required', 'force', 'forced'].includes(normalized)) {
    return 'mandatory';
  }

  if (['optional', 'recommended'].includes(normalized)) {
    return 'optional';
  }

  return null;
}

export function parseUpdatePolicyFromReleaseBody(
  body: string | undefined | null,
  envPolicy?: string | null,
): ParsedUpdatePolicy {
  const releaseBody = String(body || '');
  const policyMatch = releaseBody.match(POLICY_RE);
  const policy = normalizePolicy(envPolicy) || normalizePolicy(policyMatch?.[1]) || 'optional';

  return {
    policy,
    features: extractReleaseFeatures(releaseBody),
  };
}

export function extractReleaseFeatures(body: string | undefined | null): string[] {
  const lines = String(body || '').split(/\r?\n/);
  const features: string[] = [];
  let inFeatureSection = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      if (inFeatureSection && features.length > 0) {
        break;
      }

      continue;
    }

    if (FEATURE_SECTION_RE.test(line.replace(/^#+\s*/, ''))) {
      inFeatureSection = true;
      continue;
    }

    if (inFeatureSection && STOP_SECTION_RE.test(line.replace(/^#+\s*/, ''))) {
      break;
    }

    if (!inFeatureSection) {
      continue;
    }

    if (/^[-*]\s+/.test(line) || /^\d+\.\s+/.test(line)) {
      const bullet = line
        .replace(/^[-*]\s+/, '')
        .replace(/^\d+\.\s+/, '')
        .trim();

      if (bullet) {
        features.push(bullet);
      }
    }
  }

  if (features.length > 0) {
    return features.slice(0, 8);
  }

  return lines
    .map((line) => line.trim())
    .filter((line) => line && !POLICY_RE.test(line) && !line.startsWith('```') && !line.startsWith('#'))
    .slice(0, 5);
}

export function buildDismissedUpdateStorageKey(version: string | undefined | null): string {
  const normalized = String(version || 'unknown')
    .trim()
    .replace(/^v/i, '')
    .replace(/[^a-z0-9._-]+/gi, '-');

  return `bolt_update_dismissed_${normalized || 'unknown'}`;
}
