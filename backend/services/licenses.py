"""License business logic."""
import calendar
import json
import secrets
from datetime import datetime, timedelta

from fastapi import HTTPException
from sqlalchemy.orm import Session

from database import escape_like, utcnow
from models import License, Product
from schemas import LicenseCreateRequest, LicenseUpdateRequest

LICENSE_STATUSES = ["active", "inactive", "revoked"]


def add_months(moment: datetime, months: int) -> datetime:
    """Calendar-month arithmetic (not a 30-day approximation)."""
    month_index = moment.month - 1 + months
    year = moment.year + month_index // 12
    month = month_index % 12 + 1
    day = min(moment.day, calendar.monthrange(year, month)[1])
    return moment.replace(year=year, month=month, day=day)


def _split_csv(value: str | None) -> list[str]:
    if not value:
        return []
    return [part.strip() for part in value.split(",") if part.strip()]


def _join_csv(values) -> str | None:
    if values is None:
        return None
    if isinstance(values, str):
        return values or None
    cleaned = [str(v).strip() for v in values if str(v).strip()]
    return ",".join(cleaned) if cleaned else None


def _sync_billing_cycle(db: Session, product: Product, cycle: str) -> None:
    """Billing-cycle sync (v2.3): a module may send a cycle the product
    does not list yet (e.g. a WHMCS service cycle or a WooCommerce
    subscription period). An unknown cycle is rejected (422); a valid but
    missing cycle is appended to the product's billing_cycles (existing
    order preserved, de-duplicated) and persisted with the caller's
    commit. Shared by create/renew/update so the rule lives in one place.
    """
    from services import products as product_service

    if cycle not in product_service.BILLING_CYCLES:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid billing_cycle: '{cycle}' (expected one of {', '.join(product_service.BILLING_CYCLES)})",
        )
    try:
        cycles = json.loads(product.billing_cycles or "[]")
    except (TypeError, ValueError):
        cycles = []
    if not isinstance(cycles, list):
        cycles = []
    if cycle not in cycles:
        cycles.append(cycle)
        product.billing_cycles = json.dumps(cycles)
        db.add(product)


def generate_license_key(product: Product | None = None) -> str:
    """Generate a random license key.

    Default form is XXXX-XXXX-XXXX-XXXX. When the product defines a key
    format (v2.2), the key is "<prefix>-XXXX-..." with the product's
    segment count and segment length.
    """
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    segments = 4
    length = 4
    prefix = None
    if product is not None:
        segments = max(1, min(8, product.key_segments or 4))
        length = max(2, min(8, product.key_segment_length or 4))
        prefix = (product.key_prefix or "").strip() or None
    raw = "".join(secrets.choice(alphabet) for _ in range(segments * length))
    chunks = [raw[i : i + length] for i in range(0, len(raw), length)]
    if prefix:
        chunks.insert(0, prefix)
    return "-".join(chunks)


def serialize_license(license_: License) -> dict:
    """License as a plain dict, with the derived (effective) status."""
    return {
        "id": license_.id,
        "key": license_.key,
        "product": license_.product,
        "product_id": license_.product_id,
        "billing_cycle": license_.billing_cycle,
        "allowed_domains": _split_csv(license_.allowed_domains),
        "allowed_ips": _split_csv(license_.allowed_ips),
        "install_path": license_.install_path,
        "owner_email": license_.owner_email,
        "status": license_.effective_status,
        "expires_at": license_.expires_at,
        "max_activations": license_.max_activations,
        "activations": license_.activations,
        "reissue_count": license_.reissue_count,
        "notes": license_.notes,
        "created_at": license_.created_at,
        "updated_at": license_.updated_at,
    }


def serialize_license_public(license_: License) -> dict:
    """Minimal license view for the PUBLIC validate endpoint (v3.0.6,
    security M2). See LicenseValidateInfo for the rationale."""
    return {
        "product": license_.product,
        "product_id": license_.product_id,
        "billing_cycle": license_.billing_cycle,
        "status": license_.effective_status,
        "expires_at": license_.expires_at,
        "max_activations": license_.max_activations,
        "activations": license_.activations,
    }


def create_license(request: LicenseCreateRequest, db: Session) -> License:
    from services import products as product_service
    from services import webhooks as webhook_service
    from services.settings import require_notes_enabled

    # v3.0: notes are rejected while the notes feature is disabled.
    require_notes_enabled(db, request.notes)

    if request.status not in LICENSE_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status: {request.status} (expected one of {LICENSE_STATUSES})",
        )
    key_value = request.key or generate_license_key()
    if db.query(License).filter(License.key == key_value).first():
        raise HTTPException(status_code=400, detail="License key already exists")

    product_name = request.product
    product_id = request.product_id
    billing_cycle = request.billing_cycle
    expires_at = None
    product = None
    if product_id is not None:
        # Product-linked license: expiry comes from the billing cycle.
        product = product_service.get_product(product_id, db)
        if request.key is None:
            # No explicit key: regenerate with the product's key format.
            key_value = generate_license_key(product)
            while db.query(License).filter(License.key == key_value).first():
                key_value = generate_license_key(product)
        if not billing_cycle:
            raise HTTPException(
                status_code=400,
                detail="billing_cycle is required when product_id is given",
            )
        # Billing-cycle sync (v2.3): a valid cycle the product does not
        # list yet is added to the product automatically; an unknown
        # cycle is rejected with 422.
        _sync_billing_cycle(db, product, billing_cycle)
        if billing_cycle == "lifetime":
            expires_at = None
        else:
            months = product_service.CYCLE_MONTHS[billing_cycle]
            expires_at = add_months(utcnow(), months)
        if not product_name:
            product_name = product.name
    else:
        if not product_name:
            raise HTTPException(
                status_code=400,
                detail="product is required when product_id is not given",
            )
        if request.expires_in_days:
            expires_at = utcnow() + timedelta(days=request.expires_in_days)

    license_ = License(
        key=key_value,
        product=product_name,
        product_id=product_id,
        billing_cycle=billing_cycle,
        allowed_domains=_join_csv(request.allowed_domains),
        allowed_ips=_join_csv(request.allowed_ips),
        install_path=request.install_path,
        owner_email=request.owner_email,
        status=request.status,
        expires_at=expires_at,
        max_activations=request.max_activations,
        notes=request.notes,
    )
    db.add(license_)
    db.commit()
    db.refresh(license_)
    webhook_service.notify_license_event(
        db, license_, webhook_service.EVENT_LICENSE_CREATED
    )
    return license_


def get_license(license_id: int, db: Session) -> License:
    license_ = db.query(License).filter(License.id == license_id).first()
    if not license_:
        raise HTTPException(status_code=404, detail="License not found")
    return license_


def list_licenses(
    db: Session,
    filter_: str = "all",
    status: str | None = None,
    search: str | None = None,
):
    """List licenses, applying the frontend's filter values.

    filter: all | active | inactive | daily | weekly | monthly.
    status/search are additional optional filters.
    """
    query = db.query(License)

    if search:
        # Escape LIKE wildcards: the term is a literal string, never a
        # pattern (a search for "%" must not match every row).
        like = f"%{escape_like(search)}%"
        query = query.filter(
            (License.key.like(like, escape="\\"))
            | (License.product.like(like, escape="\\"))
            | (License.owner_email.like(like, escape="\\"))
        )

    now = utcnow()
    if filter_ == "daily":
        query = query.filter(License.created_at >= now - timedelta(days=1))
    elif filter_ == "weekly":
        query = query.filter(License.created_at >= now - timedelta(days=7))
    elif filter_ == "monthly":
        query = query.filter(License.created_at >= now - timedelta(days=30))
    elif filter_ not in ("all", "active", "inactive"):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid filter: {filter_} (expected all/active/inactive/daily/weekly/monthly)",
        )

    licenses = query.order_by(License.created_at.desc()).all()

    # Status filter: explicit `status` param wins, otherwise the `filter`
    # value doubles as a status filter for active/inactive.
    status_filter = status
    if status_filter is None and filter_ in ("active", "inactive"):
        status_filter = filter_
    if status_filter is not None:
        if status_filter not in ("active", "inactive"):
            raise HTTPException(
                status_code=400,
                detail=f"Invalid status: {status_filter} (expected active or inactive)",
            )
        want_active = status_filter == "active"
        licenses = [
            lic for lic in licenses if (lic.effective_status == "active") == want_active
        ]
    return licenses


def update_license(license_id: int, request: LicenseUpdateRequest, db: Session) -> License:
    from services import products as product_service

    license_ = get_license(license_id, db)
    if request.status is not None and request.status not in LICENSE_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status: {request.status} (expected one of {LICENSE_STATUSES})",
        )
    if request.product_id is not None:
        product_service.get_product(request.product_id, db)
        license_.product_id = request.product_id
    if request.billing_cycle is not None:
        product_id = (
            request.product_id
            if request.product_id is not None
            else license_.product_id
        )
        if product_id is not None:
            product = product_service.get_product(product_id, db)
            # Billing-cycle sync (v2.3): a valid cycle missing from the
            # product is added to it; an unknown cycle is rejected (422).
            _sync_billing_cycle(db, product, request.billing_cycle)
        elif request.billing_cycle not in product_service.BILLING_CYCLES:
            raise HTTPException(
                status_code=422,
                detail=f"Invalid billing_cycle: '{request.billing_cycle}' (expected one of {', '.join(product_service.BILLING_CYCLES)})",
            )
        license_.billing_cycle = request.billing_cycle
    if request.product is not None:
        license_.product = request.product
    if request.owner_email is not None:
        license_.owner_email = request.owner_email
    if request.status is not None:
        license_.status = request.status
    if request.expires_in_days is not None:
        license_.expires_at = utcnow() + timedelta(days=request.expires_in_days)
    if request.max_activations is not None:
        license_.max_activations = request.max_activations
    if request.allowed_domains is not None:
        license_.allowed_domains = _join_csv(request.allowed_domains)
    if request.allowed_ips is not None:
        license_.allowed_ips = _join_csv(request.allowed_ips)
    if request.install_path is not None:
        license_.install_path = request.install_path
    if "notes" in request.model_fields_set:
        from services.settings import require_notes_enabled

        require_notes_enabled(db, request.notes)
        license_.notes = request.notes
    db.commit()
    db.refresh(license_)
    return license_


def delete_license(license_id: int, db: Session) -> None:
    from services import webhooks as webhook_service

    license_ = get_license(license_id, db)
    # Capture the payload data before the row is gone.
    product = None
    if license_.product_id is not None:
        product = (
            db.query(Product).filter(Product.id == license_.product_id).first()
        )
    payload = webhook_service.license_payload(
        license_, product, webhook_service.EVENT_LICENSE_REVOKED
    )
    db.delete(license_)
    db.commit()
    if product is not None:
        webhook_service.dispatch_webhook(
            db, product, webhook_service.EVENT_LICENSE_REVOKED, payload
        )


def renew_license(
    license_id: int,
    db: Session,
    extend_days: int | None = None,
    billing_cycle: str | None = None,
) -> License:
    """Renew a license.

    - When billing_cycle is explicitly passed (v2.3, billing-cycle sync):
      it is validated (422 on unknown), synced onto the linked product
      when missing, stored on the license, and expiry is extended by
      that cycle's calendar months. This also lets a lifetime license
      switch to a paid cycle; switching *to* lifetime is rejected (400).
    - When extend_days is explicitly passed it wins (legacy behaviour).
    - Otherwise the license's own billing_cycle decides: monthly/quarterly/
      semiannual/annual/biennial extend by that many calendar months.
    - Lifetime licenses cannot be renewed (400).
    - A license without a billing_cycle and without extend_days falls back
      to +30 days.
    """
    from services import products as product_service
    from services import webhooks as webhook_service

    license_ = get_license(license_id, db)
    if billing_cycle is not None:
        if billing_cycle == "lifetime":
            raise HTTPException(
                status_code=400, detail="cannot renew a lifetime license"
            )
        if license_.product_id is not None:
            product = product_service.get_product(license_.product_id, db)
            _sync_billing_cycle(db, product, billing_cycle)
        elif billing_cycle not in product_service.BILLING_CYCLES:
            raise HTTPException(
                status_code=422,
                detail=f"Invalid billing_cycle: '{billing_cycle}' (expected one of {', '.join(product_service.BILLING_CYCLES)})",
            )
        license_.billing_cycle = billing_cycle
    elif license_.billing_cycle == "lifetime":
        raise HTTPException(
            status_code=400, detail="cannot renew a lifetime license"
        )
    base = license_.expires_at or utcnow()
    base = max(base, utcnow())
    if billing_cycle is not None:
        license_.expires_at = add_months(
            base, product_service.CYCLE_MONTHS[billing_cycle]
        )
    elif extend_days is not None:
        license_.expires_at = base + timedelta(days=extend_days)
    elif license_.billing_cycle in product_service.CYCLE_MONTHS:
        license_.expires_at = add_months(
            base, product_service.CYCLE_MONTHS[license_.billing_cycle]
        )
    else:
        license_.expires_at = base + timedelta(days=30)
    if license_.status in ("inactive", "revoked"):
        license_.status = "active"
    db.commit()
    db.refresh(license_)
    webhook_service.notify_license_event(
        db, license_, webhook_service.EVENT_LICENSE_RENEWED
    )
    return license_


def reissue_license(license_id: int, db: Session) -> License:
    """Reissue a license (v2.2, WHMCS-style): a fresh key replaces the old
    one on the same license row; the old key stops working immediately.
    Enforces the product's max_reissues (NULL = unlimited)."""
    from services import products as product_service
    from services import webhooks as webhook_service

    license_ = get_license(license_id, db)
    product = None
    if license_.product_id is not None:
        product = product_service.get_product(license_.product_id, db)
        if product.max_reissues is not None and license_.reissue_count >= product.max_reissues:
            raise HTTPException(
                status_code=400,
                detail=f"Reissue limit reached ({product.max_reissues} for this product)",
            )
    new_key = generate_license_key(product)
    while db.query(License).filter(License.key == new_key).first():
        new_key = generate_license_key(product)
    license_.key = new_key
    license_.reissue_count += 1
    if license_.status == "revoked":
        license_.status = "active"
    db.commit()
    db.refresh(license_)
    webhook_service.notify_license_event(
        db, license_, webhook_service.EVENT_LICENSE_REISSUED
    )
    return license_


def list_activations(license_id: int, db: Session) -> list:
    from models import LicenseActivation

    get_license(license_id, db)
    return (
        db.query(LicenseActivation)
        .filter(LicenseActivation.license_id == license_id)
        .order_by(LicenseActivation.created_at.desc())
        .all()
    )


def activate_license(
    license_id: int, db: Session, fingerprint: str, label: str | None = None
):
    """Register one activation instance (v2.2, Keygen-style).

    Re-activating the same fingerprint returns the existing record (no
    extra slot used). A new fingerprint consumes one slot; when the
    license's max_activations is reached, 400 is returned.
    """
    from models import LicenseActivation

    license_ = get_license(license_id, db)
    if license_.effective_status != "active":
        raise HTTPException(
            status_code=400,
            detail=f"License is {license_.effective_status}",
        )
    fingerprint = (fingerprint or "").strip()
    if not fingerprint:
        raise HTTPException(status_code=400, detail="fingerprint is required")
    existing = (
        db.query(LicenseActivation)
        .filter(
            LicenseActivation.license_id == license_id,
            LicenseActivation.fingerprint == fingerprint,
        )
        .first()
    )
    if existing:
        return existing
    # v2.3: the license-security config can switch the activation limit off.
    from services import license_security as security

    product = None
    if license_.product_id is not None:
        product = db.query(Product).filter(Product.id == license_.product_id).first()
    cfg = security.effective_license_security(db, product)
    if cfg["enforce_activation_limit"] and license_.activations >= license_.max_activations:
        raise HTTPException(status_code=400, detail="Activation limit reached")
    record = LicenseActivation(
        license_id=license_id, fingerprint=fingerprint, label=label
    )
    license_.activations += 1
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def deactivate_activation(license_id: int, activation_id: int, db: Session) -> None:
    """Remove one activation instance, freeing one slot."""
    from models import LicenseActivation

    license_ = get_license(license_id, db)
    record = (
        db.query(LicenseActivation)
        .filter(
            LicenseActivation.id == activation_id,
            LicenseActivation.license_id == license_id,
        )
        .first()
    )
    if not record:
        raise HTTPException(status_code=404, detail="Activation not found")
    db.delete(record)
    license_.activations = max(0, license_.activations - 1)
    db.commit()


def _domain_matches(requested: str, allowed: str) -> bool:
    """Case-insensitive exact or subdomain match."""
    requested = requested.strip().lower()
    allowed = allowed.strip().lower()
    return requested == allowed or requested.endswith("." + allowed)


def validate_license(
    key: str,
    db: Session,
    domain: str | None = None,
    ip: str | None = None,
    install_path: str | None = None,
) -> dict:
    """Check a license key: exists, active, not expired, activations left,
    and (when set) domain/IP/install-path locks. A blacklisted IP or
    domain (v2.2) is rejected before anything else is looked at.

    `ip` is the OBSERVED client IP (v3.0.6, H2) — the route passes
    `request.client.host`, never the caller-supplied body value, so
    the IP lock and the IP blacklist cannot be spoofed. The domain
    and install-path values stay caller-asserted (unverifiable
    remotely).

    Enforcement follows the effective license-security config (v2.3):
    global `license_security` setting merged with the linked product's
    overrides. Returns a dict: valid / detail / license / grace /
    warnings. In lenient mode a lock mismatch still validates but the
    response is marked grace=true with a warning.
    """
    from services import blacklist as blacklist_service
    from services import license_security as security

    def fail(detail: str, license_=None):
        return {"valid": False, "detail": detail, "license": license_, "grace": False, "warnings": []}

    blocked = blacklist_service.is_blacklisted(db, ip=ip, domain=domain)
    if blocked:
        return fail("blocked: blacklisted")
    license_ = db.query(License).filter(License.key == key).first()
    if not license_:
        return fail("License key not found")
    if license_.effective_status == "expired":
        return fail("License has expired", license_)
    if license_.effective_status != "active":
        return fail(f"License is {license_.effective_status}", license_)

    product = None
    if license_.product_id is not None:
        product = db.query(Product).filter(Product.id == license_.product_id).first()
    cfg = security.effective_license_security(db, product)
    strict = cfg["strictness"] == "strict"
    missing_denies = cfg["missing_lock_behavior"] == "deny"
    warnings: list[str] = []

    def check_lock(enabled: bool, configured: bool, matches: bool, missing: bool, label: str):
        """One lock check. Returns True when validation must stop (deny)."""
        if not enabled or not configured:
            return False
        if missing:
            if missing_denies:
                return True
            warnings.append(f"{label} not provided")
            return False
        if not matches:
            if strict:
                return True
            warnings.append(f"{label} mismatch (grace)")
            return False
        return False

    # v3.0.6 (security, M1): the activation limit is NOT checked here.
    # It is enforced at activation time only (activate_license: a new
    # fingerprint past the limit gets 400, an existing fingerprint
    # re-activates without using a slot). Checking it here broke the
    # normal case: max_activations defaults to 1, so one legitimate
    # activation made every later validate fail with "Activation limit
    # reached" — the license could never be used after being activated.
    # Validate is a status check; the gate lives where installs are
    # created. (The demo mock never had this check either.)

    allowed_domains = _split_csv(license_.allowed_domains)
    if check_lock(
        cfg["enforce_domain_lock"],
        bool(allowed_domains),
        bool(domain) and any(_domain_matches(domain, a) for a in allowed_domains),
        not domain,
        "domain",
    ):
        return fail("domain not allowed", license_)
    allowed_ips = _split_csv(license_.allowed_ips)
    if check_lock(
        cfg["enforce_ip_lock"],
        bool(allowed_ips),
        bool(ip) and ip.strip() in [a.strip() for a in allowed_ips],
        not ip,
        "ip",
    ):
        return fail("ip not allowed", license_)
    if check_lock(
        cfg["enforce_install_path_lock"],
        bool(license_.install_path),
        bool(install_path) and install_path == license_.install_path,
        not install_path,
        "install path",
    ):
        return fail("install path not allowed", license_)

    grace = bool(warnings)
    return {
        "valid": True,
        "detail": "License is valid" + (" (grace)" if grace else ""),
        "license": license_,
        "grace": grace,
        "warnings": warnings,
    }
