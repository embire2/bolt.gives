export function shouldTreatInstallFailureAsFatal(env) {
  return env.PLAYWRIGHT_INSTALL_REQUIRED === '1';
}
