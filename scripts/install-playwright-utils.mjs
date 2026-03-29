export function shouldTreatInstallFailureAsFatal(env) {
  const raw = env.PLAYWRIGHT_INSTALL_REQUIRED;

  if (raw === undefined) {
    return false;
  }

  const normalized = String(raw).trim().toLowerCase();

  if (!normalized) {
    return false;
  }

  return !['0', 'false', 'no', 'off'].includes(normalized);
}
