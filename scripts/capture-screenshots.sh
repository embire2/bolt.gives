#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${ROOT_DIR}/docs/screenshots"
LOG_FILE="${ROOT_DIR}/.screenshots-dev.log"

PORT="${PORT:-5173}"
BASE_URL="${BASE_URL:-http://localhost:${PORT}}"
SKIP_DEV_SERVER="${SKIP_DEV_SERVER:-0}"

mkdir -p "${OUT_DIR}"

cleanup() {
  if [[ -n "${DEV_PID:-}" ]]; then
    # Stop the whole process group started by setsid.
    kill -- -"${DEV_PID}" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

if [[ "${SKIP_DEV_SERVER}" != "1" ]]; then
  echo "Starting dev server (logs: ${LOG_FILE})..."
  rm -f "${LOG_FILE}"
  setsid pnpm run dev >"${LOG_FILE}" 2>&1 &
  DEV_PID=$!

  echo "Waiting for ${BASE_URL} to respond..."
  for _ in $(seq 1 90); do
    if curl -fsS "${BASE_URL}/" >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done

  if ! curl -fsS "${BASE_URL}/" >/dev/null 2>&1; then
    echo "Dev server did not become ready. See ${LOG_FILE}" >&2
    exit 1
  fi
else
  echo "Skipping dev server startup (SKIP_DEV_SERVER=1)."
  echo "Using BASE_URL=${BASE_URL}"
fi

echo "Capturing screenshots with Playwright (Chromium)..."
BASE_URL="${BASE_URL}" README_SCREENSHOT_DIR="${OUT_DIR}" node "${ROOT_DIR}/scripts/capture-readme-screenshots.mjs" >/dev/null 2>&1
BASE_URL="${BASE_URL}" SYSTEM_ACTION_SCREENSHOT_PATH="${OUT_DIR}/system-in-action.png" node "${ROOT_DIR}/scripts/capture-system-in-action.mjs" >/dev/null 2>&1

echo "Wrote:"
ls -1 "${OUT_DIR}" | sed 's/^/  - /'
