#!/usr/bin/env node

import crypto from 'node:crypto';
import { spawn } from 'node:child_process';

const RUNTIME_NODE_STATUSES = new Set(['provisioning', 'active', 'failed', 'suspended']);
const RESERVED_LINUX_USERNAMES = new Set([
  'root',
  'admin',
  'daemon',
  'bin',
  'sys',
  'sync',
  'games',
  'man',
  'lp',
  'mail',
  'news',
  'uucp',
  'proxy',
  'www-data',
  'backup',
  'list',
  'irc',
  'gnats',
  'nobody',
  'systemd-network',
  'systemd-resolve',
  'postgres',
  'sshd',
  'bolt-runtime',
  'bolt-runtime-agent',
]);

export function hashRuntimeNodeSecret(value) {
  return crypto
    .createHash('sha256')
    .update(String(value || ''))
    .digest('hex');
}

export function slugifyRuntimeNodeProject(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 36);
}

export function normalizeRuntimeNodeUsername(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^[-_0-9]+/, '')
    .slice(0, 28);
}

export function validateRuntimeNodeUsername(value) {
  const rawUsername = String(value || '')
    .trim()
    .toLowerCase();
  const username = normalizeRuntimeNodeUsername(value);

  if (rawUsername !== username || !/^[a-z][a-z0-9_-]{2,27}$/.test(username)) {
    return {
      ok: false,
      username,
      reason: 'CLI username must start with a letter and use 3-28 lowercase letters, numbers, dashes, or underscores.',
    };
  }

  if (RESERVED_LINUX_USERNAMES.has(username)) {
    return {
      ok: false,
      username,
      reason: 'Choose a non-system CLI username.',
    };
  }

  return { ok: true, username, reason: null };
}

export function isStrongRuntimeNodePassword(value) {
  const password = String(value || '');
  return password.length >= 12 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password);
}

export function createRuntimeNodeDatabasePassword() {
  return crypto.randomBytes(24).toString('base64url');
}

export function buildRuntimeNodeConfig(env = /** @type {Record<string, string | undefined>} */ (process.env)) {
  const host = String(env.BOLT_RUNTIME_NODE_HOST || '').trim();
  const publicHost = String(env.BOLT_RUNTIME_NODE_PUBLIC_HOST || host).trim();
  const port = Number(String(env.BOLT_RUNTIME_NODE_PORT || '22').trim());
  const adminUser = String(env.BOLT_RUNTIME_NODE_ADMIN_USER || '').trim();
  const sshPassword = String(env.BOLT_RUNTIME_NODE_SSH_PASSWORD || '').trim();
  const identityFile = String(env.BOLT_RUNTIME_NODE_SSH_KEY_PATH || '').trim();
  const baseDir = String(env.BOLT_RUNTIME_NODE_BASE_DIR || '/srv/bolt-live-workspaces').trim();
  const enabled = ['1', 'true', 'yes', 'on'].includes(
    String(env.BOLT_RUNTIME_NODE_ENABLED || '')
      .trim()
      .toLowerCase(),
  );
  const authMode = identityFile ? 'ssh-key' : sshPassword ? 'password' : 'none';

  return {
    enabled,
    supported: Boolean(enabled && host && publicHost && port > 0 && port <= 65535 && adminUser && authMode !== 'none'),
    reason: !enabled
      ? 'Dedicated runtime-node workspaces are disabled on this deployment.'
      : !host
        ? 'Set BOLT_RUNTIME_NODE_HOST on the runtime service.'
        : !adminUser
          ? 'Set BOLT_RUNTIME_NODE_ADMIN_USER on the runtime service.'
          : authMode === 'none'
            ? 'Set BOLT_RUNTIME_NODE_SSH_KEY_PATH or BOLT_RUNTIME_NODE_SSH_PASSWORD on the runtime service.'
            : null,
    host,
    publicHost,
    port,
    adminUser,
    sshPassword,
    identityFile,
    authMode,
    baseDir,
  };
}

export function sanitizeRuntimeNodeConfigForClient(config) {
  return {
    supported: Boolean(config?.supported),
    reason: config?.reason || null,
    host: config?.publicHost || config?.host || null,
    port: Number(config?.port || 22),
    baseDir: config?.baseDir || null,
    authMode: config?.authMode === 'ssh-key' ? 'ssh-key' : config?.authMode === 'password' ? 'password' : 'none',
  };
}

export function normalizeRuntimeNodeWorkspaceRegistry(input) {
  const now = new Date().toISOString();
  const workspaces = Array.isArray(input?.workspaces) ? input.workspaces : [];

  return {
    version: 1,
    workspaces: workspaces.map((workspace) => {
      const projectSlug = slugifyRuntimeNodeProject(workspace.projectSlug || workspace.projectName) || 'project';
      const cliUsername = normalizeRuntimeNodeUsername(workspace.cliUsername) || 'client';
      const id = String(workspace.id || crypto.randomUUID());

      return {
        id,
        clientName: String(workspace.clientName || 'Client'),
        clientEmail: String(workspace.clientEmail || '')
          .trim()
          .toLowerCase(),
        projectName: String(workspace.projectName || projectSlug),
        projectSlug,
        cliUsername,
        cliPasswordHash: typeof workspace.cliPasswordHash === 'string' ? workspace.cliPasswordHash : null,
        databaseName: String(workspace.databaseName || buildRuntimeNodeDatabaseName(projectSlug, id)),
        databaseUser: String(workspace.databaseUser || buildRuntimeNodeDatabaseUser(cliUsername, id)),
        databasePasswordHash: typeof workspace.databasePasswordHash === 'string' ? workspace.databasePasswordHash : null,
        workspaceDir:
          typeof workspace.workspaceDir === 'string' && workspace.workspaceDir
            ? workspace.workspaceDir
            : `/srv/bolt-live-workspaces/${projectSlug}`,
        sshHost: typeof workspace.sshHost === 'string' && workspace.sshHost ? workspace.sshHost : null,
        sshPort: Number(workspace.sshPort || 22),
        status: RUNTIME_NODE_STATUSES.has(workspace.status) ? workspace.status : 'provisioning',
        provisionedAt:
          typeof workspace.provisionedAt === 'string' && workspace.provisionedAt ? workspace.provisionedAt : null,
        createdAt: typeof workspace.createdAt === 'string' && workspace.createdAt ? workspace.createdAt : now,
        updatedAt: typeof workspace.updatedAt === 'string' && workspace.updatedAt ? workspace.updatedAt : now,
        lastError: typeof workspace.lastError === 'string' && workspace.lastError ? workspace.lastError : null,
      };
    }),
    events: Array.isArray(input?.events) ? input.events.slice(-500) : [],
  };
}

export function buildRuntimeNodeDatabaseName(projectSlug, id) {
  const suffix = String(id || crypto.randomUUID()).replace(/-/g, '').slice(0, 8);
  return `bolt_${String(projectSlug || 'project').replace(/-/g, '_')}_${suffix}`.slice(0, 63);
}

export function buildRuntimeNodeDatabaseUser(cliUsername, id) {
  const suffix = String(id || crypto.randomUUID()).replace(/-/g, '').slice(0, 8);
  return `bu_${String(cliUsername || 'client').replace(/-/g, '_')}_${suffix}`.slice(0, 63);
}

export function createRuntimeNodeWorkspaceRecord(input, config) {
  const id = crypto.randomUUID();
  const projectSlug = slugifyRuntimeNodeProject(input.projectName);
  const usernameValidation = validateRuntimeNodeUsername(input.cliUsername);

  if (!projectSlug || projectSlug.length < 3) {
    throw new Error('Project slug must be at least 3 letters or numbers.');
  }

  if (!usernameValidation.ok) {
    throw new Error(usernameValidation.reason);
  }

  const cliPassword = String(input.cliPassword || '');

  if (!isStrongRuntimeNodePassword(cliPassword)) {
    throw new Error('CLI password must be at least 12 characters and include lowercase, uppercase, and a number.');
  }

  const databasePassword = String(input.databasePassword || createRuntimeNodeDatabasePassword());
  const workspaceDir = `${config.baseDir.replace(/\/+$/, '')}/${projectSlug}`;
  const databaseName = buildRuntimeNodeDatabaseName(projectSlug, id);
  const databaseUser = buildRuntimeNodeDatabaseUser(usernameValidation.username, id);
  const now = new Date().toISOString();

  return {
    record: {
      id,
      clientName: String(input.clientName || '').trim(),
      clientEmail: String(input.clientEmail || '')
        .trim()
        .toLowerCase(),
      projectName: String(input.projectName || '').trim(),
      projectSlug,
      cliUsername: usernameValidation.username,
      cliPasswordHash: hashRuntimeNodeSecret(cliPassword),
      databaseName,
      databaseUser,
      databasePasswordHash: hashRuntimeNodeSecret(databasePassword),
      workspaceDir,
      sshHost: config.publicHost,
      sshPort: config.port,
      status: 'provisioning',
      provisionedAt: null,
      createdAt: now,
      updatedAt: now,
      lastError: null,
    },
    secrets: {
      cliPassword,
      databasePassword,
    },
  };
}

export function sanitizeRuntimeNodeWorkspaceForClient(workspace, secrets = {}) {
  const sshHost = workspace.sshHost || null;
  const sshPort = Number(workspace.sshPort || 22);
  const sshCommand = sshHost ? `ssh -p ${sshPort} ${workspace.cliUsername}@${sshHost}` : null;

  return {
    id: workspace.id,
    clientName: workspace.clientName,
    clientEmail: workspace.clientEmail,
    projectName: workspace.projectName,
    projectSlug: workspace.projectSlug,
    cliUsername: workspace.cliUsername,
    workspaceDir: workspace.workspaceDir,
    sshHost,
    sshPort,
    sshCommand,
    databaseName: workspace.databaseName,
    databaseUser: workspace.databaseUser,
    databaseHost: '127.0.0.1',
    databasePort: 5432,
    databaseUrl:
      secrets?.databasePassword && sshHost
        ? `postgresql://${workspace.databaseUser}:${encodeURIComponent(secrets.databasePassword)}@127.0.0.1:5432/${workspace.databaseName}`
        : null,
    oneTimeCliPassword: secrets?.cliPassword || null,
    oneTimeDatabasePassword: secrets?.databasePassword || null,
    status: workspace.status,
    createdAt: workspace.createdAt,
    updatedAt: workspace.updatedAt,
    provisionedAt: workspace.provisionedAt || null,
    lastError: workspace.lastError || null,
  };
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

export function buildRuntimeNodeProvisionScript(workspace, secrets, config) {
  const dbPasswordSql = String(secrets.databasePassword).replace(/'/g, "''");

  return `#!/usr/bin/env bash
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

BASE_DIR=${shellQuote(config.baseDir)}
WORKSPACE_DIR=${shellQuote(workspace.workspaceDir)}
PROJECT_SLUG=${shellQuote(workspace.projectSlug)}
CLI_USERNAME=${shellQuote(workspace.cliUsername)}
CLI_PASSWORD=${shellQuote(secrets.cliPassword)}
DB_NAME=${shellQuote(workspace.databaseName)}
DB_USER=${shellQuote(workspace.databaseUser)}
DB_PASSWORD=${shellQuote(secrets.databasePassword)}
DB_PASSWORD_SQL=${shellQuote(dbPasswordSql)}
DATABASE_URL="postgresql://$DB_USER:$DB_PASSWORD@127.0.0.1:5432/$DB_NAME"

run_root() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
  else
    sudo "$@"
  fi
}

run_postgres() {
  if [ "$(id -u)" -eq 0 ]; then
    sudo -u postgres "$@"
  else
    sudo -u postgres "$@"
  fi
}

cd /tmp

run_root env DEBIAN_FRONTEND=noninteractive apt-get update -y >/dev/null
run_root env DEBIAN_FRONTEND=noninteractive apt-get install -y sudo postgresql postgresql-contrib git curl ca-certificates build-essential python3 nodejs npm >/dev/null
run_root systemctl enable --now postgresql >/dev/null

if ! getent group bolt-clients >/dev/null; then
  run_root groupadd --system bolt-clients
fi

run_root mkdir -p "$BASE_DIR" /var/log/bolt-runtime
run_root chmod 751 "$BASE_DIR"
run_root touch /var/log/bolt-runtime/workspace-provision.log
run_root chmod 600 /var/log/bolt-runtime/workspace-provision.log

if id "$CLI_USERNAME" >/dev/null 2>&1; then
  run_root usermod --home "$WORKSPACE_DIR" --shell /bin/bash --append --groups bolt-clients "$CLI_USERNAME"
else
  run_root useradd --create-home --home-dir "$WORKSPACE_DIR" --shell /bin/bash --groups bolt-clients "$CLI_USERNAME"
fi

printf '%s:%s\\n' "$CLI_USERNAME" "$CLI_PASSWORD" | run_root chpasswd
run_root mkdir -p "$WORKSPACE_DIR"
run_root chown -R "$CLI_USERNAME:$CLI_USERNAME" "$WORKSPACE_DIR"
run_root chmod 700 "$WORKSPACE_DIR"

if ! command -v pnpm >/dev/null 2>&1; then
  run_root npm install -g pnpm >/dev/null 2>&1 || true
fi

if run_postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1; then
  run_postgres psql -v ON_ERROR_STOP=1 -c "ALTER ROLE \\"$DB_USER\\" WITH LOGIN PASSWORD '$DB_PASSWORD_SQL';" >/dev/null
else
  run_postgres psql -v ON_ERROR_STOP=1 -c "CREATE ROLE \\"$DB_USER\\" WITH LOGIN PASSWORD '$DB_PASSWORD_SQL';" >/dev/null
fi

if ! run_postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1; then
  run_postgres createdb -O "$DB_USER" "$DB_NAME"
fi

run_root tee "$WORKSPACE_DIR/.env" >/dev/null <<EOF_ENV
DATABASE_URL=$DATABASE_URL
PGHOST=127.0.0.1
PGPORT=5432
PGDATABASE=$DB_NAME
PGUSER=$DB_USER
PGPASSWORD=$DB_PASSWORD
EOF_ENV

run_root tee "$WORKSPACE_DIR/README.md" >/dev/null <<EOF_README
# $PROJECT_SLUG live workspace

This project workspace is isolated at:

  $WORKSPACE_DIR

## Quick CLI

  cd "$WORKSPACE_DIR"
  pnpm --version
  source .env
  psql "\\$DATABASE_URL"

The workspace is owned by the project Unix user and is not readable by other client users.
EOF_README

run_root tee "$WORKSPACE_DIR/.profile" >/dev/null <<'EOF_PROFILE'
umask 077
ulimit -u 256
ulimit -n 2048
cd "$HOME"
EOF_PROFILE

run_root chown "$CLI_USERNAME:$CLI_USERNAME" "$WORKSPACE_DIR/.env" "$WORKSPACE_DIR/README.md" "$WORKSPACE_DIR/.profile"
run_root chmod 600 "$WORKSPACE_DIR/.env"
run_root chmod 644 "$WORKSPACE_DIR/README.md" "$WORKSPACE_DIR/.profile"

printf '%s project=%s user=%s dir=%s db=%s\\n' "$(date -Is)" "$PROJECT_SLUG" "$CLI_USERNAME" "$WORKSPACE_DIR" "$DB_NAME" | run_root tee -a /var/log/bolt-runtime/workspace-provision.log >/dev/null
echo "runtime-node workspace provisioned: $PROJECT_SLUG"
`;
}

export function runRuntimeNodeProvision(workspace, secrets, config) {
  const script = buildRuntimeNodeProvisionScript(workspace, secrets, config);
  const args = [
    '-o',
    'StrictHostKeyChecking=accept-new',
    '-o',
    'BatchMode=no',
    '-p',
    String(config.port || 22),
  ];

  if (config.identityFile) {
    args.push('-i', config.identityFile);
  }

  args.push(`${config.adminUser}@${config.host}`, 'bash -s');

  const command = config.authMode === 'password' ? 'sshpass' : 'ssh';
  const commandArgs = config.authMode === 'password' ? ['-e', 'ssh', ...args] : args;
  const env = { ...process.env };

  if (config.authMode === 'password') {
    env.SSHPASS = config.sshPassword;
  }

  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(new Error((stderr || stdout || `Runtime node provision failed with exit code ${code}`).trim()));
    });

    child.stdin.end(script);
  });
}
