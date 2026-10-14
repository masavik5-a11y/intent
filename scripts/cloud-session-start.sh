#!/bin/bash
# Prepares a Claude Code cloud session (docs/ARCHITECTURE.md, section 14, "Cloud
# sessions"). Run by the SessionStart hook in .claude/settings.json; does nothing on
# Filip's PC or any other local machine.
#
# 1. The project needs Node 24 (package.json engines, CI); cloud VMs ship Node 22. Install
#    the latest 24.x from nodejs.org once, checksum-verified, and put it first on PATH for
#    every later command through CLAUDE_ENV_FILE.
# 2. Run npm ci when node_modules is missing or was installed from another lockfile.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(pwd)}"

NODE_MAJOR=24
NODE_HOME="$HOME/.node$NODE_MAJOR"

node_major() {
  node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0
}

if [ "$(node_major)" -lt "$NODE_MAJOR" ]; then
  if [ ! -x "$NODE_HOME/bin/node" ]; then
    case "$(uname -m)" in
      x86_64) arch=x64 ;;
      aarch64 | arm64) arch=arm64 ;;
      *) echo "No Node build for $(uname -m)" >&2; exit 1 ;;
    esac
    base="https://nodejs.org/dist/latest-v$NODE_MAJOR.x"
    sums=$(curl -fsSL "$base/SHASUMS256.txt")
    file=$(printf '%s\n' "$sums" | awk -v a="linux-$arch.tar.xz" '$2 ~ a"$" { print $2; exit }')
    tmp=$(mktemp -d)
    curl -fsSL -o "$tmp/$file" "$base/$file"
    (cd "$tmp" && printf '%s\n' "$sums" | grep " $file\$" | sha256sum -c - >/dev/null)
    mkdir -p "$NODE_HOME"
    tar -xJf "$tmp/$file" -C "$NODE_HOME" --strip-components=1
    rm -rf "$tmp"
  fi
  export PATH="$NODE_HOME/bin:$PATH"
  if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
    echo "export PATH=\"$NODE_HOME/bin:\$PATH\"" >>"$CLAUDE_ENV_FILE"
  fi
fi

stamp=node_modules/.package-lock.sha256
want=$(sha256sum package-lock.json | cut -d' ' -f1)
if [ ! -f "$stamp" ] || [ "$(cat "$stamp")" != "$want" ]; then
  npm ci --no-audit --no-fund
  echo "$want" >"$stamp"
fi

echo "Cloud session ready: Node $(node -v), dependencies installed."
