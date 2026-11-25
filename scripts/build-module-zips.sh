#!/usr/bin/env bash
# Build one release ZIP per integration module (v2.3.3).
#
# Usage: bash scripts/build-module-zips.sh [--out DIR] [--version X.Y.Z]
#
# Zips each modules/<platform>/ into
#   dist/licensemanagerpro-<platform>-<app-version>.zip
# excluding dev files (.git, tests, node_modules, __pycache__), then
# verifies each ZIP contains version.json with version == app version,
# and writes dist/manifest.json.
#
# The ZIPs are release assets: do NOT commit them (binary push is
# impossible via the GitHub API). Upload them to the GitHub release
# when the release is created. The Downloads page links directly to
# those release assets, so the module version always matches the
# installed app version (version parity).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$REPO_ROOT/dist"
VERSION=""

while [ $# -gt 0 ]; do
    case "$1" in
        --out) OUT_DIR="$2"; shift 2 ;;
        --version) VERSION="$2"; shift 2 ;;
        *) echo "Unknown argument: $1" >&2; exit 2 ;;
    esac
done

# App version: single source of truth is backend/config.py (APP_VERSION),
# falling back to modules.json.
if [ -z "$VERSION" ]; then
    VERSION="$(python3 -c "import re; m = re.search(r'APP_VERSION = [^\"']*[\"\\']([^\"\\']+)', open('$REPO_ROOT/backend/config.py').read()); print(m.group(1) if m else '')" 2>/dev/null || true)"
fi
if [ -z "$VERSION" ]; then
    VERSION="$(python3 -c "import json; print(json.load(open('$REPO_ROOT/modules.json'))['whmcs']['version'])" 2>/dev/null || true)"
fi
if [ -z "$VERSION" ]; then
    echo "ERROR: could not determine the app version" >&2
    exit 1
fi

PLATFORMS="whmcs woocommerce wordpress joomla prestashop magento opencart shopware drupal odoo"

command -v zip >/dev/null 2>&1 || { echo "ERROR: 'zip' is required" >&2; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo "ERROR: 'python3' is required" >&2; exit 1; }

mkdir -p "$OUT_DIR"
echo "Building module ZIPs for LicenseManagerPro v$VERSION into $OUT_DIR"

manifest_entries=""
fail=0
for platform in $PLATFORMS; do
    src="$REPO_ROOT/modules/$platform"
    zip_name="licensemanagerpro-$platform-$VERSION.zip"
    zip_path="$OUT_DIR/$zip_name"
    if [ ! -d "$src" ]; then
        echo "  FAIL $platform: directory $src missing" >&2
        fail=1
        continue
    fi
    rm -f "$zip_path"
    (cd "$src" && zip -qr "$zip_path" . \
        -x ".git/*" "*/.git/*" "*/tests/*" "*/test/*" "*/node_modules/*" \
           "*/__pycache__/*" "*.pyc" "*.pyo" ".DS_Store" "*/.DS_Store")
    # Verify: the ZIP must contain version.json with version == app version.
    zip_version="$(python3 - "$zip_path" <<'PYEOF'
import json, sys, zipfile
zf = zipfile.ZipFile(sys.argv[1])
names = [n for n in zf.namelist() if n.endswith("version.json")]
if not names:
    print("")
    sys.exit(0)
print(json.loads(zf.read(names[0]).decode("utf-8")).get("version", ""))
PYEOF
)"
    if [ "$zip_version" != "$VERSION" ]; then
        echo "  FAIL $platform: version.json in ZIP is '$zip_version', expected '$VERSION'" >&2
        fail=1
        continue
    fi
    size="$(stat -c%s "$zip_path" 2>/dev/null || stat -f%z "$zip_path")"
    echo "  ok   $platform -> $zip_name (${size} bytes, version $zip_version)"
    manifest_entries="$manifest_entries{\"id\":\"$platform\",\"file\":\"$zip_name\",\"version\":\"$VERSION\",\"size\":$size},"
done

if [ "$fail" -ne 0 ]; then
    echo "ERROR: one or more modules failed verification" >&2
    exit 1
fi

# Manifest (JSON array) for the release upload step.
python3 - "$OUT_DIR" "$VERSION" "$manifest_entries" <<'PYEOF'
import json, sys
out_dir, version, entries = sys.argv[1], sys.argv[2], sys.argv[3]
items = json.loads("[" + entries.rstrip(",") + "]") if entries.strip(",") else []
manifest = {"app_version": version, "modules": items}
with open(f"{out_dir}/manifest.json", "w", encoding="utf-8") as f:
    json.dump(manifest, f, indent=2, sort_keys=True)
    f.write("\n")
print(f"Wrote {out_dir}/manifest.json ({len(items)} modules)")
PYEOF

echo "Done: $(echo "$PLATFORMS" | wc -w) modules, all version $VERSION."
