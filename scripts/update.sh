#!/usr/bin/env bash
set -Eeuo pipefail

# Use the same guarded clean/repair path as supported Linux installations.
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname -- "${SCRIPT_DIR}")"

exec bash "${PROJECT_ROOT}/install.sh" --install-dir "${PROJECT_ROOT}" "$@"
