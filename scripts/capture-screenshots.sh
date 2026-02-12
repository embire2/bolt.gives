#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${ROOT_DIR}/docs/screenshots"
LOG_FILE="${ROOT_DIR}/.screenshots-dev.log"

PORT="${PORT:-5173}"
BASE_URL="${BASE_URL:-http://localhost:${PORT}}"

mkdir -p "${OUT_DIR}"

cleanup() {
  if [[ -n "${DEV_PID:-}" ]]; then
    # Stop the whole process group started by setsid.
    kill -- -"${DEV_PID}" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

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

echo "Capturing screenshots with Firefox..."
firefox --headless --window-size 1440,900 --screenshot "${OUT_DIR}/home.png" "${BASE_URL}/" >/dev/null 2>&1
firefox --headless --window-size 1440,900 --screenshot "${OUT_DIR}/chat.png" "${BASE_URL}/?prompt=Hello%20from%20bolt.gives" >/dev/null 2>&1
firefox --headless --window-size 1440,900 --screenshot "${OUT_DIR}/chat-plan.png" "${BASE_URL}/?prompt=Plan%20a%20simple%20task%20in%203%20steps" >/dev/null 2>&1

echo "Wrote:"
ls -1 "${OUT_DIR}" | sed 's/^/  - /'
