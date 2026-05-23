#!/usr/bin/env bash
# Deploy Fruit Cup Survivors to a remote host via rsync + docker compose.
# Config lives in .env (see .env.example).
#
# Usage:
#   ./deploy.sh                     # build + sync + restart server (always resets in-memory world)
#   ./deploy.sh --reset-map         # reset the live server's in-memory world (no build/sync)
#   ./deploy.sh --reset-scores      # wipe ALL leaderboard scores on the remote (asks to confirm)
#   ./deploy.sh --reset-scores-local # wipe leaderboard scores in your local dev mongo
#   ./deploy.sh --print-nginx       # render the nginx vhost snippet to stdout
#
# The default deploy uses `--force-recreate --no-deps server`, which kills the
# running server container and starts a fresh one. Mongo (and the leaderboard
# it holds) is left untouched.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)"
cd "$SCRIPT_DIR"

# --- Load .env ---
if [[ ! -f .env ]]; then
  echo "Error: .env not found. Copy .env.example to .env and fill it in." >&2
  exit 1
fi
set -a
# shellcheck disable=SC1091
source .env
set +a

# --- Validate required vars ---
: "${DEPLOY_HOST:?DEPLOY_HOST is required in .env}"
: "${DEPLOY_DIR:?DEPLOY_DIR is required in .env}"
: "${BASE_PATH:?BASE_PATH is required in .env (e.g. /survivors/)}"

case "$BASE_PATH" in
  */) ;;
  *) echo "Error: BASE_PATH ('$BASE_PATH') must end with a trailing slash." >&2; exit 1 ;;
esac

# --- Port defaults (overridable via .env) ---
: "${SERVER_PORT:=4000}"
: "${MONGO_PORT:=27017}"
export SERVER_PORT MONGO_PORT

# --- Subcommand: render nginx vhost snippet to stdout ---
if [[ "${1:-}" == "--print-nginx" || "${1:-}" == "nginx" ]]; then
  if ! command -v envsubst >/dev/null 2>&1; then
    echo "Error: envsubst not found (install GNU gettext: apt install gettext-base)." >&2
    exit 1
  fi
  BASE_PATH_NOSLASH="${BASE_PATH%/}"
  export BASE_PATH BASE_PATH_NOSLASH DEPLOY_DIR
  envsubst '$BASE_PATH $BASE_PATH_NOSLASH $DEPLOY_DIR $SERVER_PORT' \
    < "$SCRIPT_DIR/deploy/nginx.survivors.conf"
  exit 0
fi

# --- SSH / rsync setup ---
SSH_OPTS=()
RSYNC_SSH_CMD="ssh"
if [[ -n "${DEPLOY_SSH_PORT:-}" ]]; then
  SSH_OPTS+=(-p "$DEPLOY_SSH_PORT")
  RSYNC_SSH_CMD="$RSYNC_SSH_CMD -p $DEPLOY_SSH_PORT"
fi
if [[ -n "${DEPLOY_SSH_KEY:-}" ]]; then
  SSH_OPTS+=(-i "$DEPLOY_SSH_KEY")
  RSYNC_SSH_CMD="$RSYNC_SSH_CMD -i $DEPLOY_SSH_KEY"
fi

ssh_remote() {
  ssh "${SSH_OPTS[@]}" "$DEPLOY_HOST" "$@"
}

# --- Restart command: force-recreate the server container to wipe in-memory world state.
# Used by both `--reset-map` (reset-only) and the default deploy (build + sync + restart).
RESET_SERVER_CMD="docker compose -f docker-compose.prod.yml up -d mongo && docker compose -f docker-compose.prod.yml up -d --force-recreate --no-deps server"

# --- Subcommand: reset map only (skips build/sync) ---
if [[ "${1:-}" == "--reset-map" || "${1:-}" == "reset-map" ]]; then
  echo "==> Resetting map on $DEPLOY_HOST (force-recreating server container; mongo/leaderboard untouched)…"
  ssh_remote "cd '$DEPLOY_DIR' && SERVER_PORT='$SERVER_PORT' MONGO_PORT='$MONGO_PORT' $RESET_SERVER_CMD"
  echo "==> Map reset complete (no code redeployed)."
  exit 0
fi

# --- Mongo db name (where the scores collection lives) ---
: "${MONGO_DB:=fcf_survivors}"

# --- Subcommand: wipe ALL leaderboard scores on the remote (destructive, asks first) ---
if [[ "${1:-}" == "--reset-scores" || "${1:-}" == "reset-scores" ]]; then
  echo "⚠️  This permanently deletes ALL leaderboard scores on $DEPLOY_HOST (db '$MONGO_DB', collection 'scores')."
  read -r -p "Type 'y' to confirm: " confirm
  if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
    echo "==> Aborted; no scores were deleted."
    exit 0
  fi
  echo "==> Wiping scores on $DEPLOY_HOST…"
  ssh_remote "cd '$DEPLOY_DIR' && MONGO_PORT='$MONGO_PORT' docker compose -f docker-compose.prod.yml exec -T mongo \
    mongosh --quiet --port '$MONGO_PORT' '$MONGO_DB' \
    --eval 'print(db.scores.deleteMany({}).deletedCount + \" scores deleted\")'"
  echo "==> Leaderboard reset complete."
  exit 0
fi

# --- Subcommand: wipe scores in the LOCAL dev mongo (no prompt; dev data) ---
if [[ "${1:-}" == "--reset-scores-local" || "${1:-}" == "reset-scores-local" ]]; then
  echo "==> Wiping local dev scores (compose service 'mongo', db '$MONGO_DB')…"
  docker compose exec -T mongo \
    mongosh --quiet --port 27017 "$MONGO_DB" \
    --eval 'print(db.scores.deleteMany({}).deletedCount + " scores deleted")'
  echo "==> Local leaderboard reset complete."
  exit 0
fi

# --- Build phase ---
echo "==> Installing workspace deps (bun install)…"
bun install

echo "==> Building client (BASE_PATH=$BASE_PATH)…"
BASE_PATH="$BASE_PATH" bun run build:client

echo "==> Building server bundle…"
bun run build:server

# --- Ensure remote dir exists ---
echo "==> Ensuring $DEPLOY_HOST:$DEPLOY_DIR exists…"
ssh_remote "mkdir -p '$DEPLOY_DIR'"

# --- Rsync phase ---
echo "==> Syncing static client -> $DEPLOY_DIR/static/"
rsync -avz --delete -e "$RSYNC_SSH_CMD" \
  packages/client/dist/ "$DEPLOY_HOST:$DEPLOY_DIR/static/"

echo "==> Syncing server bundle -> $DEPLOY_DIR/server/"
rsync -avz --delete -e "$RSYNC_SSH_CMD" \
  dist/server/ "$DEPLOY_HOST:$DEPLOY_DIR/server/"

echo "==> Syncing docker-compose.prod.yml…"
rsync -avz -e "$RSYNC_SSH_CMD" \
  deploy/docker-compose.prod.yml \
  "$DEPLOY_HOST:$DEPLOY_DIR/"

# --- Restart phase ---
# Always force-recreate the server so the in-memory world is wiped — otherwise
# clients can see ghost entities from the previous server process.
if [[ -n "${RESTART_CMD:-}" ]]; then
  echo "==> Warning: RESTART_CMD is set in your env but is ignored. Deploys always force-recreate the server." >&2
fi
echo "==> Restarting on remote (SERVER_PORT=$SERVER_PORT, MONGO_PORT=$MONGO_PORT; in-memory world will reset)…"
ssh_remote "cd '$DEPLOY_DIR' && SERVER_PORT='$SERVER_PORT' MONGO_PORT='$MONGO_PORT' $RESET_SERVER_CMD"

# --- Done ---
if [[ -n "${PUBLIC_HOST:-}" ]]; then
  SCHEME="${PUBLIC_SCHEME:-https}"
  echo "==> Deployed → ${SCHEME}://${PUBLIC_HOST}${BASE_PATH}"
else
  echo "==> Deployed to ${DEPLOY_HOST}:${DEPLOY_DIR} (set PUBLIC_HOST in .env for a clickable URL)"
fi
