"""Downloadable integration modules (v2.2).

The module sources live in the repo under modules/<id>/ and the manifest
is modules.json at the repo root. GET /api/downloads lists them;
GET /api/downloads/{id} streams a ZIP built on the fly from the module
directory (no pre-built archives are kept in the repo).
"""
import io
import json
import zipfile
from pathlib import Path

from fastapi import HTTPException

REPO_ROOT = Path(__file__).resolve().parents[2]
MODULES_MANIFEST = REPO_ROOT / "modules.json"
MODULES_DIR = REPO_ROOT / "modules"

# Fallback when modules.json is missing (e.g. a partial checkout): the
# module directories themselves are the source of truth.
KNOWN_MODULES = {
    "whmcs": {
        "name": "WHMCS Module",
        "description": "WHMCS server module: provisions, suspends, renews and terminates licenses from WHMCS.",
    },
    "woocommerce": {
        "name": "WooCommerce Plugin",
        "description": "WordPress plugin: creates a license when a WooCommerce order completes and shows the key to the customer.",
    },
}


def _read_manifest() -> dict:
    try:
        data = json.loads(MODULES_MANIFEST.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def _module_version(module_id: str) -> str:
    version_file = MODULES_DIR / module_id / "version.json"
    try:
        data = json.loads(version_file.read_text(encoding="utf-8"))
        return str(data.get("version", "1.0.0"))
    except (OSError, ValueError, AttributeError):
        return "1.0.0"


def list_downloads() -> list[dict]:
    manifest = _read_manifest()
    items = []
    for module_id in ("whmcs", "woocommerce"):
        info = KNOWN_MODULES[module_id]
        manifest_entry = manifest.get(module_id, {}) if isinstance(manifest, dict) else {}
        items.append(
            {
                "id": module_id,
                "name": manifest_entry.get("name") or info["name"],
                "version": _module_version(module_id),
                "description": manifest_entry.get("description") or info["description"],
                "download_url": f"/api/downloads/{module_id}",
            }
        )
    return items


def build_module_zip(module_id: str) -> tuple[str, bytes]:
    """ZIP the module directory; returns (filename, bytes)."""
    if module_id not in KNOWN_MODULES:
        raise HTTPException(status_code=404, detail=f"Unknown module: {module_id}")
    module_dir = MODULES_DIR / module_id
    if not module_dir.is_dir():
        raise HTTPException(
            status_code=404, detail=f"Module files for '{module_id}' are not installed"
        )
    version = _module_version(module_id)
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for path in sorted(module_dir.rglob("*")):
            if path.is_file():
                arcname = f"licensemanagerpro-{module_id}-{version}/{path.relative_to(module_dir)}"
                zf.write(path, arcname)
    return f"licensemanagerpro-{module_id}-{version}.zip", buffer.getvalue()
