"""Module download routes (v2.3; JWT).

GET /api/downloads lists all 10 modules with direct GitHub release-asset
links built from the installed app version (version parity);
GET /api/downloads/{id} streams a ZIP of the module directory built on
the fly (fallback). GET /api/downloads/versions compares the local module
versions with the versions in the repo's modules.json on GitHub.
"""

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy.orm import Session

from database import get_db
from schemas import DownloadItemResponse, ModuleVersionsResponse
from services import downloads as download_service
from services import updates as update_service
from utils.permissions import require_permission

router = APIRouter()


@router.get("", response_model=list[DownloadItemResponse])
def list_downloads(
    db: Session = Depends(get_db),
    _current_user=Depends(require_permission("downloads:read")),
):
    return download_service.list_downloads()


@router.get("/versions", response_model=ModuleVersionsResponse)
def module_versions(
    db: Session = Depends(get_db),
    _current_user=Depends(require_permission("downloads:read")),
):
    """Local versions vs the latest versions from the GitHub manifest."""
    local = {item["id"]: item["version"] for item in download_service.list_downloads()}
    manifest = update_service.fetch_modules_manifest()
    out = {}
    for module_id in download_service.MODULE_ORDER:
        latest_entry = manifest.get(module_id, {}) if isinstance(manifest, dict) else {}
        latest = latest_entry.get("version") if isinstance(latest_entry, dict) else None
        out[module_id] = {
            "local": local.get(module_id),
            "latest": latest,
            "update_available": bool(
                latest
                and update_service.parse_version(latest)
                > update_service.parse_version(local.get(module_id, "0"))
            ),
        }
    return out


@router.get("/{module_id}")
def download_module(
    module_id: str,
    db: Session = Depends(get_db),
    _current_user=Depends(require_permission("downloads:read")),
):
    filename, data = download_service.build_module_zip(module_id)
    return Response(
        content=data,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
