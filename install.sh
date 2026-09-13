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
DEFAULT_POSTGRES_DB="bolt_gives_admin"
DEFAULT_POSTGRES_USER="bolt_gives_admin"
DEFAULT_OPERATOR_USERNAME="admin"
POSTGRES_DB="${POSTGRES_DB:-${DEFAULT_POSTGRES_DB}}"
POSTGRES_USER="${POSTGRES_USER:-${DEFAULT_POSTGRES_USER}}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-}"
OPERATOR_USERNAME="${OPERATOR_USERNAME:-${DEFAULT_OPERATOR_USERNAME}}"
OPERATOR_PASSWORD="${OPERATOR_PASSWORD:-}"
INSTALL_DEPS=1
INSTALL_SERVICE=1
BUILD_APP=1
INSTALL_POSTGRES=0
INSTALL_CADDY=1
APP_DOMAIN_SET_BY_FLAG=0
ADMIN_DOMAIN_SET_BY_FLAG=0
CREATE_DOMAIN_SET_BY_FLAG=0
LETSENCRYPT_EMAIL_SET_BY_FLAG=0
POSTGRES_DB_SET_BY_FLAG=0
POSTGRES_USER_SET_BY_FLAG=0
POSTGRES_PASSWORD_SET_BY_FLAG=0
POSTGRES_MODE_SET_BY_FLAG=0
OPERATOR_USERNAME_SET_BY_FLAG=0
OPERATOR_PASSWORD_SET_BY_FLAG=0

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
  --branch NAME        Git branch or release tag to install (default: main)
  --repo-url URL       Git repository URL to clone/update
  --app-domain HOST    Public app domain (for example: code.example.com)
  --admin-domain HOST  Public admin/operator domain (for example: admin.example.com)
  --create-domain HOST Public trial-registration domain (for example: create.example.com)
  --with-postgres      Install optional local PostgreSQL for profiles/admin data
  --skip-postgres      Do not install local PostgreSQL (default)
  --skip-caddy         Skip Caddy installation/configuration
  --postgres-db NAME   Local PostgreSQL database name (default: bolt_gives_admin)
  --postgres-user NAME Local PostgreSQL user name (default: bolt_gives_admin)
  --postgres-password VALUE
                       Local PostgreSQL password (generated if omitted)
  --operator-username NAME
                       Private operator/admin username (default: admin)
  --operator-password VALUE
                       Private operator/admin password (required for non-interactive fresh installs)
  --letsencrypt-email VALUE
                       Contact email for Let's Encrypt / Caddy
  --skip-deps          Skip apt, Node.js, and pnpm installation
  --skip-service       Skip systemd service installation/startup
  --skip-build         Skip production build
  --help               Show this help

Environment overrides:
  INSTALL_DIR, BRANCH, REPO_URL, APP_PORT, COLLAB_PORT, WEBBROWSE_PORT, RUNTIME_PORT,
  SERVICE_PREFIX, NODE_MAJOR, PNPM_VERSION, NODE_HEAP_MB, RUNTIME_WORKSPACE_DIR,
  APP_DOMAIN, ADMIN_DOMAIN, CREATE_DOMAIN, POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD,
  OPERATOR_USERNAME, OPERATOR_PASSWORD, LETSENCRYPT_EMAIL

Notes:
  - Supported target: Ubuntu 20.04+.
  - Run this script as a regular user with sudo access, not as root.
  - Installer-generated services use a 4 GB Node heap by default.
  - Generated projects do not require PostgreSQL. Users connect their own Supabase or
    PostgreSQL database from the Database control when their app needs persistence.
  - Local PostgreSQL is optional and stores bolt.gives profile/admin data only.
EOF
}

log() {
  printf '[bolt.gives installer] %s\n' "$*"
}

warn() {
  printf '[bolt.gives installer] WARN: %s\n' "$*" >&2
}

fail() {
  printf '[bolt.gives installer] ERROR (%s): %s\n' "${INSTALL_STAGE:-preflight}" "$*" >&2
  exit 1
}

report_install_failure() {
  local status="$1"
  local line="$2"
  printf '[bolt.gives installer] Stage %s failed (exit %s, line %s). Resolve the reported prerequisite and rerun the same installer; no success was recorded.\n' "${INSTALL_STAGE:-preflight}" "${status}" "${line}" >&2
  exit "${status}"
}

retry_command() {
  local attempts="$1"
  local delay_seconds="$2"
  local label="$3"
  shift 3

  local attempt=1
  local exit_code=0

  while true; do
    if "$@"; then
      return 0
    else
      exit_code=$?
    fi

    if (( attempt >= attempts )); then
      warn "${label} failed after ${attempts} attempt(s)"
      return "${exit_code}"
    fi

    warn "${label} failed on attempt ${attempt}/${attempts}; retrying in ${delay_seconds}s"
    sleep "${delay_seconds}"
    attempt=$((attempt + 1))
  done
}

repair_apt_state() {
  warn "Repairing apt/dpkg state before retry"
  sudo dpkg --configure -a >/dev/null 2>&1 || true
  sudo apt-get install -f -y >/dev/null 2>&1 || true
}

repair_repo_dependencies() {
  warn "Repairing pnpm cache and workspace dependency state"
  (
    cd "${INSTALL_DIR}" || exit 0
    rm -rf node_modules/.vite node_modules/.cache >/dev/null 2>&1 || true
    pnpm store prune >/dev/null 2>&1 || true
  )
}

recover_services() {
  local services=("$@")

  for service_name in "${services[@]}"; do
    sudo systemctl restart "${service_name}" >/dev/null 2>&1 || true
  done
}

ensure_service_active() {
  local service_name="$1"

  if sudo systemctl is-active --quiet "${service_name}"; then
    return 0
  fi

  warn "${service_name} is not active; attempting one restart"
  sudo systemctl restart "${service_name}" >/dev/null 2>&1 || true
  sudo systemctl is-active --quiet "${service_name}"
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
    fail "Unsupported platform '${ID:-unknown}'. Install/self-hosting is supported on Ubuntu 20.04+ only."
  fi

  if [[ ! "${VERSION_ID:-}" =~ ^([0-9]+)\.([0-9]+) ]]; then
    fail "Unable to determine the Ubuntu release version. bolt.gives requires Ubuntu 20.04 or newer."
  fi

  local ubuntu_major="${BASH_REMATCH[1]}"
  local ubuntu_minor="${BASH_REMATCH[2]}"

  if (( 10#${ubuntu_major} < 20 || (10#${ubuntu_major} == 20 && 10#${ubuntu_minor} < 4) )); then
    fail "Unsupported Ubuntu release '${VERSION_ID}'. bolt.gives requires Ubuntu 20.04 or newer for Node.js ${NODE_MAJOR}."
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
        APP_DOMAIN_SET_BY_FLAG=1
        shift 2
        ;;
      --admin-domain)
        ADMIN_DOMAIN="$2"
        ADMIN_DOMAIN_SET_BY_FLAG=1
        shift 2
        ;;
      --create-domain)
        CREATE_DOMAIN="$2"
        CREATE_DOMAIN_SET_BY_FLAG=1
        shift 2
        ;;
      --letsencrypt-email)
        LETSENCRYPT_EMAIL="$2"
        LETSENCRYPT_EMAIL_SET_BY_FLAG=1
        shift 2
        ;;
      --skip-postgres)
        INSTALL_POSTGRES=0
        POSTGRES_MODE_SET_BY_FLAG=1
        shift
        ;;
      --with-postgres)
        INSTALL_POSTGRES=1
        POSTGRES_MODE_SET_BY_FLAG=1
        shift
        ;;
      --skip-caddy)
        INSTALL_CADDY=0
        shift
        ;;
      --postgres-db)
        POSTGRES_DB="$2"
        POSTGRES_DB_SET_BY_FLAG=1
        INSTALL_POSTGRES=1
        POSTGRES_MODE_SET_BY_FLAG=1
        shift 2
        ;;
      --postgres-user)
        POSTGRES_USER="$2"
        POSTGRES_USER_SET_BY_FLAG=1
        INSTALL_POSTGRES=1
        POSTGRES_MODE_SET_BY_FLAG=1
        shift 2
        ;;
      --postgres-password)
        POSTGRES_PASSWORD="$2"
        POSTGRES_PASSWORD_SET_BY_FLAG=1
        INSTALL_POSTGRES=1
        POSTGRES_MODE_SET_BY_FLAG=1
        shift 2
        ;;
      --operator-username)
        OPERATOR_USERNAME="$2"
        OPERATOR_USERNAME_SET_BY_FLAG=1
        shift 2
        ;;
      --operator-password)
        OPERATOR_PASSWORD="$2"
        OPERATOR_PASSWORD_SET_BY_FLAG=1
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

is_interactive_install() {
  [[ -t 0 && -t 1 && "${BOLT_INSTALL_NONINTERACTIVE:-0}" != "1" ]]
}

prompt_line() {
  local prompt="$1"
  local default_value="${2:-}"
  local answer=""

  if [[ -n "${default_value}" ]]; then
    read -r -p "${prompt} [${default_value}]: " answer || true
    printf '%s' "${answer:-${default_value}}"
    return
  fi

  read -r -p "${prompt}: " answer || true
  printf '%s' "${answer}"
}

prompt_required_line() {
  local prompt="$1"
  local default_value="${2:-}"
  local answer=""

  while true; do
    answer="$(prompt_line "${prompt}" "${default_value}")"

    if [[ -n "${answer}" ]]; then
      printf '%s' "${answer}"
      return
    fi

    printf 'A value is required.\n' >&2
  done
}

prompt_secret_line() {
  local prompt="$1"
  local answer=""

  read -r -s -p "${prompt}: " answer || true
  printf '\n' >&2
  printf '%s' "${answer}"
}

prompt_confirmed_secret_line() {
  local prompt="$1"
  local confirmation_prompt="${2:-Confirm ${prompt}}"
  local answer=""
  local confirmation=""

  while true; do
    answer="$(prompt_secret_line "${prompt}")"

    if [[ -z "${answer}" ]]; then
      printf 'A value is required.\n' >&2
      continue
    fi

    confirmation="$(prompt_secret_line "${confirmation_prompt}")"

    if [[ "${answer}" == "${confirmation}" ]]; then
      printf '%s' "${answer}"
      return
    fi

    printf 'Values did not match. Try again.\n' >&2
  done
}

prompt_yes_no() {
  local prompt="$1"
  local default_answer="${2:-Y}"
  local answer=""

  while true; do
    read -r -p "${prompt} [${default_answer}/$( [[ "${default_answer}" == "Y" ]] && printf 'n' || printf 'y' )]: " answer || true
    answer="${answer:-${default_answer}}"
    answer="${answer^^}"

    case "${answer}" in
      Y|YES)
        return 0
        ;;
      N|NO)
        return 1
        ;;
    esac
  done
}

prompt_for_missing_config() {
  if ! is_interactive_install; then
    return
  fi

  if [[ "${INSTALL_CADDY}" -eq 1 ]]; then
    if [[ -z "${APP_DOMAIN}" && -z "${ADMIN_DOMAIN}" && "${APP_DOMAIN_SET_BY_FLAG}" -eq 0 && "${ADMIN_DOMAIN_SET_BY_FLAG}" -eq 0 ]]; then
      if prompt_yes_no "Configure public app/admin domains with Caddy and Let's Encrypt now?" "Y"; then
        APP_DOMAIN="$(normalize_domain "$(prompt_required_line "Public app domain (for example: code.example.com)")")"
        ADMIN_DOMAIN="$(normalize_domain "$(prompt_required_line "Public admin domain (for example: admin.example.com)")")"

        if [[ "${CREATE_DOMAIN_SET_BY_FLAG}" -eq 0 ]]; then
          CREATE_DOMAIN="$(normalize_domain "$(prompt_line "Public create/trial domain (optional, for example: create.example.com)")")"
        fi
      else
        INSTALL_CADDY=0
      fi
    else
      if [[ -z "${APP_DOMAIN}" ]]; then
        APP_DOMAIN="$(normalize_domain "$(prompt_required_line "Public app domain (required for Caddy)")")"
      fi

      if [[ -z "${ADMIN_DOMAIN}" ]]; then
        ADMIN_DOMAIN="$(normalize_domain "$(prompt_required_line "Public admin domain (required for Caddy)")")"
      fi

      if [[ -z "${CREATE_DOMAIN}" && "${CREATE_DOMAIN_SET_BY_FLAG}" -eq 0 ]]; then
        CREATE_DOMAIN="$(normalize_domain "$(prompt_line "Public create/trial domain (optional)")")"
      fi
    fi

    if [[ "${INSTALL_CADDY}" -eq 1 && -n "${APP_DOMAIN}" && -n "${ADMIN_DOMAIN}" && -z "${LETSENCRYPT_EMAIL}" && "${LETSENCRYPT_EMAIL_SET_BY_FLAG}" -eq 0 ]]; then
      LETSENCRYPT_EMAIL="$(prompt_line "Let's Encrypt contact email (recommended)" "hello@${ADMIN_DOMAIN}")"
    fi
  fi

  if [[ "${POSTGRES_MODE_SET_BY_FLAG}" -eq 0 ]]; then
    if prompt_yes_no "Install optional local PostgreSQL for bolt.gives profiles and admin data?" "N"; then
      INSTALL_POSTGRES=1
    fi
  fi

  if [[ "${INSTALL_POSTGRES}" -eq 1 ]]; then
    if [[ "${POSTGRES_DB_SET_BY_FLAG}" -eq 0 ]]; then
      POSTGRES_DB="$(prompt_required_line "Local PostgreSQL database name" "${POSTGRES_DB:-${DEFAULT_POSTGRES_DB}}")"
    fi

    if [[ "${POSTGRES_USER_SET_BY_FLAG}" -eq 0 ]]; then
      POSTGRES_USER="$(prompt_required_line "Local PostgreSQL user name" "${POSTGRES_USER:-${DEFAULT_POSTGRES_USER}}")"
    fi

    if [[ "${POSTGRES_PASSWORD_SET_BY_FLAG}" -eq 0 && -z "${POSTGRES_PASSWORD}" ]]; then
      POSTGRES_PASSWORD="$(prompt_secret_line "Local PostgreSQL password (leave blank to generate)")"
    fi
  fi
}

validate_sql_identifier() {
  local value="$1"

  if [[ ! "${value}" =~ ^[A-Za-z0-9_]+$ ]]; then
    fail "Invalid PostgreSQL identifier '${value}'. Use only letters, numbers, and underscores."
  fi
}

validate_operator_username() {
  local value="$1"

  if [[ ! "${value}" =~ ^[A-Za-z0-9._@-]+$ ]]; then
    fail "Invalid operator username '${value}'. Use only letters, numbers, dots, dashes, underscores, or @."
  fi
}

normalize_config_inputs() {
  APP_DOMAIN="$(normalize_domain "${APP_DOMAIN}")"
  ADMIN_DOMAIN="$(normalize_domain "${ADMIN_DOMAIN}")"
  CREATE_DOMAIN="$(normalize_domain "${CREATE_DOMAIN}")"

  if [[ -n "${APP_DOMAIN}" && -z "${ADMIN_DOMAIN}" ]]; then
    fail "When --app-domain is set, --admin-domain must also be set."
  fi

  local host_name
  for host_name in "${APP_DOMAIN}" "${ADMIN_DOMAIN}" "${CREATE_DOMAIN}"; do
    if [[ -n "${host_name}" && ! "${host_name}" =~ ^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$ ]]; then
      fail "Invalid domain. Supply a hostname only, without ports, spaces or Caddy directives."
    fi
  done
  [[ "${SERVICE_PREFIX}" =~ ^[a-zA-Z0-9][a-zA-Z0-9_-]*$ ]] || fail "Invalid service prefix."
  [[ "${NODE_MAJOR}" =~ ^[0-9]+$ && "${NODE_HEAP_MB}" =~ ^[0-9]+$ ]] || fail "Node settings must be numeric."
  for port in "${APP_PORT}" "${COLLAB_PORT}" "${WEBBROWSE_PORT}" "${RUNTIME_PORT}"; do
    [[ "${port}" =~ ^[0-9]{1,5}$ ]] && (( 10#${port} > 0 && 10#${port} <= 65535 )) || fail "Ports must be between 1 and 65535."
  done
  [[ "${INSTALL_DIR}" == /* && "${INSTALL_DIR}" != / && "${INSTALL_DIR}" != *[$'\n\r\t ']* ]] || fail "Use an absolute install path without spaces or control characters."

  if [[ "${INSTALL_POSTGRES}" -eq 1 ]]; then
    validate_sql_identifier "${POSTGRES_DB}"
    validate_sql_identifier "${POSTGRES_USER}"
  fi

  validate_operator_username "${OPERATOR_USERNAME}"
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Required command not found: $1"
}

install_apt_packages() {
  log "Installing Ubuntu base packages"
  repair_apt_state
  retry_command 3 5 "apt-get update" sudo apt-get update >/dev/null
  local packages=(git curl ca-certificates build-essential python3)

  if [[ "${INSTALL_POSTGRES}" -eq 1 ]]; then
    packages+=(postgresql postgresql-contrib)
  fi

  if [[ "${INSTALL_CADDY}" -eq 1 ]]; then
    packages+=(caddy)
  fi

  if ! retry_command 2 5 "apt-get install base packages" sudo apt-get install -y "${packages[@]}"; then
    repair_apt_state
    retry_command 2 5 "apt-get install base packages after repair" sudo apt-get install -y "${packages[@]}" \
      || fail "Unable to install required Ubuntu packages."
  fi
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
  repair_apt_state

  retry_command 3 5 "NodeSource setup for Node.js ${NODE_MAJOR}" bash -o pipefail -lc \
    "curl --connect-timeout 15 --max-time 120 -fsSL 'https://deb.nodesource.com/setup_${NODE_MAJOR}.x' | sudo -E bash -" \
    || fail "Unable to prepare the NodeSource repository for Node.js ${NODE_MAJOR}."

  retry_command 3 5 "nodejs package install" sudo apt-get install -y nodejs \
    || fail "Unable to install Node.js ${NODE_MAJOR}."
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
  retry_command 3 5 "pnpm ${PNPM_VERSION} install" sudo npm install -g "pnpm@${PNPM_VERSION}" \
    || fail "Unable to install pnpm ${PNPM_VERSION}."
}

clone_or_update_repo() {
  [[ "${BRANCH}" != -* ]] && git check-ref-format "refs/heads/${BRANCH}" >/dev/null \
    || fail "Invalid Git branch or tag name."

  if [[ -d "${INSTALL_DIR}/.git" ]]; then
    if [[ -n "$(git -C "${INSTALL_DIR}" status --porcelain --untracked-files=no)" ]]; then
      fail "Tracked files have local changes. Commit or back them up before updating; nothing was overwritten."
    fi
    log "Updating existing repository in ${INSTALL_DIR}"
    local remote_refs ref_name fetch_ref fetched_commit local_commit
    remote_refs="$(retry_command 3 5 "repository ref lookup" git -C "${INSTALL_DIR}" ls-remote --refs origin \
      "refs/heads/${BRANCH}" "refs/tags/${BRANCH}")" \
      || fail "Repository ref lookup failed. The existing checkout was not changed."
    ref_name="$(printf '%s\n' "${remote_refs}" | awk -v wanted="refs/heads/${BRANCH}" '$2 == wanted {print $2}')"
    if [[ -z "${ref_name}" ]]; then
      ref_name="$(printf '%s\n' "${remote_refs}" | awk -v wanted="refs/tags/${BRANCH}" '$2 == wanted {print $2}')"
    fi
    [[ -n "${ref_name}" ]] || fail "Requested branch or tag does not exist on origin. Nothing was changed."
    fetch_ref="${ref_name}"
    if [[ "${ref_name}" == refs/tags/* ]]; then
      fetch_ref="${ref_name}:${ref_name}"
    fi
    retry_command 3 5 "repository fetch" git -C "${INSTALL_DIR}" fetch --no-tags origin "${fetch_ref}" \
      || fail "Repository fetch failed. The existing checkout was not changed."
    fetched_commit="$(git -C "${INSTALL_DIR}" rev-parse --verify 'FETCH_HEAD^{commit}')" \
      || fail "The requested ref is not a commit."
    git -C "${INSTALL_DIR}" merge-base --is-ancestor HEAD "${fetched_commit}" \
      || fail "Update is not fast-forward. Back up/reconcile local commits before retrying; nothing was overwritten."

    if [[ "${ref_name}" == refs/tags/* ]]; then
      # Release tags are immutable targets, not origin/<tag> tracking branches.
      git -C "${INSTALL_DIR}" checkout --detach "${fetched_commit}" \
        || fail "Unable to select the release commit."
    else
      if git -C "${INSTALL_DIR}" show-ref --verify --quiet "refs/heads/${BRANCH}"; then
        local_commit="$(git -C "${INSTALL_DIR}" rev-parse "refs/heads/${BRANCH}")"
        git -C "${INSTALL_DIR}" merge-base --is-ancestor "${local_commit}" "${fetched_commit}" \
          || fail "The local target branch has diverged. Nothing was overwritten."
        git -C "${INSTALL_DIR}" checkout "${BRANCH}" \
          && git -C "${INSTALL_DIR}" merge --ff-only "${fetched_commit}" \
          || fail "Unable to fast-forward the requested branch."
      else
        git -C "${INSTALL_DIR}" checkout -b "${BRANCH}" "${fetched_commit}" \
          || fail "Unable to create the requested local branch."
      fi
    fi
    return
  fi

  if [[ -e "${INSTALL_DIR}" ]]; then
    fail "Install directory exists but is not a Git checkout. Choose an empty --install-dir; existing data was not moved."
  fi

  log "Cloning ${REPO_URL} into ${INSTALL_DIR}"
  retry_command 3 5 "git clone ${BRANCH}" git clone --branch "${BRANCH}" "${REPO_URL}" "${INSTALL_DIR}" \
    || fail "Unable to clone ${REPO_URL} (${BRANCH})."
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

hash_tenant_secret() {
  python3 - "$1" <<'PY'
import hashlib
import sys

print(hashlib.sha256(sys.argv[1].encode('utf-8')).hexdigest())
PY
}

tenant_registry_requires_operator_setup() {
  local registry_path="$1"

  python3 - "${registry_path}" <<'PY'
import hashlib
import json
import pathlib
import sys

registry_path = pathlib.Path(sys.argv[1])
default_hash = hashlib.sha256(b'admin').hexdigest()

if not registry_path.exists():
    raise SystemExit(0)

try:
    data = json.loads(registry_path.read_text(encoding='utf-8'))
except Exception:
    raise SystemExit(0)

admin = data.get('admin') or {}
password_hash = str(admin.get('passwordHash') or '').strip()
username = str(admin.get('username') or '').strip()

if not password_hash or password_hash == default_hash or not username:
    raise SystemExit(0)

raise SystemExit(1)
PY
}

read_seeded_operator_username() {
  local registry_path="$1"

  python3 - "${registry_path}" <<'PY'
import json
import pathlib
import sys

registry_path = pathlib.Path(sys.argv[1])

if not registry_path.exists():
    raise SystemExit(0)

try:
    data = json.loads(registry_path.read_text(encoding='utf-8'))
except Exception:
    raise SystemExit(0)

admin = data.get('admin') or {}
username = str(admin.get('username') or '').strip()

if username:
    print(username)
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
  local existing_profile_cookie_secret
  existing_profile_cookie_secret="$(read_env_value "${env_file}" "BOLT_PROFILE_COOKIE_SECRET")"
  local existing_hosted_free_relay_secret
  existing_hosted_free_relay_secret="$(read_env_value "${env_file}" "BOLT_HOSTED_FREE_RELAY_SECRET")"
  local existing_free_usage_quota_secret
  existing_free_usage_quota_secret="$(read_env_value "${env_file}" "BOLT_FREE_USAGE_QUOTA_SECRET")"
  local existing_premium_internal_secret
  existing_premium_internal_secret="$(read_env_value "${env_file}" "BOLT_PREMIUM_INTERNAL_SECRET")"

  if [[ -z "${existing_cookie_secret}" ]]; then
    existing_cookie_secret="$(generate_secret)"
  fi

  if [[ -z "${existing_profile_cookie_secret}" ]]; then
    existing_profile_cookie_secret="$(generate_secret)"
  fi

  if [[ -z "${existing_hosted_free_relay_secret}" ]]; then
    existing_hosted_free_relay_secret="$(generate_secret)"
  fi

  if [[ -z "${existing_free_usage_quota_secret}" ]]; then
    existing_free_usage_quota_secret="$(generate_secret)"
  fi

  if [[ -z "${existing_premium_internal_secret}" ]]; then
    existing_premium_internal_secret="$(generate_secret)"
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
  upsert_env_line "${env_file}" "BOLT_PROFILE_COOKIE_SECRET" "${existing_profile_cookie_secret}"
  upsert_env_line "${env_file}" "BOLT_HOSTED_FREE_RELAY_SECRET" "${existing_hosted_free_relay_secret}"
  upsert_env_line "${env_file}" "BOLT_FREE_USAGE_QUOTA_SECRET" "${existing_free_usage_quota_secret}"
  upsert_env_line "${env_file}" "BOLT_PREMIUM_INTERNAL_SECRET" "${existing_premium_internal_secret}"
  upsert_env_line "${env_file}" "BOLT_RUNTIME_CONTROL_URL" "http://127.0.0.1:${RUNTIME_PORT}/runtime"
  upsert_env_line "${env_file}" "BOLT_RUNTIME_CONTROL_PUBLIC_URL" "${APP_DOMAIN:+https://${APP_DOMAIN}/runtime}"
  upsert_env_line "${env_file}" "BOLT_APP_PUBLIC_URL" "${APP_DOMAIN:+https://${APP_DOMAIN}}"
  upsert_env_line "${env_file}" "BOLT_ADMIN_PANEL_PUBLIC_URL" "${ADMIN_DOMAIN:+https://${ADMIN_DOMAIN}}"
  upsert_env_line "${env_file}" "BOLT_CREATE_TRIAL_PUBLIC_URL" "${CREATE_DOMAIN:+https://${CREATE_DOMAIN}}"
  upsert_env_line "${env_file}" "BOLT_FREE_DAILY_TOKEN_LIMIT" "100"
  upsert_env_line "${env_file}" "BOLT_CUSTOM_DOMAIN_TOKEN_ALLOWANCE" "10000"
  upsert_env_line "${env_file}" "BOLT_STRIPE_CUSTOM_DOMAIN_PRICE_USD" "5"
  upsert_env_line "${env_file}" "BOLT_PROJECT_DATABASE_ENABLED" "false"
  upsert_env_line "${env_file}" "BOLT_PROJECT_CONNECTION_SECRET_ROOT" "${RUNTIME_WORKSPACE_DIR}/project-connections"

  # Preserve the authentication mode of an existing hosted installation.
  local existing_auth_mode existing_admin_url existing_admin_password owner_token
  existing_auth_mode="$(read_env_value "${env_file}" "BOLT_SELF_HOST_MODE")"
  existing_admin_url="$(read_env_value "${env_file}" "BOLT_ADMIN_DATABASE_URL")"
  existing_admin_password="$(read_env_value "${env_file}" "BOLT_ADMIN_DATABASE_PASSWORD")"
  if [[ -z "${existing_auth_mode}" && "${INSTALL_POSTGRES}" -eq 0 && -z "${existing_admin_url}${existing_admin_password}" ]]; then
    existing_auth_mode="single-user"
    upsert_env_line "${env_file}" "BOLT_SELF_HOST_MODE" "${existing_auth_mode}"
  fi
  if [[ "${existing_auth_mode}" == "single-user" ]]; then
    owner_token="$(read_env_value "${env_file}" "BOLT_SELF_HOST_ACCESS_TOKEN")"
    if [[ -z "${owner_token}" ]]; then
      owner_token="$(generate_secret)"
      upsert_env_line "${env_file}" "BOLT_SELF_HOST_ACCESS_TOKEN" "${owner_token}"
    fi
    log "Single-owner login enabled. Read BOLT_SELF_HOST_ACCESS_TOKEN in the protected ${env_file} to sign in."
  fi

  if [[ -n "${BOLT_STRIPE_PUBLISHABLE_KEY:-}" ]]; then
    upsert_env_line "${env_file}" "BOLT_STRIPE_PUBLISHABLE_KEY" "${BOLT_STRIPE_PUBLISHABLE_KEY}"
  fi

  if [[ -n "${BOLT_STRIPE_SECRET_KEY:-}" ]]; then
    upsert_env_line "${env_file}" "BOLT_STRIPE_SECRET_KEY" "${BOLT_STRIPE_SECRET_KEY}"
  fi

  if [[ -n "${BOLT_STRIPE_WEBHOOK_SECRET:-}" ]]; then
    upsert_env_line "${env_file}" "BOLT_STRIPE_WEBHOOK_SECRET" "${BOLT_STRIPE_WEBHOOK_SECRET}"
  fi

  if [[ "${INSTALL_POSTGRES}" -eq 1 ]]; then
    upsert_env_line "${env_file}" "BOLT_ADMIN_DATABASE_HOST" "127.0.0.1"
    upsert_env_line "${env_file}" "BOLT_ADMIN_DATABASE_PORT" "5432"
    upsert_env_line "${env_file}" "BOLT_ADMIN_DATABASE_NAME" "${POSTGRES_DB}"
    upsert_env_line "${env_file}" "BOLT_ADMIN_DATABASE_USER" "${POSTGRES_USER}"
    upsert_env_line "${env_file}" "BOLT_ADMIN_DATABASE_PASSWORD" "${POSTGRES_PASSWORD}"
    upsert_env_line "${env_file}" "BOLT_ADMIN_DATABASE_SSL" "disable"
  fi

  local stripe_publishable stripe_secret stripe_webhook
  stripe_publishable="$(read_env_value "${env_file}" "BOLT_STRIPE_PUBLISHABLE_KEY")"
  stripe_secret="$(read_env_value "${env_file}" "BOLT_STRIPE_SECRET_KEY")"
  stripe_webhook="$(read_env_value "${env_file}" "BOLT_STRIPE_WEBHOOK_SECRET")"

  if [[ -n "${stripe_publishable}${stripe_secret}${stripe_webhook}" ]] && [[ -z "${stripe_publishable}" || -z "${stripe_secret}" || -z "${stripe_webhook}" ]]; then
    warn "Stripe billing is only partially configured. Set publishable, secret, and webhook keys together before enabling paid upgrades."
  fi

  chmod 600 "${env_file}"

  mkdir -p "${RUNTIME_WORKSPACE_DIR}"
}

seed_operator_registry() {
  local registry_path="${RUNTIME_WORKSPACE_DIR}/tenant-registry.json"
  local needs_operator_setup=0

  if tenant_registry_requires_operator_setup "${registry_path}"; then
    needs_operator_setup=1
  fi

  if [[ "${needs_operator_setup}" -eq 1 ]]; then
    if is_interactive_install; then
      if [[ "${OPERATOR_USERNAME_SET_BY_FLAG}" -eq 0 ]]; then
        OPERATOR_USERNAME="$(prompt_required_line "Private operator/admin username" "${OPERATOR_USERNAME:-${DEFAULT_OPERATOR_USERNAME}}")"
      fi

      if [[ "${OPERATOR_PASSWORD_SET_BY_FLAG}" -eq 0 && -z "${OPERATOR_PASSWORD}" ]]; then
        OPERATOR_PASSWORD="$(prompt_confirmed_secret_line "Private operator/admin password" "Confirm private operator/admin password")"
      fi
    elif [[ -z "${OPERATOR_PASSWORD}" ]]; then
      fail "Fresh non-interactive installs require --operator-password so the private admin panel does not fall back to admin/admin."
    fi
  fi

  if [[ -z "${OPERATOR_PASSWORD}" && "${needs_operator_setup}" -eq 0 && "${OPERATOR_PASSWORD_SET_BY_FLAG}" -eq 0 && "${OPERATOR_USERNAME_SET_BY_FLAG}" -eq 0 ]]; then
    return
  fi

  if [[ -z "${OPERATOR_PASSWORD}" ]]; then
    fail "Operator password was not provided."
  fi

  validate_operator_username "${OPERATOR_USERNAME}"

  local operator_password_hash
  operator_password_hash="$(hash_tenant_secret "${OPERATOR_PASSWORD}")"
  unset OPERATOR_PASSWORD

  python3 - "${registry_path}" "${OPERATOR_USERNAME}" "${operator_password_hash}" <<'PY'
import datetime
import hashlib
import json
import pathlib
import sys

registry_path = pathlib.Path(sys.argv[1])
username = sys.argv[2].strip() or 'admin'
password_hash = sys.argv[3].strip()
default_hash = hashlib.sha256(b'admin').hexdigest()
now = datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat().replace('+00:00', 'Z')

try:
    data = json.loads(registry_path.read_text(encoding='utf-8')) if registry_path.exists() else {}
except Exception:
    data = {}

admin = data.get('admin') or {}
tenants = data.get('tenants') if isinstance(data.get('tenants'), list) else []
audit_trail = data.get('auditTrail') if isinstance(data.get('auditTrail'), list) else []
current_hash = str(admin.get('passwordHash') or '').strip()
current_username = str(admin.get('username') or '').strip()

should_seed = not current_hash or current_hash == default_hash or current_username == username or not current_username

if should_seed:
    admin = {
        'username': username,
        'passwordHash': password_hash,
        'mustChangePassword': False,
        'updatedAt': now,
        'passwordUpdatedAt': now,
        'lastLoginAt': admin.get('lastLoginAt') if isinstance(admin.get('lastLoginAt'), str) else None,
    }
else:
    admin.setdefault('mustChangePassword', False)
    admin.setdefault('updatedAt', now)
    admin.setdefault('passwordUpdatedAt', admin.get('updatedAt') or now)
    admin.setdefault('lastLoginAt', None)

data = {
    'admin': admin,
    'tenants': tenants,
    'auditTrail': audit_trail[-200:],
}

registry_path.parent.mkdir(parents=True, exist_ok=True)
registry_path.write_text(json.dumps(data, indent=2) + '\n', encoding='utf-8')
PY
}

setup_local_postgres() {
  if [[ "${INSTALL_POSTGRES}" -ne 1 ]]; then
    return
  fi

  need_cmd systemctl
  need_cmd psql

  log "Configuring local PostgreSQL database '${POSTGRES_DB}'"
  retry_command 3 3 "postgresql startup" sudo systemctl enable --now postgresql \
    || fail "Unable to start PostgreSQL."
  local postgres_password_sql="${POSTGRES_PASSWORD//\'/\'\'}"

  local role_exists
  role_exists="$(sudo -u postgres psql -X -v ON_ERROR_STOP=1 -tAc "SELECT 1 FROM pg_roles WHERE rolname='${POSTGRES_USER}'")"
  if [[ "${role_exists}" == "1" ]]; then
    log "Existing PostgreSQL role retained without changing its password or privileges"
  else
    sudo -u postgres psql -X -v ON_ERROR_STOP=1 -c "CREATE ROLE \"${POSTGRES_USER}\" WITH LOGIN PASSWORD '${postgres_password_sql}';" >/dev/null
  fi

  local database_owner
  database_owner="$(sudo -u postgres psql -X -v ON_ERROR_STOP=1 -tAc "SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname='${POSTGRES_DB}'")"
  if [[ -n "${database_owner}" && "${database_owner}" != "${POSTGRES_USER}" ]]; then
    fail "Existing database belongs to a different role. Choose a dedicated database; existing ownership was not changed."
  fi
  if [[ -z "${database_owner}" ]]; then
    sudo -u postgres createdb -O "${POSTGRES_USER}" "${POSTGRES_DB}"
    sudo -u postgres psql -X -v ON_ERROR_STOP=1 -c "REVOKE CONNECT ON DATABASE \"${POSTGRES_DB}\" FROM PUBLIC; GRANT CONNECT ON DATABASE \"${POSTGRES_DB}\" TO \"${POSTGRES_USER}\";" >/dev/null
  fi

  retry_command 3 2 "postgresql verification" \
    env PGPASSWORD="${POSTGRES_PASSWORD}" psql -h 127.0.0.1 -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -c 'SELECT 1' >/dev/null \
    || fail "PostgreSQL was installed but the configured database credentials did not verify."

}

install_dependencies() {
  log "Installing project dependencies"
  (
    cd "${INSTALL_DIR}"
    if pnpm install --frozen-lockfile; then
      exit 0
    fi

    warn "pnpm install --frozen-lockfile failed; repairing dependency state and retrying"
    repair_repo_dependencies

    if pnpm install --frozen-lockfile; then
      exit 0
    fi

    warn "pnpm install retry failed; removing node_modules and attempting one clean install"
    rm -rf node_modules
    repair_repo_dependencies
    pnpm install --force --frozen-lockfile
  ) || fail "Unable to install project dependencies after recovery attempts."
}

build_application() {
  log "Building production bundle with ${NODE_HEAP_MB} MB Node heap"
  local build_backup
  build_backup="$(mktemp -d "${INSTALL_DIR}/.build-backup.XXXXXX")"
  if [[ -d "${INSTALL_DIR}/build" ]]; then
    cp -a "${INSTALL_DIR}/build" "${build_backup}/build"
  fi
  (
    cd "${INSTALL_DIR}"
    export NODE_OPTIONS="--max-old-space-size=${NODE_HEAP_MB}"
    if pnpm run build; then
      exit 0
    fi

    warn "Build failed on first attempt; clearing generated artifacts and retrying once"
    rm -rf build node_modules/.vite
    repair_repo_dependencies
    pnpm run build
  ) || {
    rm -rf "${INSTALL_DIR}/build"
    if [[ -d "${build_backup}/build" ]]; then
      mv "${build_backup}/build" "${INSTALL_DIR}/build"
    fi
    rmdir "${build_backup}"
    fail "Build failed after recovery. Previous build artifacts were restored; services were not restarted."
  }
  rm -rf "${build_backup}"
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
export NODE_OPTIONS="\${BOLT_APP_NODE_OPTIONS:---max-old-space-size=1536}"
exec node scripts/start-pages-production.mjs --ip 0.0.0.0 --port "\${PORT}"
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
  write_service_unit "${RUNTIME_SERVICE}" "bolt.gives hosted runtime server" "${INSTALL_DIR}/bin/start-runtime.sh" "" "" "${RUNTIME_PORT}"
  local app_after="${COLLAB_SERVICE}.service ${WEBBROWSE_SERVICE}.service ${RUNTIME_SERVICE}.service"
  local app_wants="${COLLAB_SERVICE}.service ${WEBBROWSE_SERVICE}.service ${RUNTIME_SERVICE}.service"

  if [[ "${INSTALL_POSTGRES}" -eq 1 ]]; then
    app_after="${app_after} postgresql.service"
    app_wants="${app_wants} postgresql.service"
  fi

  write_service_unit "${APP_SERVICE}" "bolt.gives app server" "${INSTALL_DIR}/bin/start-app.sh" "${app_after}" "${app_wants}" "${APP_PORT}"

  sudo systemctl daemon-reload
  retry_command 2 3 "enable/start systemd services" \
    sudo systemctl enable --now "${COLLAB_SERVICE}" "${WEBBROWSE_SERVICE}" "${RUNTIME_SERVICE}" "${APP_SERVICE}" \
    || fail "Unable to enable or start the bolt.gives services."
  # enable --now does not reload an already running service after an update.
  retry_command 2 3 "activate updated services" sudo systemctl restart \
    "${COLLAB_SERVICE}" "${WEBBROWSE_SERVICE}" "${RUNTIME_SERVICE}" "${APP_SERVICE}" \
    || fail "Updated services failed to restart. Check journalctl before retrying."

  local service_name
  for service_name in "${COLLAB_SERVICE}" "${WEBBROWSE_SERVICE}" "${RUNTIME_SERVICE}" "${APP_SERVICE}"; do
    ensure_service_active "${service_name}" || fail "${service_name} failed to reach the active state."
  done
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
  local runtime_upstream="${RUNTIME_PORT}"
  if [[ "$(read_env_value "${INSTALL_DIR}/.env.local" BOLT_SELF_HOST_MODE)" == "single-user" ]]; then
    # Owner authentication must run before runtime HTTP and WebSocket traffic.
    runtime_upstream="${APP_PORT}"
  fi

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
		reverse_proxy 127.0.0.1:${runtime_upstream}
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
  local caddy_fragment="/etc/caddy/Caddyfile.d/${SERVICE_PREFIX}.caddy"
  local backup_dir
  backup_dir="$(mktemp -d)"
  if sudo test -f /etc/caddy/Caddyfile; then
    sudo cp -a /etc/caddy/Caddyfile "${backup_dir}/Caddyfile"
  fi
  if sudo test -f "${caddy_fragment}"; then
    sudo cp -a "${caddy_fragment}" "${backup_dir}/fragment"
  fi
  ensure_caddy_import
  local fragment_content

  fragment_content="$(write_caddy_site "${APP_DOMAIN}" "")"
  fragment_content+=$'\n\n'
  fragment_content+="$(write_caddy_site "${ADMIN_DOMAIN}" "/tenant-admin")"

  if [[ -n "${CREATE_DOMAIN}" ]]; then
    fragment_content+=$'\n\n'
    fragment_content+="$(write_caddy_site "${CREATE_DOMAIN}" "/managed-instances")"
  fi

  if ! printf '%s\n' "${fragment_content}" | sudo tee "${caddy_fragment}" >/dev/null \
    || ! sudo caddy fmt --overwrite "${caddy_fragment}" >/dev/null \
    || ! retry_command 2 2 "caddy validate" sudo caddy validate --config /etc/caddy/Caddyfile >/dev/null; then
    restore_caddy_config "${backup_dir}" "${caddy_fragment}"
    fail "Caddy validation failed. Previous configuration restored; the running proxy was not restarted."
  fi
  retry_command 2 2 "caddy enable/start" sudo systemctl enable --now caddy \
    || { restore_caddy_config "${backup_dir}" "${caddy_fragment}"; fail "Unable to start Caddy; previous configuration restored."; }

  if ! retry_command 2 2 "caddy reload" sudo systemctl reload caddy; then
    restore_caddy_config "${backup_dir}" "${caddy_fragment}"
    fail "Caddy reload failed. Previous configuration restored. The shared proxy was not forcibly restarted."
  fi

  sudo systemctl is-active --quiet caddy || fail "Caddy is not active after configuration."
  sudo rm -rf "${backup_dir}"
}

restore_caddy_config() {
  local backup_dir="$1"
  local fragment="$2"
  if sudo test -f "${backup_dir}/Caddyfile"; then
    sudo cp -a "${backup_dir}/Caddyfile" /etc/caddy/Caddyfile
  else
    sudo rm -f /etc/caddy/Caddyfile
  fi
  if sudo test -f "${backup_dir}/fragment"; then
    sudo cp -a "${backup_dir}/fragment" "${fragment}"
  else
    sudo rm -f "${fragment}"
  fi
  sudo rm -rf "${backup_dir}"
}

wait_for_http() {
  local url="$1"
  local attempts="${2:-30}"
  local delay="${3:-2}"

  for ((i=1; i<=attempts; i++)); do
    if curl --connect-timeout 5 --max-time 15 -fsS "${url}" >/dev/null 2>&1; then
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
  local operator_username_summary="not configured"

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

  operator_username_summary="$(read_seeded_operator_username "${RUNTIME_WORKSPACE_DIR}/tenant-registry.json")"
  operator_username_summary="${operator_username_summary:-${OPERATOR_USERNAME:-${DEFAULT_OPERATOR_USERNAME}}}"

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

Private operator login:
  panel      $(if [[ "${admin_url}" != "not configured" ]]; then printf '%s/tenant-admin' "${admin_url}"; else printf 'https://<admin-domain>/tenant-admin'; fi)
  username   ${operator_username_summary}
  password   chosen during install (not displayed again)

Local PostgreSQL:
  enabled    $(if [[ "${INSTALL_POSTGRES}" -eq 1 ]]; then printf 'yes'; else printf 'no'; fi)
  database   $(if [[ "${INSTALL_POSTGRES}" -eq 1 ]]; then printf '%s' "${POSTGRES_DB}"; else printf 'n/a'; fi)
  user       $(if [[ "${INSTALL_POSTGRES}" -eq 1 ]]; then printf '%s' "${POSTGRES_USER}"; else printf 'n/a'; fi)

Next steps:
  1. Ensure your DNS A records point the chosen app/admin/create domains at this VPS before relying on public HTTPS.
  2. Edit ${INSTALL_DIR}/.env.local and add any provider keys you want to use.
     Keep server-side secrets such as MAGNET_API_KEY private; never place them in browser code or commits.
  3. Sign in to the private operator panel with the username above and the password you chose during install.
     The installer seeds the local tenant registry with that private password and does not store the raw value in Git or browser code.
  4. Restart services after editing secrets:
     sudo systemctl restart ${APP_SERVICE} ${COLLAB_SERVICE} ${WEBBROWSE_SERVICE} ${RUNTIME_SERVICE}
  5. Check service health:
     sudo systemctl status ${APP_SERVICE} --no-pager
EOF
}

main() {
  parse_args "$@"
  require_non_root
  require_ubuntu
  umask 077
  need_cmd flock
  exec 9>"${HOME}/.bolt-gives-install.lock"
  flock -n 9 || fail "Another bolt.gives installation is running for this user. Wait for it to finish before retrying."
  trap 'report_install_failure "$?" "$LINENO"' ERR
  prompt_for_missing_config
  normalize_config_inputs

  if [[ "${INSTALL_DEPS}" -eq 1 ]]; then
    INSTALL_STAGE=system-dependencies
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

  INSTALL_STAGE=repository
  clone_or_update_repo
  INSTALL_STAGE=configuration
  prepare_env_file
  seed_operator_registry
  setup_local_postgres
  INSTALL_STAGE=project-dependencies
  install_dependencies
  write_launcher_scripts

  if [[ "${BUILD_APP}" -eq 1 ]]; then
    INSTALL_STAGE=build
    build_application
  fi

  if [[ "${INSTALL_SERVICE}" -eq 1 ]]; then
    INSTALL_STAGE=services
    install_systemd_services
    INSTALL_STAGE=https-proxy
    configure_caddy
    INSTALL_STAGE=health-verification

    if ! wait_for_http "http://127.0.0.1:${APP_PORT}" 45 2; then
      warn "Application health check failed after first startup; restarting the service stack once"
      recover_services "${COLLAB_SERVICE}" "${WEBBROWSE_SERVICE}" "${RUNTIME_SERVICE}" "${APP_SERVICE}"
    fi

    if wait_for_http "http://127.0.0.1:${APP_PORT}" 30 2; then
      log "Application responded on http://127.0.0.1:${APP_PORT}"
    else
      fail "Install finished but the app did not respond on http://127.0.0.1:${APP_PORT}. Check systemd logs."
    fi
  fi

  print_summary
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
