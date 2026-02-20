#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/embire2/bolt.gives.git}"
TARGET_DIR="${TARGET_DIR:-bolt.gives}"
BRANCH="${BRANCH:-main}"
NODE_MEMORY_BASELINE_MB="${NODE_MEMORY_BASELINE_MB:-4096}"

if [ -f /etc/os-release ]; then
  # shellcheck disable=SC1091
  . /etc/os-release
fi

if [ "${ID:-}" != "ubuntu" ]; then
  echo "Unsupported platform for install/self-host."
  echo "bolt.gives install/self-host is supported on Ubuntu 18.04+ only."
  echo
  echo "Detected: ${PRETTY_NAME:-unknown}"
  echo "If you are on Windows/macOS, you can still use the hosted web app."
  exit 1
fi

REQUIRED_UBUNTU="18.04"
if [ -n "${VERSION_ID:-}" ]; then
  # Ensure VERSION_ID >= REQUIRED_UBUNTU (lexicographic sort is wrong; use version sort).
  if [ "$(printf '%s\n' "$REQUIRED_UBUNTU" "$VERSION_ID" | sort -V | head -n 1)" != "$REQUIRED_UBUNTU" ]; then
    echo "Unsupported Ubuntu version for install/self-host."
    echo "bolt.gives requires Ubuntu ${REQUIRED_UBUNTU}+."
    echo
    echo "Detected: ${PRETTY_NAME:-Ubuntu $VERSION_ID}"
    exit 1
  fi
fi

command -v git >/dev/null 2>&1 || { echo "git is required"; exit 1; }
command -v node >/dev/null 2>&1 || { echo "node is required"; exit 1; }
command -v pnpm >/dev/null 2>&1 || { echo "pnpm is required (recommended: corepack enable && corepack prepare pnpm@9.15.9 --activate)"; exit 1; }

ensure_node_memory_baseline() {
  local current_mb=0

  if [[ "${NODE_OPTIONS:-}" =~ --max-old-space-size=([0-9]+) ]]; then
    current_mb="${BASH_REMATCH[1]}"
  fi

  if [ "$current_mb" -lt "$NODE_MEMORY_BASELINE_MB" ]; then
    export NODE_OPTIONS="${NODE_OPTIONS:-} --max-old-space-size=${NODE_MEMORY_BASELINE_MB}"
    export NODE_OPTIONS="$(echo "$NODE_OPTIONS" | xargs)"
  fi

  echo "Using NODE_OPTIONS=${NODE_OPTIONS}"
}

if [ -d "$TARGET_DIR" ]; then
  echo "Target directory '$TARGET_DIR' already exists"
  exit 1
fi

echo "Cloning $REPO_URL into $TARGET_DIR"
git clone "$REPO_URL" "$TARGET_DIR"
cd "$TARGET_DIR"

echo "Checking out $BRANCH"
git checkout "$BRANCH" || echo "Branch '$BRANCH' not found, using default branch"

echo "Enforcing Node memory baseline (${NODE_MEMORY_BASELINE_MB}MB)"
ensure_node_memory_baseline

echo "Installing dependencies"
pnpm install

if [ -f .env.example ]; then
  cp .env.example .env.local
  cp .env.example .env
fi

echo "Starting bolt.gives development server"
pnpm run dev
