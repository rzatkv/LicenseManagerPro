"""API key business logic: creation, rotation, and validated usage.

v2.3 security model:
- The secret is NEVER stored. ``ApiKey.key_hash`` holds the SHA-256 hex
  of the secret; ``ApiKey.key`` holds only the display prefix (first 12
  characters) so list/get responses can never leak a usable secret. The
  plaintext is returned ONCE, at creation/rotation, in ``plain_key``.
  Pre-v2.3 rows (plaintext in ``key``) are migrated on startup (and
  lazily on first use): hash, then replace ``key`` with the prefix.
- ``scopes`` (JSON list): [] = legacy key governed by ``access_rights``
  only; ["module"] = module preset — usable ONLY on the module
  endpoints (licenses create/read/renew/revoke/validate/write, products
  read, system info), never on admin endpoints. Enforced server-side in
  utils/module_auth.
- Module keys are TIME-LIMITED: expiry is required, default 90 days,
  allowed values 30/90/180/365 (max 365). A warning notification fires
  once a day when a module key is within 7 days of expiry.
- ``require_signed_requests``: when true, calls must carry
  X-LMP-Timestamp + X-LMP-Signature where
  signature = HMAC-SHA256(key=SHA256(secret), message) and
  message = method + "\\n" + path + "\\n" + timestamp + "\\n" +
  SHA256(body).hexdigest(). Timestamps older than 5 minutes are
  rejected and each signature is accepted once (in-memory replay cache;
  per-process — see the module-auth docstring for the limitation).
  Comparison uses hmac.compare_digest (constant time).
- ``associated_ip`` accepts a comma-separated list of IPs and/or CIDRs
  (extended from the old single-IP value); when set, the key only works
  from those addresses.

Validation enforces everything the old code skipped: expiry, single-use
consumption, IP/domain/directory restrictions, and the daily request limit
(configurable via the "daily_request_limit" system setting).
"""

import hashlib
import hmac
import ipaddress
import json
import secrets
import time
from datetime import date, timedelta

from fastapi import HTTPException
from sqlalchemy.orm import Session

from config import DAILY_REQUEST_LIMIT
from database import utcnow
from models import ApiKey, ApiUsageLog
from schemas import AddApiKeyRequest, UpdateApiKeyRequest

ACCESS_RIGHTS = [
    "create_license",
    "edit_license",
    "delete_license",
    "get_license_info",
    "renew_license",
    "remove_access",
    "add_access",
    "change_access_key",
    "create_temporary_access_key",
]

# --- Module scope preset (v2.3) -------------------------------------------
MODULE_SCOPE = "module"
ALLOWED_SCOPES = {"module"}
MODULE_SCOPES = {
    "licenses:create",
    "licenses:read",
    "licenses:renew",
    "licenses:revoke",
    "licenses:validate",
    "licenses:write",  # suspend/unsuspend + change package (status changes)
    "products:read",
    "system:read",  # version info, used by the modules' Test connection
}
# Access rights shown by check-access for a module key (the legacy field;
# the scope check in module_auth is authoritative for module endpoints).
MODULE_ACCESS_RIGHTS = [
    "create_license",
    "edit_license",
    "delete_license",
    "get_license_info",
    "renew_license",
]
MODULE_KEY_EXPIRY_DAYS = (30, 90, 180, 365)
MODULE_KEY_DEFAULT_EXPIRY_DAYS = 90
MODULE_KEY_EXPIRY_WARNING_DAYS = 7

# Signed requests: timestamps older than this are rejected (replay window).
SIGNATURE_MAX_AGE_SECONDS = 300

# In-memory replay cache: {(key_id, signature): monotonic expiry}.
# Per-process only — a multi-worker deployment accepts a replay in a
# different worker inside the 5-minute window. The timestamp window
# bounds the exposure; deployments needing stronger guarantees should
# run a single worker or a shared cache.
_seen_signatures: dict[tuple[int, str], float] = {}


def hash_api_key(secret: str) -> str:
    """SHA-256 hex of an API key secret (the stored form)."""
    return hashlib.sha256(secret.encode("utf-8")).hexdigest()


def key_prefix(secret: str) -> str:
    """Display prefix (first 12 chars) — the only part ever listed."""
    return secret[:12]


def generate_api_key() -> str:
    """Generate a random, URL-safe API key."""
    return "lmp_" + secrets.token_urlsafe(32)


def parse_scopes(raw) -> list[str]:
    """Scopes JSON text -> list (invalid data becomes [])."""
    try:
        scopes = json.loads(raw or "[]")
    except (ValueError, TypeError):
        return []
    return [s for s in scopes if isinstance(s, str)] if isinstance(scopes, list) else []


def is_module_key(entry: ApiKey) -> bool:
    return MODULE_SCOPE in parse_scopes(entry.scopes)


def serialize_api_key(entry: ApiKey, plain_key: str | None = None) -> dict:
    """Public form of a key: prefix only, never the secret. ``plain_key``
    is set only on create/rotate responses (shown once)."""
    return {
        "id": entry.id,
        "key": entry.key,
        "access_rights": [p for p in (entry.access_rights or "").split(",") if p],
        "scopes": parse_scopes(entry.scopes),
        "require_signed_requests": entry.require_signed_requests,
        "expires_at": entry.expires_at,
        "associated_ip": entry.associated_ip,
        "associated_domain": entry.associated_domain,
        "associated_directory": entry.associated_directory,
        "single_use": entry.single_use,
        "consumed": entry.consumed,
        "created_at": entry.created_at,
        "plain_key": plain_key,
    }


def migrate_api_key_hashes(db: Session) -> int:
    """One-time migration for pre-v2.3 rows: hash the plaintext secret,
    store the hash, replace ``key`` with the display prefix. Returns the
    number of rows migrated. Safe to run repeatedly (already-hashed rows
    are skipped)."""
    migrated = 0
    for entry in db.query(ApiKey).filter(ApiKey.key_hash.is_(None)).all():
        secret = entry.key or ""
        if len(secret) < 10:
            continue  # already a prefix / unusable row; leave it
        entry.key_hash = hash_api_key(secret)
        entry.key = key_prefix(secret)
        migrated += 1
    if migrated:
        db.commit()
    return migrated


def ip_allowed(allowed: str | None, client_ip: str | None) -> bool:
    """True when ``client_ip`` matches the allowlist (comma-separated
    IPs and/or CIDRs). No allowlist => allowed. Unparseable entries
    never match (fail closed)."""
    if not allowed:
        return True
    if not client_ip:
        return False
    for part in allowed.split(","):
        part = part.strip()
        if not part:
            continue
        try:
            network = ipaddress.ip_network(part, strict=False)
        except ValueError:
            continue
        try:
            if ipaddress.ip_address(client_ip) in network:
                return True
        except ValueError:
            continue
    return False


def _daily_limit(db: Session) -> int:
    """Daily request limit from the system setting, falling back to the env default."""
    from models import SystemSetting

    setting = db.query(SystemSetting).filter(SystemSetting.key == "daily_request_limit").first()
    if setting is None:
        return DAILY_REQUEST_LIMIT
    try:
        return int(setting.value)
    except (TypeError, ValueError):
        return DAILY_REQUEST_LIMIT


def _verify_signature(
    entry: ApiKey, method: str, path: str, timestamp: str, signature: str, body: bytes
) -> None:
    """Verify X-LMP-Timestamp + X-LMP-Signature (constant-time compare).

    Raises 401 on a missing/stale timestamp, an unknown signature, or a
    replayed signature inside the window. ``entry.key_hash`` is the HMAC
    key (the client derives it as SHA-256 of the plaintext secret).
    """
    if not timestamp or not signature:
        raise HTTPException(status_code=401, detail="Signed requests required for this key")
    try:
        ts = int(timestamp)
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=401, detail="Invalid X-LMP-Timestamp") from exc
    now = int(time.time())
    if abs(now - ts) > SIGNATURE_MAX_AGE_SECONDS:
        raise HTTPException(status_code=401, detail="Stale X-LMP-Timestamp")
    if not entry.key_hash:
        raise HTTPException(status_code=401, detail="Invalid API key")
    body_hash = hashlib.sha256(body or b"").hexdigest()
    message = f"{method}\n{path}\n{timestamp}\n{body_hash}".encode()
    expected = hmac.new(bytes.fromhex(entry.key_hash), message, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, signature):
        raise HTTPException(status_code=401, detail="Invalid X-LMP-Signature")
    # Replay protection: each signature is accepted once per window.
    cache_key = (entry.id, signature)
    horizon = time.monotonic()
    for old_key, expiry in list(_seen_signatures.items()):
        if expiry <= horizon:
            del _seen_signatures[old_key]
    if cache_key in _seen_signatures:
        raise HTTPException(status_code=401, detail="Replayed request")
    _seen_signatures[cache_key] = horizon + SIGNATURE_MAX_AGE_SECONDS


def _warn_key_expiring(db: Session, entry: ApiKey) -> None:
    """Notify admins once a day when a module key nears expiry."""
    if not is_module_key(entry) or not entry.expires_at:
        return
    remaining = (entry.expires_at - utcnow()).days
    if remaining < 0 or remaining > MODULE_KEY_EXPIRY_WARNING_DAYS:
        return
    if entry.expiry_warned_at and (utcnow() - entry.expiry_warned_at) < timedelta(days=1):
        return
    from services import notifications as notification_service

    notification_service.notify_admins(
        db,
        "Module API key expiring soon",
        f"Module API key {entry.key}… expires in {remaining} day(s). Rotate it from the API Keys page.",
        type_="warning",
        link="/api-keys",
    )
    entry.expiry_warned_at = utcnow()
    db.commit()


def validate_api_key_usage(
    api_key: str,
    db: Session,
    client_ip: str | None = None,
    domain: str | None = None,
    directory: str | None = None,
    required_scope: str | None = None,
    signed_request: dict | None = None,
) -> ApiKey:
    """Validate an API key and record one use of it.

    Raises 401 for an unknown/expired key or a bad/missing signature;
    403 for an already-consumed single-use key, a disallowed IP/domain/
    directory, a blacklisted IP/domain, or a key lacking
    ``required_scope``; 429 when the daily request limit for the key is
    reached. A blacklisted IP or domain (v2.2) is rejected before
    anything else is looked at.
    """
    from services import blacklist as blacklist_service

    blocked = blacklist_service.is_blacklisted(db, ip=client_ip, domain=domain)
    if blocked:
        raise HTTPException(status_code=403, detail="blocked: blacklisted")
    entry = None
    if api_key:
        entry = db.query(ApiKey).filter(ApiKey.key_hash == hash_api_key(api_key)).first()
        if entry is None:
            # Legacy fallback: a row whose startup migration has not run
            # yet (plaintext still in `key`). Migrate it on the spot.
            legacy = (
                db.query(ApiKey).filter(ApiKey.key == api_key, ApiKey.key_hash.is_(None)).first()
            )
            if legacy is not None:
                legacy.key_hash = hash_api_key(api_key)
                legacy.key = key_prefix(api_key)
                db.commit()
                db.refresh(legacy)
                entry = legacy
    if entry is None:
        raise HTTPException(status_code=401, detail="Invalid API Key")

    now = utcnow()
    if entry.expires_at and entry.expires_at < now:
        raise HTTPException(status_code=401, detail="API Key has expired")

    if entry.single_use and entry.consumed:
        raise HTTPException(status_code=403, detail="Single-use API Key already used")

    if not ip_allowed(entry.associated_ip, client_ip):
        raise HTTPException(status_code=403, detail="API Key is restricted to another IP")
    if entry.associated_domain and domain and entry.associated_domain != domain:
        raise HTTPException(status_code=403, detail="API Key is restricted to another domain")
    if entry.associated_directory and directory and entry.associated_directory != directory:
        raise HTTPException(status_code=403, detail="API Key is restricted to another directory")

    if required_scope is not None:
        scopes = parse_scopes(entry.scopes)
        # The "module" preset expands to every granular module scope
        # (MODULE_SCOPES). Only "module" itself is storable via the API
        # (ALLOWED_SCOPES), so without this expansion no module key could
        # ever pass a granular scope check and every module endpoint
        # (licenses, products:read, system:read) would 403.
        if MODULE_SCOPE in scopes:
            scopes = list(set(scopes) | MODULE_SCOPES)
        # Fail closed: a key without the required module scope — including
        # a legacy unscoped key — cannot call a module endpoint.
        if required_scope not in scopes:
            raise HTTPException(
                status_code=403,
                detail=f"API key lacks scope '{required_scope}'",
            )
        if entry.require_signed_requests:
            signed_request = signed_request or {}
            _verify_signature(
                entry,
                signed_request.get("method", ""),
                signed_request.get("path", ""),
                signed_request.get("timestamp", ""),
                signed_request.get("signature", ""),
                signed_request.get("body", b""),
            )

    # Module keys get a per-key rate limit on top of the daily limit.
    if required_scope is not None:
        from utils.rate_limit import _check as _rate_check

        _rate_check(f"module-key:{entry.id}", 60)

    today = date.today()
    usage = (
        db.query(ApiUsageLog)
        .filter(ApiUsageLog.api_key_id == entry.id, ApiUsageLog.date == today)
        .first()
    )
    if usage and usage.request_count >= _daily_limit(db):
        raise HTTPException(status_code=429, detail="Daily request limit exceeded")
    if usage:
        usage.request_count += 1
    else:
        db.add(ApiUsageLog(api_key_id=entry.id, date=today, request_count=1))

    if entry.single_use:
        entry.consumed = True

    db.commit()
    db.refresh(entry)
    _warn_key_expiring(db, entry)
    return entry


def _validate_scopes(scopes) -> list[str]:
    if scopes is None:
        return []
    if not isinstance(scopes, list):
        raise HTTPException(status_code=400, detail="scopes must be a list")
    unknown = [s for s in scopes if s not in ALLOWED_SCOPES]
    if unknown:
        raise HTTPException(status_code=400, detail=f"Unknown scope(s): {unknown}")
    return list(dict.fromkeys(scopes))


def add_api_key(request: AddApiKeyRequest, db: Session) -> tuple[ApiKey, str]:
    """Create a new API key. Returns (entry, plaintext secret) — the
    secret is shown once and never stored. Module keys REQUIRE an
    expiry: default 90 days, allowed 30/90/180/365."""
    for right in request.access_rights or []:
        if right not in ACCESS_RIGHTS:
            raise HTTPException(status_code=400, detail=f"Invalid access right: {right}")
    scopes = _validate_scopes(request.scopes)
    access_rights = list(request.access_rights or [])
    if is_module_key_scopes(scopes):
        if not access_rights:
            access_rights = list(MODULE_ACCESS_RIGHTS)
        expires_in_days = request.expires_in_days or MODULE_KEY_DEFAULT_EXPIRY_DAYS
        if expires_in_days not in MODULE_KEY_EXPIRY_DAYS:
            raise HTTPException(
                status_code=400,
                detail=f"Module keys expire in one of {list(MODULE_KEY_EXPIRY_DAYS)} days",
            )
    else:
        expires_in_days = request.expires_in_days

    key_value = request.key or generate_api_key()
    if len(key_value) < 10:
        raise HTTPException(status_code=400, detail="API key must be at least 10 characters")
    if db.query(ApiKey).filter(ApiKey.key_hash == hash_api_key(key_value)).first():
        raise HTTPException(status_code=400, detail="API Key already exists")
    if db.query(ApiKey).filter(ApiKey.key == key_value).first():
        raise HTTPException(status_code=400, detail="API Key already exists")

    expires_at = None
    if expires_in_days:
        expires_at = utcnow() + timedelta(days=expires_in_days)

    new_key = ApiKey(
        key=key_prefix(key_value),
        key_hash=hash_api_key(key_value),
        scopes=json.dumps(scopes),
        require_signed_requests=bool(request.require_signed_requests),
        access_rights=",".join(access_rights),
        expires_at=expires_at,
        associated_ip=request.associated_ip,
        associated_domain=request.associated_domain,
        associated_directory=request.associated_directory,
        single_use=request.single_use,
    )
    db.add(new_key)
    db.commit()
    db.refresh(new_key)
    return new_key, key_value


def is_module_key_scopes(scopes: list[str]) -> bool:
    return MODULE_SCOPE in (scopes or [])


def rotate_api_key(api_key_id: int, db: Session) -> tuple[ApiKey, str]:
    """Rotate a key: new secret, old one revoked immediately. The new
    secret is returned once; the expiry is kept (rotation does not
    extend a key's lifetime)."""
    entry = db.query(ApiKey).filter(ApiKey.id == api_key_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="API Key not found")
    new_secret = generate_api_key()
    entry.key_hash = hash_api_key(new_secret)
    entry.key = key_prefix(new_secret)
    entry.consumed = False
    entry.expiry_warned_at = None
    db.commit()
    db.refresh(entry)
    return entry, new_secret


def update_api_key(api_key_id: int, request: UpdateApiKeyRequest, db: Session) -> ApiKey:
    """Update an existing API key (the secret itself never changes here —
    use rotation for that)."""
    entry = db.query(ApiKey).filter(ApiKey.id == api_key_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="API Key not found")

    if request.access_rights is not None:
        for right in request.access_rights:
            if right not in ACCESS_RIGHTS:
                raise HTTPException(status_code=400, detail=f"Invalid access right: {right}")
        entry.access_rights = ",".join(request.access_rights)

    if request.scopes is not None:
        scopes = _validate_scopes(request.scopes)
        if is_module_key_scopes(scopes) and entry.expires_at is None:
            raise HTTPException(
                status_code=400,
                detail="Module keys require an expiry — set expires_in_days first",
            )
        entry.scopes = json.dumps(scopes)
    if request.require_signed_requests is not None:
        entry.require_signed_requests = bool(request.require_signed_requests)

    if request.expires_in_days is not None:
        if is_module_key(entry) and request.expires_in_days not in MODULE_KEY_EXPIRY_DAYS:
            raise HTTPException(
                status_code=400,
                detail=f"Module keys expire in one of {list(MODULE_KEY_EXPIRY_DAYS)} days",
            )
        entry.expires_at = utcnow() + timedelta(days=request.expires_in_days)

    if request.associated_ip is not None:
        entry.associated_ip = request.associated_ip
    if request.associated_domain is not None:
        entry.associated_domain = request.associated_domain
    if request.associated_directory is not None:
        entry.associated_directory = request.associated_directory
    if request.single_use is not None:
        entry.single_use = request.single_use
        if not request.single_use:
            entry.consumed = False

    db.commit()
    db.refresh(entry)
    return entry


def delete_api_key(api_key_id: int, db: Session) -> None:
    entry = db.query(ApiKey).filter(ApiKey.id == api_key_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="API Key not found")
    db.delete(entry)
    db.commit()
