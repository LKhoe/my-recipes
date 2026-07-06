#!/usr/bin/env bash
set -euo pipefail

# Load .env
if [[ -f .env ]]; then
  set -o allexport
  source .env
  set +o allexport
else
  echo "Error: .env file not found" >&2
  exit 1
fi

DEPLOY_HOST="${DEPLOY_HOST:?DEPLOY_HOST is not set in .env}"
DEPLOY_USER="${DEPLOY_USER:?DEPLOY_USER is not set in .env}"
DEPLOY_PORT="${DEPLOY_PORT:-22}"
REMOTE_DIR="/home/${DEPLOY_USER}/my-recipes"

# --- Rollback mode ---
if [[ "${1:-}" == "--rollback" ]]; then
  echo "==> Rolling back to previous image..."
  ssh -p "${DEPLOY_PORT}" "${DEPLOY_USER}@${DEPLOY_HOST}" "
    set -euo pipefail
    cd ${REMOTE_DIR}
    docker compose -f docker-compose.yml stop my-recipes
    docker compose -f docker-compose.yml up -d --no-build my-recipes
  "
  echo "==> Rollback complete."
  exit 0
fi

# --- Pre-flight checks ---
CURRENT_BRANCH=$(git branch --show-current)
if [[ "${CURRENT_BRANCH}" != "main" ]]; then
  echo "Warning: You are on branch '${CURRENT_BRANCH}', not 'main'." >&2
  read -rp "Continue anyway? [y/N] " confirm
  [[ "${confirm}" =~ ^[Yy]$ ]] || exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Warning: Working tree has uncommitted changes:" >&2
  git status --short >&2
  read -rp "Continue anyway? [y/N] " confirm
  [[ "${confirm}" =~ ^[Yy]$ ]] || exit 1
fi

START_TIME=$(date +%s)

echo "==> Bumping version..."
npm version patch --no-git-tag-version
git add package.json package-lock.json
git commit -m "chore: bump version for deploy"

echo "==> Pushing to git..."
git push origin "${CURRENT_BRANCH}"

echo "==> Deploying to ${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_PORT}..."
ssh -p "${DEPLOY_PORT}" "${DEPLOY_USER}@${DEPLOY_HOST}" "
  set -euo pipefail
  cd ${REMOTE_DIR}
  git pull origin main

  # Build and restart only the app container — Postgres stays up
  docker compose -f docker-compose.yml build my-recipes
  docker compose -f docker-compose.yml up -d --no-deps my-recipes

  # Wait for health check
  echo '==> Waiting for app to become healthy...'
  retries=0
  max_retries=30
  until [ \"\$(docker inspect --format='{{.State.Health.Status}}' my-recipes 2>/dev/null)\" = 'healthy' ] || [ \$retries -eq \$max_retries ]; do
    retries=\$((retries + 1))
    echo \"  Attempt \$retries/\$max_retries...\"
    sleep 5
  done

  if [ \$retries -eq \$max_retries ]; then
    echo '❌ App failed to become healthy. Check logs with: docker compose logs my-recipes'
    exit 1
  fi
  echo '✅ App is healthy!'
"

ELAPSED=$(( $(date +%s) - START_TIME ))
if (( ELAPSED >= 60 )); then
  echo "==> Done in $(( ELAPSED / 60 ))m $(( ELAPSED % 60 ))s."
else
  echo "==> Done in ${ELAPSED}s."
fi
