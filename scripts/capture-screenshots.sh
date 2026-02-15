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
pnpm dlx playwright screenshot --browser=chromium --wait-for-timeout 8000 --viewport-size 1600,900 "${BASE_URL}/" "${OUT_DIR}/home.png" >/dev/null 2>&1
pnpm dlx playwright screenshot --browser=chromium --wait-for-timeout 15000 --viewport-size 1600,900 "${BASE_URL}/?prompt=Say%20hello%20from%20bolt.gives%20in%20one%20short%20sentence" "${OUT_DIR}/chat.png" >/dev/null 2>&1
pnpm dlx playwright screenshot --browser=chromium --wait-for-timeout 20000 --viewport-size 1600,900 "${BASE_URL}/?prompt=Plan%20a%20simple%20task%20in%203%20steps%20and%20then%20wait" "${OUT_DIR}/chat-plan.png" >/dev/null 2>&1
pnpm dlx playwright screenshot --browser=chromium --wait-for-timeout 8000 --viewport-size 1600,900 "${BASE_URL}/changelog" "${OUT_DIR}/changelog.png" >/dev/null 2>&1

echo "Wrote:"
ls -1 "${OUT_DIR}" | sed 's/^/  - /'
