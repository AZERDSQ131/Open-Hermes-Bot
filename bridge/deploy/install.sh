#!/usr/bin/env bash
# Install the bridge on the machine that runs Hermes.
#
#   ./bridge/deploy/install.sh
#
# Copies the package next to the user's home, installs the systemd unit that
# keeps it running, and prints what is left to do (pair a phone, publish it).
set -euo pipefail

here=$(cd "$(dirname "$0")/.." && pwd)
user=$(id -un)
home=$(getent passwd "$user" | cut -d: -f6)
target="$home/hermes-bridge"
unit=/etc/systemd/system/hermes-bridge.service

python=$(command -v python3)
"$python" -c 'import yaml' >/dev/null 2>&1 || {
  echo "PyYAML is missing: apt install python3-yaml" >&2
  exit 1
}

install -d "$target"
if [ "$here" != "$target" ]; then
  # --delete so an old module cannot linger after a rename.
  rsync -a --delete --exclude '__pycache__' --exclude '*.pyc' "$here/" "$target/"
fi

sed -e "s|@USER@|$user|g" -e "s|@HOME@|$home|g" \
  "$here/deploy/hermes-bridge.service" \
  | sudo tee "$unit" >/dev/null

sudo systemctl daemon-reload
sudo systemctl enable --now hermes-bridge.service

sleep 1
sudo systemctl --no-pager --lines=5 status hermes-bridge.service || true

cat <<EOF

The bridge is running on 127.0.0.1:8765 and is not reachable from outside yet.

Pair a phone:
  cd $target && $python -m hermes_bridge pair

Publish it to the tailnet, in HTTPS:
  sudo tailscale serve --bg --https=443 http://127.0.0.1:8765

Then check it from another machine on the tailnet:
  curl https://\$(tailscale status --json | python3 -c 'import json,sys; print(json.load(sys.stdin)["Self"]["DNSName"].rstrip("."))')/v1/health
EOF
