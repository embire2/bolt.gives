#!/usr/bin/env bash
set -Eeuo pipefail

REPO_URL="${REPO_URL:-https://github.com/embire2/bolt.gives.git}"
BRANCH="${BRANCH:-main}"
SERVICE_PREFIX="${SERVICE_PREFIX:-bolt-gives}"
APP_PORT="${APP_PORT:-5173}"
COLLAB_PORT="${COLLAB_PORT:-1234}"
WEBBROWSE_PORT="${WEBBROWSE_PORT:-4179}"
RUNTIME_PORT="${RUNTIME_PORT:-4321}"
NODE_MAJOR="${NODE_MAJOR:-22}"
PNPM_VERSION="${PNPM_VERSION:-9.14.4}"
NODE_HEAP_MB="${NODE_HEAP_MB:-4096}"
INSTALL_DIR="${INSTALL_DIR:-$HOME/bolt.gives}"
RUNTIME_WORKSPACE_DIR="${RUNTIME_WORKSPACE_DIR:-${INSTALL_DIR%/}-runtime-workspaces}"
APP_DOMAIN="${APP_DOMAIN:-}"
ADMIN_DOMAIN="${ADMIN_DOMAIN:-}"
CREATE_DOMAIN="${CREATE_DOMAIN:-}"
LETSENCRYPT_EMAIL="${LETSENCRYPT_EMAIL:-}"
POSTGRES_DB="${POSTGRES_DB:-bolt_gives_admin}"
POSTGRES_USER="${POSTGRES_USER:-bolt_gives_admin}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-}"
INSTALL_DEPS=1
INSTALL_SERVICE=1
BUILD_APP=1
INSTALL_POSTGRES=1
INSTALL_CADDY=1

APP_SERVICE="${SERVICE_PREFIX}-app"
COLLAB_SERVICE="${SERVICE_PREFIX}-collab"
WEBBROWSE_SERVICE="${SERVICE_PREFIX}-webbrowse"
RUNTIME_SERVICE="${SERVICE_PREFIX}-runtime"

usage() {
  cat <<'EOF'
bolt.gives installer

Usage:
  ./install.sh [options]

Options:
  --install-dir PATH   Install/update the repo in PATH (default: $HOME/bolt.gives)
  --branch NAME        Git branch to install (default: main)
  --repo-url URL       Git repository URL to clone/update
  --app-domain HOST    Public app domain (for example: code.example.com)
  --admin-domain HOST  Public admin/operator domain (for example: admin.example.com)
  --create-domain HOST Public trial-registration domain (for example: create.example.com)
  --skip-postgres      Skip local PostgreSQL installation/configuration
  --skip-caddy         Skip Caddy installation/configuration
  --postgres-db NAME   Local PostgreSQL database name (default: bolt_gives_admin)
  --postgres-user NAME Local PostgreSQL user name (default: bolt_gives_admin)
  --postgres-password VALUE
                       Local PostgreSQL password (generated if omitted)
  --skip-deps          Skip apt, Node.js, and pnpm installation
  --skip-service       Skip systemd service installation/startup
  --skip-build         Skip production build
  --help               Show this help

Environment overrides:
  INSTALL_DIR, BRANCH, REPO_URL, APP_PORT, COLLAB_PORT, WEBBROWSE_PORT, RUNTIME_PORT,
  SERVICE_PREFIX, NODE_MAJOR, PNPM_VERSION, NODE_HEAP_MB, RUNTIME_WORKSPACE_DIR,
  APP_DOMAIN, ADMIN_DOMAIN, CREATE_DOMAIN, POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD,
  LETSENCRYPT_EMAIL

Notes:
  - Supported target: Ubuntu 18.04+.
  - Run this script as a regular user with sudo access, not as root.
  - Installer-generated services use a 4 GB Node heap by default.
  - When domains are supplied, the installer can also provision Caddy and local PostgreSQL
    so users can self-host the full app, admin panel, and managed-instance registration flow
    on their own VPS.
EOF
}

log() {
  printf '[bolt.gives installer] %s\n' "$*"
}

fail() {
  printf '[bolt.gives installer] ERROR: %s\n' "$*" >&2
  exit 1
}

require_non_root() {
  if [[ "${EUID}" -eq 0 ]]; then
    fail "Run this installer as a regular user with sudo access."
  fi
}

require_ubuntu() {
  if [[ ! -f /etc/os-release ]]; then
    fail "Unable to detect the operating system."
  fi

  # shellcheck disable=SC1091
  source /etc/os-release

  if [[ "${ID:-}" != "ubuntu" ]]; then
    fail "Unsupported platform '${ID:-unknown}'. Install/self-hosting is supported on Ubuntu 18.04+ only."
  fi
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --install-dir)
        INSTALL_DIR="$2"
        shift 2
        ;;
      --branch)
        BRANCH="$2"
        shift 2
        ;;
      --repo-url)
        REPO_URL="$2"
        shift 2
        ;;
      --app-domain)
        APP_DOMAIN="$2"
        shift 2
        ;;
      --admin-domain)
        ADMIN_DOMAIN="$2"
        shift 2
        ;;
      --create-domain)
        CREATE_DOMAIN="$2"
        shift 2
        ;;
      --skip-postgres)
        INSTALL_POSTGRES=0
        shift
        ;;
      --skip-caddy)
        INSTALL_CADDY=0
        shift
        ;;
      --postgres-db)
        POSTGRES_DB="$2"
        shift 2
        ;;
      --postgres-user)
        POSTGRES_USER="$2"
        shift 2
        ;;
      --postgres-password)
        POSTGRES_PASSWORD="$2"
        shift 2
        ;;
      --skip-deps)
        INSTALL_DEPS=0
        shift
        ;;
      --skip-service)
        INSTALL_SERVICE=0
        shift
        ;;
      --skip-build)
        BUILD_APP=0
        shift
        ;;
      --help|-h)
        usage
        exit 0
        ;;
      *)
        fail "Unknown option: $1"
        ;;
    esac
  done
}

normalize_domain() {
  local value="${1:-}"
  value="${value#http://}"
  value="${value#https://}"
  value="${value%%/*}"
  printf '%s' "${value,,}"
}

generate_secret() {
  python3 - <<'PY'
import secrets
print(secrets.token_hex(24))
PY
}

validate_sql_identifier() {
  local value="$1"

  if [[ ! "${value}" =~ ^[A-Za-z0-9_]+$ ]]; then
    fail "Invalid PostgreSQL identifier '${value}'. Use only letters, numbers, and underscores."
  fi
}

normalize_config_inputs() {
  APP_DOMAIN="$(normalize_domain "${APP_DOMAIN}")"
  ADMIN_DOMAIN="$(normalize_domain "${ADMIN_DOMAIN}")"
  CREATE_DOMAIN="$(normalize_domain "${CREATE_DOMAIN}")"

  if [[ -n "${APP_DOMAIN}" && -z "${ADMIN_DOMAIN}" ]]; then
    fail "When --app-domain is set, --admin-domain must also be set."
  fi

  if [[ "${INSTALL_POSTGRES}" -eq 1 ]]; then
    validate_sql_identifier "${POSTGRES_DB}"
    validate_sql_identifier "${POSTGRES_USER}"
  fi
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Required command not found: $1"
}

install_apt_packages() {
  log "Installing Ubuntu base packages"
  sudo apt-get update
  local packages=(git curl ca-certificates build-essential python3)

  if [[ "${INSTALL_POSTGRES}" -eq 1 ]]; then
    packages+=(postgresql postgresql-contrib)
  fi

  if [[ "${INSTALL_CADDY}" -eq 1 ]]; then
    packages+=(caddy)
  fi

  sudo apt-get install -y "${packages[@]}"
}

install_nodejs() {
  local current_major=""

  if command -v node >/dev/null 2>&1; then
    current_major="$(node -p 'process.versions.node.split(".")[0]')"
  fi

  if [[ "${current_major}" == "${NODE_MAJOR}" ]]; then
    log "Node.js ${NODE_MAJOR} already installed"
    return
  fi

  log "Installing Node.js ${NODE_MAJOR}.x"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | sudo -E bash -
  sudo apt-get install -y nodejs
}

install_pnpm() {
  local current_pnpm=""

  if command -v pnpm >/dev/null 2>&1; then
    current_pnpm="$(pnpm --version)"
  fi

  if [[ "${current_pnpm}" == "${PNPM_VERSION}" ]]; then
    log "pnpm ${PNPM_VERSION} already installed"
    return
  fi

  log "Installing pnpm ${PNPM_VERSION}"
  sudo npm install -g "pnpm@${PNPM_VERSION}"
}

clone_or_update_repo() {
  if [[ -d "${INSTALL_DIR}/.git" ]]; then
    log "Updating existing repository in ${INSTALL_DIR}"
    git -C "${INSTALL_DIR}" fetch origin "${BRANCH}"
    git -C "${INSTALL_DIR}" checkout "${BRANCH}"
    git -C "${INSTALL_DIR}" pull --ff-only origin "${BRANCH}"
    return
  fi

  if [[ -e "${INSTALL_DIR}" ]]; then
    fail "Install directory exists but is not a git repository: ${INSTALL_DIR}"
  fi

  log "Cloning ${REPO_URL} into ${INSTALL_DIR}"
  git clone --branch "${BRANCH}" "${REPO_URL}" "${INSTALL_DIR}"
}

upsert_env_line() {
  local file="$1"
  local key="$2"
  local value="$3"

  if [[ ! -f "${file}" ]]; then
    touch "${file}"
  fi

  if grep -qE "^${key}=" "${file}"; then
    python3 - "${file}" "${key}" "${value}" <<'PY'
import pathlib
import sys

file_path = pathlib.Path(sys.argv[1])
key = sys.argv[2]
value = sys.argv[3]

lines = file_path.read_text(encoding="utf-8").splitlines()
updated = []

for line in lines:
    if line.startswith(f"{key}="):
        updated.append(f"{key}={value}")
    else:
        updated.append(line)

file_path.write_text("\n".join(updated) + "\n", encoding="utf-8")
PY
  else
    printf '%s=%s\n' "${key}" "${value}" >> "${file}"
  fi
}

read_env_value() {
  local file="$1"
  local key="$2"

  if [[ ! -f "${file}" ]]; then
    return 0
  fi

  python3 - "${file}" "${key}" <<'PY'
import pathlib
import sys

file_path = pathlib.Path(sys.argv[1])
key = sys.argv[2]

for line in file_path.read_text(encoding="utf-8").splitlines():
    if line.startswith(f"{key}="):
        print(line.split("=", 1)[1])
        break
PY
}

prepare_env_file() {
  local env_file="${INSTALL_DIR}/.env.local"

  if [[ ! -f "${env_file}" ]]; then
    log "Creating .env.local from .env.example"
    cp "${INSTALL_DIR}/.env.example" "${env_file}"
  else
    log "Keeping existing .env.local"
  fi

  local existing_cookie_secret
  existing_cookie_secret="$(read_env_value "${env_file}" "BOLT_TENANT_ADMIN_COOKIE_SECRET")"

  if [[ -z "${existing_cookie_secret}" ]]; then
    existing_cookie_secret="$(generate_secret)"
  fi

  if [[ "${INSTALL_POSTGRES}" -eq 1 && -z "${POSTGRES_PASSWORD}" ]]; then
    POSTGRES_PASSWORD="$(read_env_value "${env_file}" "BOLT_ADMIN_DATABASE_PASSWORD")"

    if [[ -z "${POSTGRES_PASSWORD}" ]]; then
      POSTGRES_PASSWORD="$(generate_secret)"
    fi
  fi

  upsert_env_line "${env_file}" "NODE_OPTIONS" "--max-old-space-size=${NODE_HEAP_MB}"
  upsert_env_line "${env_file}" "RUNTIME_PORT" "${RUNTIME_PORT}"
  upsert_env_line "${env_file}" "RUNTIME_WORKSPACE_DIR" "${RUNTIME_WORKSPACE_DIR}"
  upsert_env_line "${env_file}" "BOLT_TENANT_ADMIN_COOKIE_SECRET" "${existing_cookie_secret}"
  upsert_env_line "${env_file}" "BOLT_ADMIN_PANEL_PUBLIC_URL" "${ADMIN_DOMAIN:+https://${ADMIN_DOMAIN}}"
  upsert_env_line "${env_file}" "BOLT_CREATE_TRIAL_PUBLIC_URL" "${CREATE_DOMAIN:+https://${CREATE_DOMAIN}}"

  if [[ "${INSTALL_POSTGRES}" -eq 1 ]]; then
    upsert_env_line "${env_file}" "BOLT_ADMIN_DATABASE_HOST" "127.0.0.1"
    upsert_env_line "${env_file}" "BOLT_ADMIN_DATABASE_PORT" "5432"
    upsert_env_line "${env_file}" "BOLT_ADMIN_DATABASE_NAME" "${POSTGRES_DB}"
    upsert_env_line "${env_file}" "BOLT_ADMIN_DATABASE_USER" "${POSTGRES_USER}"
    upsert_env_line "${env_file}" "BOLT_ADMIN_DATABASE_PASSWORD" "${POSTGRES_PASSWORD}"
    upsert_env_line "${env_file}" "BOLT_ADMIN_DATABASE_SSL" "disable"
  fi

  mkdir -p "${RUNTIME_WORKSPACE_DIR}"
}

setup_local_postgres() {
  if [[ "${INSTALL_POSTGRES}" -ne 1 ]]; then
    return
  fi

  need_cmd systemctl
  need_cmd psql

  log "Configuring local PostgreSQL database '${POSTGRES_DB}'"
  sudo systemctl enable --now postgresql
  local postgres_password_sql="${POSTGRES_PASSWORD//\'/\'\'}"

  if sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='${POSTGRES_USER}'" | grep -q 1; then
    sudo -u postgres psql -c "ALTER ROLE \"${POSTGRES_USER}\" WITH LOGIN PASSWORD '${postgres_password_sql}';" >/dev/null
  else
    sudo -u postgres psql -c "CREATE ROLE \"${POSTGRES_USER}\" WITH LOGIN PASSWORD '${postgres_password_sql}';" >/dev/null
  fi

  if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${POSTGRES_DB}'" | grep -q 1; then
    sudo -u postgres createdb -O "${POSTGRES_USER}" "${POSTGRES_DB}"
  fi
}

install_dependencies() {
  log "Installing project dependencies"
  (
    cd "${INSTALL_DIR}"
    pnpm install --frozen-lockfile || pnpm install
  )
}

build_application() {
  log "Building production bundle with ${NODE_HEAP_MB} MB Node heap"
  (
    cd "${INSTALL_DIR}"
    export NODE_OPTIONS="--max-old-space-size=${NODE_HEAP_MB}"
    pnpm exec remix vite:build
  )
}

write_launcher_scripts() {
  mkdir -p "${INSTALL_DIR}/bin"

  cat > "${INSTALL_DIR}/bin/start-app.sh" <<EOF
#!/usr/bin/env bash
set -Eeuo pipefail
ROOT_DIR="\$(cd "\$(dirname "\${BASH_SOURCE[0]}")/.." && pwd)"
cd "\${ROOT_DIR}"
export NODE_ENV=production
export PORT="\${PORT:-${APP_PORT}}"
export NODE_OPTIONS="\${NODE_OPTIONS:---max-old-space-size=${NODE_HEAP_MB}}"
pnpm run prepare:devvars
exec pnpm exec wrangler pages dev ./build/client --ip 0.0.0.0 --port "\${PORT}" --no-show-interactive-dev-session
EOF

  cat > "${INSTALL_DIR}/bin/start-collab.sh" <<EOF
#!/usr/bin/env bash
set -Eeuo pipefail
ROOT_DIR="\$(cd "\$(dirname "\${BASH_SOURCE[0]}")/.." && pwd)"
cd "\${ROOT_DIR}"
export NODE_ENV=production
export PORT="\${PORT:-${COLLAB_PORT}}"
export NODE_OPTIONS="\${NODE_OPTIONS:---max-old-space-size=${NODE_HEAP_MB}}"
exec node scripts/collaboration-server.mjs
EOF

  cat > "${INSTALL_DIR}/bin/start-webbrowse.sh" <<EOF
#!/usr/bin/env bash
set -Eeuo pipefail
ROOT_DIR="\$(cd "\$(dirname "\${BASH_SOURCE[0]}")/.." && pwd)"
cd "\${ROOT_DIR}"
export NODE_ENV=production
export PORT="\${PORT:-${WEBBROWSE_PORT}}"
export NODE_OPTIONS="\${NODE_OPTIONS:---max-old-space-size=${NODE_HEAP_MB}}"
exec node scripts/web-browse-server.mjs
EOF

  cat > "${INSTALL_DIR}/bin/start-runtime.sh" <<EOF
#!/usr/bin/env bash
set -Eeuo pipefail
ROOT_DIR="\$(cd "\$(dirname "\${BASH_SOURCE[0]}")/.." && pwd)"
cd "\${ROOT_DIR}"
export NODE_ENV=production
export PORT="\${PORT:-${RUNTIME_PORT}}"
export RUNTIME_PORT="\${RUNTIME_PORT:-${RUNTIME_PORT}}"
export RUNTIME_WORKSPACE_DIR="\${RUNTIME_WORKSPACE_DIR:-${RUNTIME_WORKSPACE_DIR}}"
export NODE_OPTIONS="\${NODE_OPTIONS:---max-old-space-size=${NODE_HEAP_MB}}"
exec node scripts/runtime-server.mjs
EOF

  chmod +x "${INSTALL_DIR}/bin/start-app.sh" "${INSTALL_DIR}/bin/start-collab.sh" "${INSTALL_DIR}/bin/start-webbrowse.sh" "${INSTALL_DIR}/bin/start-runtime.sh"
}

write_service_unit() {
  local service_name="$1"
  local description="$2"
  local launcher="$3"
  local extra_after="$4"
  local extra_wants="$5"
  local port_value="$6"

  sudo tee "/etc/systemd/system/${service_name}.service" >/dev/null <<EOF
[Unit]
Description=${description}
After=network-online.target ${extra_after}
Wants=network-online.target ${extra_wants}

[Service]
Type=simple
User=${USER}
WorkingDirectory=${INSTALL_DIR}
EnvironmentFile=-${INSTALL_DIR}/.env.local
Environment=NODE_ENV=production
Environment=PORT=${port_value}
Environment=NODE_OPTIONS=--max-old-space-size=${NODE_HEAP_MB}
ExecStart=${launcher}
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
}

install_systemd_services() {
  need_cmd systemctl

  log "Installing systemd services"
  write_service_unit "${COLLAB_SERVICE}" "bolt.gives collaboration server" "${INSTALL_DIR}/bin/start-collab.sh" "" "" "${COLLAB_PORT}"
  write_service_unit "${WEBBROWSE_SERVICE}" "bolt.gives web browsing server" "${INSTALL_DIR}/bin/start-webbrowse.sh" "" "" "${WEBBROWSE_PORT}"
  local runtime_after=""
  local runtime_wants=""

  if [[ "${INSTALL_POSTGRES}" -eq 1 ]]; then
    runtime_after="postgresql.service"
    runtime_wants="postgresql.service"
  fi

  write_service_unit "${RUNTIME_SERVICE}" "bolt.gives hosted runtime server" "${INSTALL_DIR}/bin/start-runtime.sh" "${runtime_after}" "${runtime_wants}" "${RUNTIME_PORT}"
  write_service_unit "${APP_SERVICE}" "bolt.gives app server" "${INSTALL_DIR}/bin/start-app.sh" "${COLLAB_SERVICE}.service ${WEBBROWSE_SERVICE}.service ${RUNTIME_SERVICE}.service" "${COLLAB_SERVICE}.service ${WEBBROWSE_SERVICE}.service ${RUNTIME_SERVICE}.service" "${APP_PORT}"

  sudo systemctl daemon-reload
  sudo systemctl enable --now "${COLLAB_SERVICE}" "${WEBBROWSE_SERVICE}" "${RUNTIME_SERVICE}" "${APP_SERVICE}"
}

ensure_caddy_import() {
  local main_caddyfile="/etc/caddy/Caddyfile"

  sudo mkdir -p /etc/caddy/Caddyfile.d

  if [[ ! -f "${main_caddyfile}" ]]; then
    if [[ -n "${LETSENCRYPT_EMAIL}" ]]; then
      sudo tee "${main_caddyfile}" >/dev/null <<EOF
{
	email ${LETSENCRYPT_EMAIL}
}

import /etc/caddy/Caddyfile.d/*.caddy
EOF
    else
      sudo tee "${main_caddyfile}" >/dev/null <<'EOF'
import /etc/caddy/Caddyfile.d/*.caddy
EOF
    fi
    return
  fi

  if ! sudo grep -qF 'import /etc/caddy/Caddyfile.d/*.caddy' "${main_caddyfile}"; then
    printf '\nimport /etc/caddy/Caddyfile.d/*.caddy\n' | sudo tee -a "${main_caddyfile}" >/dev/null
  fi
}

write_caddy_site() {
  local host_name="$1"
  local root_redirect="$2"

  cat <<EOF
${host_name} {
	encode zstd gzip
	header {
		Cache-Control "no-store, max-age=0, must-revalidate"
	}
$(if [[ -n "${root_redirect}" ]]; then cat <<INNER
	@root path /
	redir @root ${root_redirect} 302
INNER
fi)

	handle /runtime/* {
		reverse_proxy 127.0.0.1:${RUNTIME_PORT}
	}

	handle_path /collab/* {
		reverse_proxy 127.0.0.1:${COLLAB_PORT}
	}

	handle {
		reverse_proxy 127.0.0.1:${APP_PORT}
	}
}
EOF
}

configure_caddy() {
  if [[ "${INSTALL_CADDY}" -ne 1 ]]; then
    return
  fi

  need_cmd caddy
  need_cmd systemctl

  if [[ -z "${APP_DOMAIN}" || -z "${ADMIN_DOMAIN}" ]]; then
    log "Skipping Caddy site configuration because app/admin domains were not supplied"
    return
  fi

  log "Configuring Caddy for ${APP_DOMAIN} and ${ADMIN_DOMAIN}"
  ensure_caddy_import

  local caddy_fragment="/etc/caddy/Caddyfile.d/${SERVICE_PREFIX}.caddy"
  local fragment_content

  fragment_content="$(write_caddy_site "${APP_DOMAIN}" "")"
  fragment_content+=$'\n\n'
  fragment_content+="$(write_caddy_site "${ADMIN_DOMAIN}" "/tenant-admin")"

  if [[ -n "${CREATE_DOMAIN}" ]]; then
    fragment_content+=$'\n\n'
    fragment_content+="$(write_caddy_site "${CREATE_DOMAIN}" "/managed-instances")"
  fi

  printf '%s\n' "${fragment_content}" | sudo tee "${caddy_fragment}" >/dev/null
  sudo caddy fmt --overwrite "${caddy_fragment}" >/dev/null
  sudo caddy validate --config /etc/caddy/Caddyfile >/dev/null
  sudo systemctl enable --now caddy
  sudo systemctl reload caddy
}

wait_for_http() {
  local url="$1"
  local attempts="${2:-30}"
  local delay="${3:-2}"

  for ((i=1; i<=attempts; i++)); do
    if curl -fsS "${url}" >/dev/null 2>&1; then
      return 0
    fi
    sleep "${delay}"
  done

  return 1
}

print_summary() {
  local app_url="not configured"
  local admin_url="not configured"
  local trial_url="not configured"
  local trial_note=""

  if [[ -n "${APP_DOMAIN}" ]]; then
    app_url="https://${APP_DOMAIN}"
    trial_url="https://${APP_DOMAIN}/managed-instances"
  fi

  if [[ -n "${ADMIN_DOMAIN}" ]]; then
    admin_url="https://${ADMIN_DOMAIN}"
  fi

  if [[ -n "${CREATE_DOMAIN}" ]]; then
    trial_url="https://${CREATE_DOMAIN}"
    trial_note=" (root redirects to /managed-instances)"
  fi

  cat <<EOF

bolt.gives install completed.

Install directory:
  ${INSTALL_DIR}

Services:
  ${APP_SERVICE}
  ${COLLAB_SERVICE}
  ${WEBBROWSE_SERVICE}
  ${RUNTIME_SERVICE}

Ports:
  app        http://127.0.0.1:${APP_PORT}
  collab     ws://127.0.0.1:${COLLAB_PORT}
  webbrowse  http://127.0.0.1:${WEBBROWSE_PORT}
  runtime    http://127.0.0.1:${RUNTIME_PORT}

Node heap baseline:
  NODE_OPTIONS=--max-old-space-size=${NODE_HEAP_MB}

Hosted runtime workspace root:
  ${RUNTIME_WORKSPACE_DIR}

Public URLs:
  app        ${app_url}
  admin      ${admin_url}
  trials     ${trial_url}${trial_note}

Local PostgreSQL:
  enabled    $(if [[ "${INSTALL_POSTGRES}" -eq 1 ]]; then printf 'yes'; else printf 'no'; fi)
  database   $(if [[ "${INSTALL_POSTGRES}" -eq 1 ]]; then printf '%s' "${POSTGRES_DB}"; else printf 'n/a'; fi)
  user       $(if [[ "${INSTALL_POSTGRES}" -eq 1 ]]; then printf '%s' "${POSTGRES_USER}"; else printf 'n/a'; fi)

Next steps:
  1. Ensure your DNS A records point the chosen app/admin/create domains at this VPS before relying on public HTTPS.
  2. Edit ${INSTALL_DIR}/.env.local and add any provider keys you want to use.
     Keep server-side secrets such as FREE_OPENROUTER_API_KEY private; never place them in browser code or commits.
  3. Restart services after editing secrets:
     sudo systemctl restart ${APP_SERVICE} ${COLLAB_SERVICE} ${WEBBROWSE_SERVICE} ${RUNTIME_SERVICE}
  4. Check service health:
     sudo systemctl status ${APP_SERVICE} --no-pager
EOF
}

main() {
  parse_args "$@"
  require_non_root
  require_ubuntu
  normalize_config_inputs

  if [[ "${INSTALL_DEPS}" -eq 1 ]]; then
    install_apt_packages
    install_nodejs
    install_pnpm
  fi

  need_cmd git
  need_cmd node
  need_cmd npm
  need_cmd pnpm
  need_cmd curl
  need_cmd python3

  clone_or_update_repo
  prepare_env_file
  setup_local_postgres
  install_dependencies
  write_launcher_scripts

  if [[ "${BUILD_APP}" -eq 1 ]]; then
    build_application
  fi

  if [[ "${INSTALL_SERVICE}" -eq 1 ]]; then
    install_systemd_services
    configure_caddy

    if wait_for_http "http://127.0.0.1:${APP_PORT}" 45 2; then
      log "Application responded on http://127.0.0.1:${APP_PORT}"
    else
      fail "Install finished but the app did not respond on http://127.0.0.1:${APP_PORT}. Check systemd logs."
    fi
  fi

  print_summary
}

main "$@"
