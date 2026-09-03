#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHECKOUT_INSTALLER="${SCRIPT_DIR}/../install.sh"

if [[ -f "${CHECKOUT_INSTALLER}" ]]; then
  exec bash "${CHECKOUT_INSTALLER}" "$@"
fi

command -v curl >/dev/null 2>&1 || {
  printf 'curl is required to download the canonical bolt.gives installer.\n' >&2
  exit 1
}

temporary_installer="$(mktemp)"
trap 'rm -f "${temporary_installer}"' EXIT
curl -fsSL https://raw.githubusercontent.com/embire2/bolt.gives/main/install.sh -o "${temporary_installer}"
bash "${temporary_installer}" "$@"
