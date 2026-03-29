-- Experimental managed Cloudflare instance tenancy schema
-- Release line: v3.0.2 blueprint / v3.0.3 implementation target

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS managed_instance_clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_key TEXT NOT NULL UNIQUE,
  client_key_hash TEXT NOT NULL UNIQUE,
  email_hash TEXT,
  github_user_id TEXT,
  plan TEXT NOT NULL DEFAULT 'experimental-free',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS managed_instances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL UNIQUE,
  instance_slug TEXT NOT NULL UNIQUE,
  route_hostname TEXT NOT NULL UNIQUE,
  cloudflare_container_name TEXT UNIQUE,
  cloudflare_container_id TEXT UNIQUE,
  instance_type TEXT NOT NULL DEFAULT 'standard-2',
  runtime_memory_mib INTEGER NOT NULL DEFAULT 6144,
  runtime_disk_mb INTEGER NOT NULL DEFAULT 12000,
  current_git_sha TEXT,
  previous_git_sha TEXT,
  status TEXT NOT NULL DEFAULT 'provisioning',
  last_healthcheck_at TEXT,
  last_rollout_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES managed_instance_clients(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS managed_instance_rollouts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  instance_id INTEGER NOT NULL,
  target_git_sha TEXT NOT NULL,
  previous_git_sha TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  started_at TEXT,
  finished_at TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (instance_id) REFERENCES managed_instances(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS managed_instance_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  instance_id INTEGER NOT NULL,
  actor_type TEXT NOT NULL,
  actor_id TEXT,
  event_type TEXT NOT NULL,
  reason TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (instance_id) REFERENCES managed_instances(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_managed_instances_status ON managed_instances(status);
CREATE INDEX IF NOT EXISTS idx_managed_rollouts_status ON managed_instance_rollouts(status);
CREATE INDEX IF NOT EXISTS idx_managed_events_instance_created
  ON managed_instance_events(instance_id, created_at DESC);
