#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Build the production images on THIS machine and send them to the server, so the server
# never builds anything (a small server runs out of memory building Next.js / the API).
#
#   infra/docker/deploy.sh                 # api web shop admin
#   infra/docker/deploy.sh shop admin      # only these
#   infra/docker/deploy.sh --migrate api   # + prisma migrate deploy
#   TALAD_SERVER=user@other-host infra/docker/deploy.sh   # another server
#
# Only changed layers are uploaded: a small registry runs on the server (127.0.0.1:5055, the
# `talad-registry` container) and images are pushed to it through the SSH connection with
# crane. Dependencies (~500 MB) go up once; a code change sends a few MB.
#
# SSH: one connection is reused for the whole run, so a password is asked at most once.
# With an SSH key (ssh-copy-id root@168.144.248.232) it isn't asked at all.
#
# Needs here: Docker, crane (brew install crane), the apps' .env.production files (public
# URLs baked into the build).
# Needs on the server: the repository at TALAD_DIR (for the compose file), its
# infra/docker/.env.prod and services/api/.env.production, and SSH access.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SERVER="${TALAD_SERVER:-root@168.144.248.232}"
DIR="${TALAD_DIR:-/var/www/talad-online}"
PLATFORM="${TALAD_PLATFORM:-linux/amd64}" # the server's CPU (Intel/AMD)
COMPOSE="docker compose -f infra/docker/docker-compose.prod.yml --env-file infra/docker/.env.prod"
REGISTRY_PORT="${TALAD_REGISTRY_PORT:-5055}" # on the server's 127.0.0.1
# This machine's end of the tunnel: any free port, so a leftover run can't block it.
TUNNEL_PORT="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1])')"
REGISTRY="localhost:$TUNNEL_PORT"

MIGRATE=0
SERVICES=()
for arg in "$@"; do
  case "$arg" in
    --migrate) MIGRATE=1 ;;
    api | web | shop | admin) SERVICES+=("$arg") ;;
    *) echo "Unknown argument: $arg (use api, web, shop, admin, --migrate)" >&2; exit 1 ;;
  esac
done
[ ${#SERVICES[@]} -eq 0 ] && SERVICES=(api web shop admin)

command -v crane >/dev/null || { echo "crane is missing: brew install crane" >&2; exit 1; }
cd "$(dirname "$0")/../.."
TMP="$(mktemp -d)"

# Reuse one SSH connection for every step below (password asked once, closed on exit).
SOCKET="/tmp/talad-ssh-$$" # short path: SSH sockets are limited to ~100 characters
ssh() { command ssh -o ControlMaster=auto -o ControlPath="$SOCKET" -o ControlPersist=yes "$@"; }
trap 'command ssh -o ControlPath="$SOCKET" -O exit "$SERVER" 2>/dev/null || true; rm -rf "$TMP"' EXIT
ssh "$SERVER" true

# The registry on the server (started once, ~10 MB of RAM), reached through the SSH connection.
ssh "$SERVER" "docker start talad-registry >/dev/null 2>&1 || docker run -d --name talad-registry \
  --restart unless-stopped -p 127.0.0.1:$REGISTRY_PORT:5000 -v talad-registry:/var/lib/registry \
  -e REGISTRY_STORAGE_DELETE_ENABLED=true registry:2 >/dev/null"
ssh -O forward -L "$TUNNEL_PORT:127.0.0.1:$REGISTRY_PORT" "$SERVER"
for _ in 1 2 3 4 5 6 7 8 9 10; do crane catalog --insecure "$REGISTRY" >/dev/null 2>&1 && break; sleep 1; done

for s in "${SERVICES[@]}"; do
  echo "▶ $s: building for $PLATFORM"
  docker buildx build --platform "$PLATFORM" -f infra/docker/Dockerfile --target "$s" -t "talad/$s" --load .

  echo "▶ $s: uploading changed layers to $SERVER"
  docker save "talad/$s" -o "$TMP/$s.tar"
  crane push --insecure "$TMP/$s.tar" "$REGISTRY/talad/$s:latest" > "$TMP/push.log" 2>&1 \
    || { cat "$TMP/push.log" >&2; exit 1; }
  echo "  $(grep -c 'pushed blob' "$TMP/push.log" || true) new layer(s) uploaded"
  rm -f "$TMP/$s.tar"
  ssh "$SERVER" "docker pull -q 127.0.0.1:$REGISTRY_PORT/talad/$s:latest >/dev/null \
    && docker tag 127.0.0.1:$REGISTRY_PORT/talad/$s:latest talad/$s:latest"

  if [ "$s" = api ] && [ "$MIGRATE" = 1 ]; then
    echo "▶ api: applying database migrations"
    ssh "$SERVER" "cd '$DIR' && $COMPOSE run --rm api pnpm db:deploy"
  fi

  echo "▶ $s: restarting"
  ssh "$SERVER" "cd '$DIR' && $COMPOSE up -d --no-build $s"
done

# Drop replaced layers from the registry and old images from Docker.
ssh "$SERVER" 'docker exec talad-registry registry garbage-collect --delete-untagged /etc/docker/registry/config.yml >/dev/null 2>&1; docker image prune -f >/dev/null'
echo "✔ Deployed: ${SERVICES[*]}"
