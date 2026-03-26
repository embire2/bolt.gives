#!/usr/bin/env bash
set -Eeuo pipefail

REPO_URL="${REPO_URL:-https://github.com/embire2/bolt.gives.git}"
BRANCH="${BRANCH:-main}"
SERVICE_PREFIX="${SERVICE_PREFIX:-bolt-gives}"
APP_PORT="${APP_PORT:-5173}"
COLLAB_PORT="${COLLAB_PORT:-1234}"
WEBBROWSE_PORT="${WEBBROWSE_PORT:-4179}"
NODE_MAJOR="${NODE_MAJOR:-22}"
PNPM_VERSION="${PNPM_VERSION:-9.14.4}"
NODE_HEAP_MB="${NODE_HEAP_MB:-4096}"
INSTALL_DIR="${INSTALL_DIR:-$HOME/bolt.gives}"
INSTALL_DEPS=1
INSTALL_SERVICE=1
BUILD_APP=1

APP_SERVICE="${SERVICE_PREFIX}-app"
COLLAB_SERVICE="${SERVICE_PREFIX}-collab"
WEBBROWSE_SERVICE="${SERVICE_PREFIX}-webbrowse"

usage() {
  cat <<'EOF'
bolt.gives installer

Usage:
  ./install.sh [options]

Options:
  --install-dir PATH   Install/update the repo in PATH (default: $HOME/bolt.gives)
  --branch NAME        Git branch to install (default: main)
  --repo-url URL       Git repository URL to clone/update
  --skip-deps          Skip apt, Node.js, and pnpm installation
  --skip-service       Skip systemd service installation/startup
  --skip-build         Skip production build
  --help               Show this help

Environment overrides:
  INSTALL_DIR, BRANCH, REPO_URL, APP_PORT, COLLAB_PORT, WEBBROWSE_PORT,
  SERVICE_PREFIX, NODE_MAJOR, PNPM_VERSION, NODE_HEAP_MB

Notes:
  - Supported target: Ubuntu 18.04+.
  - Run this script as a regular user with sudo access, not as root.
  - Installer-generated services use a 4 GB Node heap by default.
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

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Required command not found: $1"
}

install_apt_packages() {
  log "Installing Ubuntu base packages"
  sudo apt-get update
  sudo apt-get install -y git curl ca-certificates build-essential
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

prepare_env_file() {
  local env_file="${INSTALL_DIR}/.env.local"

  if [[ ! -f "${env_file}" ]]; then
    log "Creating .env.local from .env.example"
    cp "${INSTALL_DIR}/.env.example" "${env_file}"
  else
    log "Keeping existing .env.local"
  fi

  upsert_env_line "${env_file}" "NODE_OPTIONS" "--max-old-space-size=${NODE_HEAP_MB}"
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

  chmod +x "${INSTALL_DIR}/bin/start-app.sh" "${INSTALL_DIR}/bin/start-collab.sh" "${INSTALL_DIR}/bin/start-webbrowse.sh"
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
  write_service_unit "${APP_SERVICE}" "bolt.gives app server" "${INSTALL_DIR}/bin/start-app.sh" "${COLLAB_SERVICE}.service ${WEBBROWSE_SERVICE}.service" "${COLLAB_SERVICE}.service ${WEBBROWSE_SERVICE}.service" "${APP_PORT}"

  sudo systemctl daemon-reload
  sudo systemctl enable --now "${COLLAB_SERVICE}" "${WEBBROWSE_SERVICE}" "${APP_SERVICE}"
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
  cat <<EOF

bolt.gives install completed.

Install directory:
  ${INSTALL_DIR}

Services:
  ${APP_SERVICE}
  ${COLLAB_SERVICE}
  ${WEBBROWSE_SERVICE}

Ports:
  app        http://127.0.0.1:${APP_PORT}
  collab     ws://127.0.0.1:${COLLAB_PORT}
  webbrowse  http://127.0.0.1:${WEBBROWSE_PORT}

Node heap baseline:
  NODE_OPTIONS=--max-old-space-size=${NODE_HEAP_MB}

Next steps:
  1. Edit ${INSTALL_DIR}/.env.local and add any provider keys you want to use.
  2. Restart services after editing secrets:
     sudo systemctl restart ${APP_SERVICE} ${COLLAB_SERVICE} ${WEBBROWSE_SERVICE}
  3. Check service health:
     sudo systemctl status ${APP_SERVICE} --no-pager
EOF
}

main() {
  parse_args "$@"
  require_non_root
  require_ubuntu

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
  install_dependencies
  write_launcher_scripts

  if [[ "${BUILD_APP}" -eq 1 ]]; then
    build_application
  fi

  if [[ "${INSTALL_SERVICE}" -eq 1 ]]; then
    install_systemd_services

    if wait_for_http "http://127.0.0.1:${APP_PORT}" 45 2; then
      log "Application responded on http://127.0.0.1:${APP_PORT}"
    else
      fail "Install finished but the app did not respond on http://127.0.0.1:${APP_PORT}. Check systemd logs."
    fi
  fi

  print_summary
}

main "$@"
