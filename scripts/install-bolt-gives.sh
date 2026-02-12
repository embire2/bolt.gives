#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/embire2/bolt.gives.git}"
TARGET_DIR="${TARGET_DIR:-bolt.gives}"
BRANCH="${BRANCH:-main}"

command -v git >/dev/null 2>&1 || { echo "git is required"; exit 1; }
command -v node >/dev/null 2>&1 || { echo "node is required"; exit 1; }
command -v pnpm >/dev/null 2>&1 || { echo "pnpm is required (npm i -g pnpm)"; exit 1; }

if [ -d "$TARGET_DIR" ]; then
  echo "Target directory '$TARGET_DIR' already exists"
  exit 1
fi

echo "Cloning $REPO_URL into $TARGET_DIR"
git clone "$REPO_URL" "$TARGET_DIR"
cd "$TARGET_DIR"

echo "Checking out $BRANCH"
git checkout "$BRANCH" || echo "Branch '$BRANCH' not found, using default branch"

echo "Installing dependencies"
pnpm install

if [ -f .env.example ]; then
  cp .env.example .env.local
  cp .env.example .env
fi

echo "Starting bolt.gives development server"
pnpm run dev
