"""Webhook delivery (v2.0).

POSTs a JSON event payload to a product's webhook_url and records every
attempt in WebhookDelivery. Delivery never raises: failures are logged in
the database and the caller continues.
"""
import hashlib
import hmac
import json
import logging
from typing import Optional

import httpx
from sqlalchemy.orm import Session

from models import License, Product, WebhookDelivery

logger = logging.getLogger(__name__)

WEBHOOK_TIMEOUT_SECONDS = 5.0
MAX_RESPONSE_BODY_CHARS = 1000

# Events fired by the app.
EVENT_LICENSE_CREATED = "license.created"
EVENT_LICENSE_RENEWED = "license.renewed"
EVENT_LICENSE_REVOKED = "license.revoked"
EVENT_LICENSE_VALIDATED_FAILED = "license.validated_failed"
EVENT_LICENSE_EXPIRING = "license.expiring"
EVENT_LICENSE_EXPIRED = "license.expired"
EVENT_TEST = "license.test"


def license_payload(
    license_: License,
    product: Optional[Product],
    event: str,
    reason: Optional[str] = None,
) -> dict:
    """Standard webhook payload for a license event."""
    payload = {
        "event": event,
        "license_key": license_.key,
        "product_slug": product.slug if product else None,
        "owner_email": license_.owner_email,
        "expires_at": license_.expires_at.isoformat() if license_.expires_at else None,
    }
    if reason is not None:
        payload["reason"] = reason
    return payload


def _sign_body(secret: Optional[str], raw_body: bytes) -> Optional[str]:
    if not secret:
        return None
    return hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()


def dispatch_webhook(
    db: Session, product: Optional[Product], event: str, payload: dict
) -> Optional[WebhookDelivery]:
    """POST the payload to the product's webhook_url (if configured).

    Returns the WebhookDelivery row, or None when the product has no
    webhook_url. Never raises.
    """
    if product is None or not product.webhook_url:
        return None

    raw_body = json.dumps(payload).encode("utf-8")
    headers = {
        "Content-Type": "application/json",
        "X-LMP-Event": event,
    }
    signature = _sign_body(product.webhook_secret, raw_body)
    if signature is not None:
        headers["X-LMP-Signature"] = signature

    status_code: Optional[int] = None
    success = False
    response_body: Optional[str] = None
    try:
        # trust_env=False: webhook calls go direct to the configured URL and
        # must not pick up the host's HTTP(S)_PROXY env vars. httpx parses
        # no_proxy entries such as bare "[::1]" into URL patterns and raises
        # InvalidURL ("Invalid port: ':1]'") at client construction when
        # such entries exist, which would break every delivery.
        with httpx.Client(timeout=WEBHOOK_TIMEOUT_SECONDS, trust_env=False) as client:
            response = client.post(product.webhook_url, content=raw_body, headers=headers)
        status_code = response.status_code
        success = 200 <= response.status_code < 300
        response_body = (response.text or "")[:MAX_RESPONSE_BODY_CHARS]
    except Exception as exc:  # noqa: BLE001 - delivery must never raise
        logger.warning("Webhook delivery failed for %s (%s): %s", product.webhook_url, event, exc)
        response_body = str(exc)[:MAX_RESPONSE_BODY_CHARS]

    delivery = WebhookDelivery(
        product_id=product.id,
        event=event,
        url=product.webhook_url,
        status_code=status_code,
        success=success,
        response_body=response_body or None,
    )
    db.add(delivery)
    try:
        db.commit()
    except Exception:  # noqa: BLE001 - delivery logging must never break the caller
        db.rollback()
        logger.warning("Could not record webhook delivery for event %s", event)
        return None
    db.refresh(delivery)
    return delivery


def notify_license_event(
    db: Session,
    license_: License,
    event: str,
    reason: Optional[str] = None,
) -> Optional[WebhookDelivery]:
    """Fire a license event for the license's linked product (if any).

    The caller may pass a detached/expired license object; the product is
    resolved from license_.product_id. Returns the delivery row or None.
    """
    product = None
    if license_.product_id is not None:
        product = db.query(Product).filter(Product.id == license_.product_id).first()
    if product is None:
        return None
    payload = license_payload(license_, product, event, reason=reason)
    return dispatch_webhook(db, product, event, payload)


def check_expiring_licenses(db: Session, days: int = 7) -> dict:
    """Fire license.expiring / license.expired webhooks.

    - license.expiring: active licenses whose expiry falls within the next
      `days` days (and has not passed yet).
    - license.expired: active licenses whose expiry already passed.
    Only licenses whose product has a webhook_url configured produce a
    delivery (and are counted). Safe to call daily, e.g. from a cron job;
    each call fires once per license (no dedup state is kept).
    """
    from datetime import timedelta

    from database import utcnow

    now = utcnow()
    window_end = now + timedelta(days=days)
    expiring_notified = 0
    expired_notified = 0

    licenses = (
        db.query(License)
        .filter(License.status == "active", License.expires_at.isnot(None))
        .all()
    )
    for license_ in licenses:
        if license_.expires_at < now:
            delivery = notify_license_event(db, license_, EVENT_LICENSE_EXPIRED)
            if delivery is not None:
                expired_notified += 1
        elif license_.expires_at <= window_end:
            delivery = notify_license_event(db, license_, EVENT_LICENSE_EXPIRING)
            if delivery is not None:
                expiring_notified += 1
    return {"expiring_notified": expiring_notified, "expired_notified": expired_notified}
