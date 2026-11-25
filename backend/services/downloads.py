"""Downloadable integration modules (v2.3).

The module sources live in the repo under modules/<id>/ and the manifest
is modules.json at the repo root. GET /api/downloads lists all 10 modules
with DIRECT GitHub release-asset links built from the INSTALLED app
version, so the downloaded module always matches the installed app
(version parity). GET /api/downloads/{id} still streams a ZIP built on
the fly from the module directory as a fallback (e.g. before the release
assets are published).
"""

import io
import json
import zipfile
from pathlib import Path

from fastapi import HTTPException

from config import APP_VERSION

REPO_ROOT = Path(__file__).resolve().parents[2]
MODULES_MANIFEST = REPO_ROOT / "modules.json"
MODULES_DIR = REPO_ROOT / "modules"

GITHUB_RELEASE_BASE = "https://github.com/rzatkv/LicenseManagerPro/releases/download"

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
    "wordpress": {
        "name": "WordPress Plugin",
        "description": "WordPress plugin (no WooCommerce): license minting on demand, a shortcode and a My Licenses page.",
    },
    "joomla": {
        "name": "Joomla Component",
        "description": "Joomla component: admin configuration and license actions via the API.",
    },
    "prestashop": {
        "name": "PrestaShop Module",
        "description": "PrestaShop module: mints a license when an order reaches a paid status.",
    },
    "magento": {
        "name": "Magento Module",
        "description": "Magento 2 module: mints a license when an order is paid, with admin configuration.",
    },
    "opencart": {
        "name": "OpenCart Extension",
        "description": "OpenCart extension: admin settings and license minting on order completion.",
    },
    "shopware": {
        "name": "Shopware Plugin",
        "description": "Shopware 6 plugin: mints a license when an order is placed/paid.",
    },
    "drupal": {
        "name": "Drupal Module",
        "description": "Drupal module: settings form and a /user/licenses page for customers.",
    },
    "odoo": {
        "name": "Odoo Module",
        "description": "Odoo module: license model, portal page and minting on sale order confirmation.",
    },
}

# The canonical order shown on the Downloads page.
MODULE_ORDER = (
    "whmcs",
    "woocommerce",
    "wordpress",
    "joomla",
    "prestashop",
    "magento",
    "opencart",
    "shopware",
    "drupal",
    "odoo",
)


def direct_download_url(module_id: str, version: str) -> str:
    """Direct GitHub release-asset link for a module at a given app version."""
    return f"{GITHUB_RELEASE_BASE}/v{version}/licensemanagerpro-{module_id}-{version}.zip"


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
        return str(data.get("version", APP_VERSION))
    except (OSError, ValueError, AttributeError):
        return APP_VERSION


def list_downloads() -> list[dict]:
    manifest = _read_manifest()
    items = []
    for module_id in MODULE_ORDER:
        info = KNOWN_MODULES[module_id]
        manifest_entry = manifest.get(module_id, {}) if isinstance(manifest, dict) else {}
        version = _module_version(module_id)
        items.append(
            {
                "id": module_id,
                "name": manifest_entry.get("name") or info["name"],
                "version": version,
                "description": manifest_entry.get("description") or info["description"],
                # Direct GitHub release asset (primary path, version parity).
                "download_url": direct_download_url(module_id, version),
                # On-the-fly ZIP of the installed files (fallback).
                "zip_url": f"/api/downloads/{module_id}",
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
