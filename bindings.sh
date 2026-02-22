#!/usr/bin/env bash
set -euo pipefail

SOURCE_FILE="${1:-.env.local}"
TARGET_FILE="${2:-.dev.vars}"

if [[ ! -f "${SOURCE_FILE}" ]]; then
  exit 0
fi

awk -F= '
  /^\s*#/ || NF == 0 { next }
  {
    key=$1
    sub(/^[[:space:]]+|[[:space:]]+$/, "", key)
    value=substr($0, index($0, "=") + 1)
    if (key != "") {
      print key "=" value
    }
  }
' "${SOURCE_FILE}" > "${TARGET_FILE}"

chmod 600 "${TARGET_FILE}" || true

echo "bindings.sh: wrote ${TARGET_FILE}. Use wrangler pages dev without --binding flags." >&2
