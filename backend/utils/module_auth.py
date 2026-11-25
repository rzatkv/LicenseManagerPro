"""Dual authentication for module-facing endpoints (v2.3).

WHMCS/WooCommerce connect with an API key ONLY — never with an admin
email/password. Each module-facing route accepts EITHER:

- a JWT (the admin panel's normal auth), with the route's usual
  permission, OR
- an ``X-API-Key`` header carrying a module-scoped key
  (``scopes=["module"]``), verified by
  services.api_keys.validate_api_key_usage with the route's required
  module scope (including the optional HMAC signed-request check).

A module key can NEVER call an admin endpoint: routes that do not list
a module scope reject API keys outright (403), and module scopes never
include users/roles/settings/blacklist/system-write. Every successful
module-key call is audit-logged (key id, endpoint, scope).

Note: the module replay cache in services/api_keys is per-process; a
multi-worker deployment accepts a replayed signature in a different
worker inside the 5-minute timestamp window. The window bounds the
exposure; single-worker deployments are fully protected.
"""

from fastapi import Depends, HTTPException, Request, Security
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from database import get_db
from models import User
from services import api_keys as api_key_service
from services.audit import log_audit
from utils.auth import security, verify_access_token
from utils.permissions import user_has_permission


def _jwt_user(credentials: HTTPAuthorizationCredentials | None, db: Session) -> User:
    """The get_current_user logic, usable inside this dependency."""
    if credentials is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = verify_access_token(credentials.credentials)
    if payload.get("purpose") is not None:
        raise HTTPException(status_code=401, detail="Invalid token")
    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = db.query(User).filter(User.id == int(user_id)).first()
    if user is None or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive")
    return user


def require_actor(jwt_perm: str | None = None, module_scope: str | None = None):
    """FastAPI dependency factory for module-facing routes.

    ``jwt_perm``: permission a JWT user must hold (None = any
    authenticated user; "*" = admin). ``module_scope``: scope a module
    API key must hold (None = API keys are rejected on this route).

    Returns {"kind": "user", "user": User} or
    {"kind": "module", "key": ApiKey}.
    """

    async def _actor(
        request: Request,
        db: Session = Depends(get_db),
        credentials: HTTPAuthorizationCredentials | None = Security(security),
    ) -> dict:
        api_key = request.headers.get("x-api-key")
        if api_key:
            if module_scope is None:
                raise HTTPException(status_code=403, detail="API keys cannot call this endpoint")
            body = await request.body()
            client_ip = request.client.host if request.client else None
            entry = api_key_service.validate_api_key_usage(
                api_key,
                db,
                client_ip=client_ip,
                required_scope=module_scope,
                signed_request={
                    "method": request.method,
                    "path": request.url.path,
                    "timestamp": request.headers.get("x-lmp-timestamp", ""),
                    "signature": request.headers.get("x-lmp-signature", ""),
                    "body": body,
                },
            )
            log_audit(
                db,
                f"module-key:{entry.id}",
                "module.api_call",
                "api_key",
                entry.id,
                {
                    "scope": module_scope,
                    "method": request.method,
                    "path": request.url.path,
                },
            )
            return {"kind": "module", "key": entry}
        user = _jwt_user(credentials, db)
        if jwt_perm is not None and not user_has_permission(user, jwt_perm):
            raise HTTPException(status_code=403, detail=f"Permission '{jwt_perm}' required")
        return {"kind": "user", "user": user}

    return _actor
