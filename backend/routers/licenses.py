"""License routes (v2.3: JWT or module API key).

Writes are permission-gated (v2.0): create needs licenses:create, update
licenses:write, delete licenses:delete, renew licenses:renew. Reads are
open to any authenticated role. The license check (POST /validate, v3.0)
is PUBLIC — any server may call it with no API key and no JWT — but the
blacklist, the license locks and the 60/min per-IP rate limit still
apply, and the response carries only valid/detail/license/grace/warnings.
Each other route below accepts EITHER a JWT user (with the given
permission) OR an X-API-Key header carrying a module-scoped key, via
utils.module_auth.require_actor — except reissue and the activations
endpoints, which stay JWT-only.
Audit rows record the JWT user's email, or ``module-key:<id>``.
"""

from fastapi import APIRouter, Depends, Query, Request, Response
from sqlalchemy.orm import Session

from database import get_db
from schemas import (
    LicenseActivationCreateRequest,
    LicenseActivationResponse,
    LicenseCreateRequest,
    LicenseRenewRequest,
    LicenseResponse,
    LicenseUpdateRequest,
    LicenseValidateRequest,
    LicenseValidateResponse,
    MessageResponse,
)
from services import licenses as license_service
from services import notify_channels as notify_channels_service
from services import webhooks as webhook_service
from services.audit import log_audit
from utils.auth import get_current_user
from utils.module_auth import require_actor
from utils.pagination import Pagination, paginate_list, pagination_params
from utils.permissions import require_permission
from utils.rate_limit import rate_limit_validate

router = APIRouter()


def _actor_email(actor: dict) -> str:
    """Audit-log actor label for a require_actor result: the JWT user's
    email, or ``module-key:<id>`` for a module API key."""
    if actor["kind"] == "user":
        return actor["user"].email
    return f"module-key:{actor['key'].id}"


@router.get("", response_model=list[LicenseResponse])
def list_licenses(
    response: Response,
    filter: str = Query(default="all", description="all/active/inactive/daily/weekly/monthly"),
    status: str | None = Query(default=None),
    search: str | None = Query(default=None),
    page: Pagination = Depends(pagination_params),
    db: Session = Depends(get_db),
    actor=Depends(require_actor(jwt_perm=None, module_scope="licenses:read")),
):
    """List licenses, optionally filtered by status/time/search."""
    licenses = license_service.list_licenses(db, filter_=filter, status=status, search=search)
    return paginate_list(
        [license_service.serialize_license(lic) for lic in licenses], response, page
    )


@router.post("", response_model=LicenseResponse, status_code=201)
def create_license(
    request: LicenseCreateRequest,
    db: Session = Depends(get_db),
    actor=Depends(require_actor(jwt_perm="licenses:create", module_scope="licenses:create")),
):
    license_ = license_service.create_license(request, db)
    log_audit(
        db,
        _actor_email(actor),
        "license.create",
        "license",
        license_.id,
        {"key": license_.key, "product": license_.product},
    )
    notify_channels_service.notify_event(
        db,
        "license_created",
        "License created",
        f"License {license_.key} for {license_.product} was created.",
        type_="success",
        link="/licenses",
        context={
            "license_key": license_.key,
            "product_name": license_.product,
            "expiry_date": license_.expires_at.isoformat() if license_.expires_at else "",
            "user_email": license_.owner_email or "",
        },
    )
    return license_service.serialize_license(license_)


@router.post("/validate", response_model=LicenseValidateResponse)
def validate_license(
    http_request: Request,
    body: LicenseValidateRequest,
    db: Session = Depends(get_db),
    _rate_limited=Depends(rate_limit_validate),
):
    """Validate a license key (exists, active, not expired, activations left,
    plus domain/IP/install-path locks when set). PUBLIC (v3.0): no API key
    and no JWT — any server may call it. The blacklist is still enforced
    first, the locks still apply, and the 60/min per-IP rate limit still
    holds; the response reveals only valid/detail/license/grace/warnings.
    Enforcement follows the effective license-security config (v2.3);
    lenient mode returns valid=true with grace=true and warnings instead
    of denying.

    v3.0.6 (security, H2): the IP used for the blacklist and the IP lock
    is the OBSERVED connection IP (`request.client.host`), never the
    `ip` field of the request body — the body value is caller-asserted
    and used to defeat both checks (a locked license validated from
    anywhere by sending the locked IP; a blacklisted IP validated by
    sending any other IP). The body `ip` is ignored for enforcement
    (kept in the schema so existing modules keep sending it); the
    domain and install-path locks stay client-asserted, as they cannot
    be verified remotely. Behind a proxy the observed IP is the proxy's
    (see L5: run uvicorn with --proxy-headers in that case).
    """
    client_ip = http_request.client.host if http_request.client else None
    result = license_service.validate_license(
        body.key,
        db,
        domain=body.domain,
        ip=client_ip,
        install_path=body.install_path,
    )
    valid = result["valid"]
    detail = result["detail"]
    license_ = result["license"]
    if not valid and license_ is not None and license_.product_id is not None:
        webhook_service.notify_license_event(
            db,
            license_,
            webhook_service.EVENT_LICENSE_VALIDATED_FAILED,
            reason=detail,
        )
    return {
        "valid": valid,
        "detail": detail,
        "license": license_service.serialize_license_public(license_) if license_ else None,
        "grace": result["grace"],
        "warnings": result["warnings"],
    }


@router.get("/{license_id}", response_model=LicenseResponse)
def get_license(
    license_id: int,
    db: Session = Depends(get_db),
    actor=Depends(require_actor(jwt_perm=None, module_scope="licenses:read")),
):
    license_ = license_service.get_license(license_id, db)
    return license_service.serialize_license(license_)


@router.put("/{license_id}", response_model=LicenseResponse)
def update_license(
    license_id: int,
    request: LicenseUpdateRequest,
    db: Session = Depends(get_db),
    actor=Depends(require_actor(jwt_perm="licenses:write", module_scope="licenses:write")),
):
    license_ = license_service.update_license(license_id, request, db)
    log_audit(
        db,
        _actor_email(actor),
        "license.update",
        "license",
        license_.id,
        {"key": license_.key},
    )
    return license_service.serialize_license(license_)


@router.delete("/{license_id}", response_model=MessageResponse)
def delete_license(
    license_id: int,
    db: Session = Depends(get_db),
    actor=Depends(require_actor(jwt_perm="licenses:delete", module_scope="licenses:revoke")),
):
    license_service.delete_license(license_id, db)
    log_audit(db, _actor_email(actor), "license.delete", "license", license_id)
    return {"message": "License deleted successfully"}


@router.post("/{license_id}/renew", response_model=LicenseResponse)
def renew_license(
    license_id: int,
    request: LicenseRenewRequest = None,
    billing_cycle: str | None = Query(
        default=None,
        description="New billing cycle to switch to (e.g. annual). Validated "
        "(422 on unknown), synced onto the linked product when missing, "
        "and expiry is extended by that cycle. The WHMCS module passes "
        "it as ?billing_cycle=...; extend_days is ignored when it is set.",
    ),
    db: Session = Depends(get_db),
    actor=Depends(require_actor(jwt_perm="licenses:renew", module_scope="licenses:renew")),
):
    """Renew a license: by its billing_cycle, by extend_days when given,
    or by a new billing_cycle passed as ?billing_cycle=... (v2.3 sync)."""
    extend_days = request.extend_days if request is not None else None
    license_ = license_service.renew_license(
        license_id, db, extend_days=extend_days, billing_cycle=billing_cycle
    )
    log_audit(
        db,
        _actor_email(actor),
        "license.renew",
        "license",
        license_.id,
        {"key": license_.key, "billing_cycle": billing_cycle},
    )
    return license_service.serialize_license(license_)


@router.post("/{license_id}/reissue", response_model=LicenseResponse)
def reissue_license(
    license_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_permission("licenses:write")),
):
    """Reissue a license (v2.2): a fresh key replaces the old one; the old
    key stops working. Enforces the product's max_reissues."""
    license_ = license_service.reissue_license(license_id, db)
    log_audit(
        db,
        current_user.email,
        "license.reissue",
        "license",
        license_.id,
        {"key": license_.key, "reissue_count": license_.reissue_count},
    )
    notify_channels_service.notify_event(
        db,
        "license_reissued",
        "License reissued",
        f"License for {license_.product} was reissued (new key {license_.key}).",
        type_="info",
        link="/licenses",
        context={
            "license_key": license_.key,
            "product_name": license_.product,
            "expiry_date": license_.expires_at.isoformat() if license_.expires_at else "",
            "user_email": license_.owner_email or "",
        },
    )
    return license_service.serialize_license(license_)


@router.get("/{license_id}/activations", response_model=list[LicenseActivationResponse])
def list_activations(
    license_id: int,
    db: Session = Depends(get_db),
    _current_user=Depends(get_current_user),
):
    """Activation instances of a license (v2.2)."""
    records = license_service.list_activations(license_id, db)
    return [
        {
            "id": r.id,
            "license_id": r.license_id,
            "fingerprint": r.fingerprint,
            "label": r.label,
            "created_at": r.created_at,
        }
        for r in records
    ]


@router.post(
    "/{license_id}/activations",
    response_model=LicenseActivationResponse,
    status_code=201,
)
def activate_license(
    license_id: int,
    request: LicenseActivationCreateRequest,
    db: Session = Depends(get_db),
    current_user=Depends(require_permission("licenses:write")),
):
    """Register one activation instance (v2.2); same fingerprint twice
    returns the existing record without using another slot."""
    record = license_service.activate_license(
        license_id, db, request.fingerprint, label=request.label
    )
    log_audit(
        db,
        current_user.email,
        "license.activate",
        "license",
        license_id,
        {"fingerprint": request.fingerprint},
    )
    return {
        "id": record.id,
        "license_id": record.license_id,
        "fingerprint": record.fingerprint,
        "label": record.label,
        "created_at": record.created_at,
    }


@router.delete(
    "/{license_id}/activations/{activation_id}",
    response_model=MessageResponse,
)
def deactivate_activation(
    license_id: int,
    activation_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_permission("licenses:write")),
):
    """Remove one activation instance, freeing one slot (v2.2)."""
    license_service.deactivate_activation(license_id, activation_id, db)
    log_audit(
        db,
        current_user.email,
        "license.deactivate",
        "license",
        license_id,
        {"activation_id": activation_id},
    )
    return {"message": "Activation removed successfully"}
