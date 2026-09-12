export function formatProfileTimestamp(value: string | null) {
  if (!value) {
    return 'Recently';
  }

  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return 'Unavailable';
  }

  // Server and browser time zones can differ during hydration.
  return `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}
