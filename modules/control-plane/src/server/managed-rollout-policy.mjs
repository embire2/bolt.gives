export function automaticManagedRolloutEnabled({ enabled = true, intervalMs = 0 } = {}) {
  return enabled && Number.isFinite(intervalMs) && intervalMs > 0;
}
