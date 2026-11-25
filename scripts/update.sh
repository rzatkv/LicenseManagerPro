#!/usr/bin/env bash
# Apply a staged License Manager Pro update (v2.2).
#
# Usage: bash scripts/update.sh [path-to-tarball]
#   The tarball defaults to the newest file in ./updates/.
#
# What it does:
#   1. Extracts the release tarball over the install directory,
#      EXCLUDING .env, *.db, license_manager.db and updates/ itself,
#      so configuration and data survive the update.
#   2. Restarts the service when a systemd unit named license-manager
#      exists; otherwise it prints the manual restart command.
#
# The backend only runs this script automatically when
# LMP_ALLOW_SELF_UPDATE=1; otherwise the admin runs it by hand.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="$(dirname "$SCRIPT_DIR")"
cd "$INSTALL_DIR"

TARBALL="${1:-}"
if [ -z "$TARBALL" ]; then
    TARBALL="$(ls -t updates/license-manager-pro-*.tar.gz 2>/dev/null | head -n 1 || true)"
fi
if [ -z "$TARBALL" ] || [ ! -f "$TARBALL" ]; then
    echo "No staged update tarball found. Stage one first from the admin panel (About → Updates)." >&2
    exit 1
fi

# Safety: the file must be a gzip tarball.
if ! gzip -t "$TARBALL" 2>/dev/null; then
    echo "Refusing to apply $TARBALL: it is not a valid gzip file." >&2
    exit 1
fi

# Safety: no member may escape the extract directory (absolute paths,
# ".." components) and no symlinks/hardlinks/device files are allowed.
if tar -tzf "$TARBALL" | grep -Eq '(^/|(^|/)\.\.(/|$))'; then
    echo "Refusing to apply $TARBALL: archive contains unsafe paths." >&2
    exit 1
fi
if tar -tvzf "$TARBALL" | grep -Eq '^[bcdlps]'; then
    echo "Refusing to apply $TARBALL: archive contains non-regular members." >&2
    exit 1
fi

echo "Applying $TARBALL to $INSTALL_DIR ..."
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT
tar -xzf "$TARBALL" -C "$TMP_DIR" --strip-components=1

# Copy everything except live config/data. (rsync is preferred when
# available; plain cp -a is the fallback.)
EXCLUDES=(--exclude=.env --exclude=*.db --exclude=license_manager.db --exclude=updates)
if command -v rsync >/dev/null 2>&1; then
    rsync -a "${EXCLUDES[@]}" "$TMP_DIR"/ "$INSTALL_DIR"/
else
    # cp fallback: back up the protected files first, copy, then restore.
    BACKUP_DIR="$(mktemp -d)"
    trap 'rm -rf "$TMP_DIR" "$BACKUP_DIR"' EXIT
    cp -a .env "$BACKUP_DIR"/ 2>/dev/null || true
    cp -a -- *.db "$BACKUP_DIR"/ 2>/dev/null || true
    cp -a "$TMP_DIR"/. "$INSTALL_DIR"/
    cp -a "$BACKUP_DIR"/. "$INSTALL_DIR"/ 2>/dev/null || true
fi

echo "Files updated."

if systemctl is-active --quiet license-manager 2>/dev/null; then
    echo "Restarting the license-manager service..."
    systemctl restart license-manager
    echo "Done. The service was restarted."
else
    echo "No running systemd unit named 'license-manager' was found."
    echo "Restart the app yourself, e.g.:"
    echo "  cd $INSTALL_DIR/backend && uvicorn main:app --host 0.0.0.0 --port 8000"
fi
