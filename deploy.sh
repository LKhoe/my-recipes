#!/usr/bin/env bash
# Deploy to the Raspberry Pi through a Docker context (the build runs on the Pi; nothing is
# cloned there). Postgres and photo storage (S3) are LocalInfra's and keep running. See DEPLOY.md.
#
#   ./deploy.sh              bump the patch version, commit + push, build and restart on the Pi
#   ./deploy.sh --no-bump    same, without the version bump/commit/push
#   ./deploy.sh --rollback   restart the build that was live before the last deploy
#
# Overridable: DEPLOY_CONTEXT (default "umbrel")
set -euo pipefail

cd "$(dirname "$0")"

export DOCKER_CONTEXT="${DEPLOY_CONTEXT:-umbrel}"
CONTAINER=my-recipes
IMAGE=my-recipes

wait_healthy() {
  echo "==> Waiting for ${CONTAINER} to become healthy..."
  local retries=0 max_retries=60 status
  while :; do
    status=$(docker inspect --format '{{.State.Health.Status}}' "$CONTAINER" 2>/dev/null || echo missing)
    [[ "$status" == healthy ]] && { echo "✅ ${CONTAINER} is healthy"; return 0; }
    if (( retries >= max_retries )) || [[ "$status" == unhealthy ]]; then
      echo "❌ ${CONTAINER} did not become healthy (status: ${status}). Last logs:" >&2
      docker logs --tail 60 "$CONTAINER" 2>&1 | sed 's/^/    /' >&2 || true
      exit 1
    fi
    retries=$((retries + 1))
    sleep 5
  done
}

docker info --format '{{.Name}}' >/dev/null 2>&1 \
  || { echo "Docker context '${DOCKER_CONTEXT}' is not reachable (docker context inspect ${DOCKER_CONTEXT})." >&2; exit 1; }

# --- Rollback mode ---
if [[ "${1:-}" == "--rollback" ]]; then
  docker image inspect "${IMAGE}:previous" >/dev/null 2>&1 \
    || { echo "No ${IMAGE}:previous image on '${DOCKER_CONTEXT}' — nothing to roll back to." >&2; exit 1; }
  echo "==> Rolling back to ${IMAGE}:previous on '${DOCKER_CONTEXT}'..."
  docker tag "${IMAGE}:previous" "${IMAGE}:latest"
  docker compose -f docker-compose.yml up -d --no-build --force-recreate "$CONTAINER"
  wait_healthy
  exit 0
fi

bump=true
[[ "${1:-}" == "--no-bump" ]] && bump=false

# --- Pre-flight checks ---
[[ -f .env ]] || { echo "Error: .env not found (compose reads it on this machine)." >&2; exit 1; }
for net in localinfra_postgres localinfra_s3; do
  docker network inspect "$net" >/dev/null 2>&1 \
    || { echo "Network $net not found on '${DOCKER_CONTEXT}' — start LocalInfra first." >&2; exit 1; }
done

CURRENT_BRANCH=$(git branch --show-current)
if [[ "${CURRENT_BRANCH}" != "main" ]]; then
  echo "Warning: You are on branch '${CURRENT_BRANCH}', not 'main'." >&2
  read -rp "Continue anyway? [y/N] " confirm
  [[ "${confirm}" =~ ^[Yy]$ ]] || exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Warning: Working tree has uncommitted changes (they WILL be built into the image):" >&2
  git status --short >&2
  read -rp "Continue anyway? [y/N] " confirm
  [[ "${confirm}" =~ ^[Yy]$ ]] || exit 1
fi

START_TIME=$(date +%s)

if $bump; then
  echo "==> Bumping version..."
  npm version patch --no-git-tag-version
  git add package.json package-lock.json
  git commit -m "chore: bump version for deploy"
  echo "==> Pushing to git..."
  git push origin "${CURRENT_BRANCH}"
fi

# Keep the image that is live right now, for --rollback
if docker image inspect "${IMAGE}:latest" >/dev/null 2>&1; then
  docker tag "${IMAGE}:latest" "${IMAGE}:previous"
fi

echo "==> Building on '${DOCKER_CONTEXT}' (the build runs on the Pi: several minutes)..."
docker compose -f docker-compose.yml build "$CONTAINER"
docker compose -f docker-compose.yml up -d "$CONTAINER"
wait_healthy

ELAPSED=$(( $(date +%s) - START_TIME ))
if (( ELAPSED >= 60 )); then
  echo "==> Done in $(( ELAPSED / 60 ))m $(( ELAPSED % 60 ))s."
else
  echo "==> Done in ${ELAPSED}s."
fi
