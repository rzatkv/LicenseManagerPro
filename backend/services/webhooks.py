"""Webhook delivery (v2.0).

POSTs a JSON event payload to a product's webhook_url and records every
attempt in WebhookDelivery. Delivery never raises: failures are logged in
the database and the caller continues.
"""
import hashlib
import hmac
import ipaddress
import json
import logging
import socket
from urllib.parse import urlparse

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
EVENT_LICENSE_REISSUED = "license.reissued"
EVENT_LICENSE_VALIDATED_FAILED = "license.validated_failed"
EVENT_LICENSE_EXPIRING = "license.expiring"
EVENT_LICENSE_EXPIRED = "license.expired"
EVENT_TEST = "license.test"


def license_payload(
    license_: License,
    product: Product | None,
    event: str,
    reason: str | None = None,
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


def validate_webhook_url(url: str) -> tuple[bool, str]:
    """SSRF guard for a webhook URL (v2.3).

    Returns (allowed, reason). Only http/https URLs whose host resolves
    to public addresses are allowed: localhost, private, loopback,
    link-local, multicast and reserved ranges are blocked, so a webhook
    cannot be pointed at the host itself, the internal network, or a
    cloud metadata endpoint (e.g. 169.254.169.254).

    Honest limitation: the DNS lookup and the request are not atomic —
    a DNS-rebinding attack (a host whose records change between the
    check and the POST) is not prevented by this guard. The check runs
    immediately before the request, which keeps the window tiny.
    """
    try:
        parsed = urlparse(url or "")
    except ValueError:
        return False, "not a valid URL"
    if parsed.scheme not in ("http", "https"):
        return False, "webhook URL must use http or https"
    if not parsed.hostname:
        return False, "webhook URL has no host"
    try:
        infos = socket.getaddrinfo(parsed.hostname, None)
    except socket.gaierror:
        return False, "webhook host does not resolve"
    for _family, _type, _proto, _canon, sockaddr in infos:
        try:
            addr = ipaddress.ip_address(sockaddr[0])
        except ValueError:
            return False, "webhook host resolves to an invalid address"
        if (
            addr.is_private
            or addr.is_loopback
            or addr.is_link_local
            or addr.is_multicast
            or addr.is_reserved
            or addr.is_unspecified
        ):
            return False, f"webhook host resolves to a non-public address ({addr})"
    return True, ""


def _sign_body(secret: str | None, raw_body: bytes) -> str | None:
    if not secret:
        return None
    return hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()


def dispatch_webhook(
    db: Session, product: Product | None, event: str, payload: dict
) -> WebhookDelivery | None:
    """POST the payload to the product's webhook_url (if configured).

    Returns the WebhookDelivery row, or None when the product has no
    webhook_url. Never raises. A URL that fails the SSRF guard is NOT
    requested: the delivery is recorded as failed with the reason.
    """
    if product is None or not product.webhook_url:
        return None

    allowed, reason = validate_webhook_url(product.webhook_url)
    if not allowed:
        logger.warning(
            "Webhook delivery blocked for %s (%s): %s",
            product.webhook_url,
            event,
            reason,
        )
        delivery = WebhookDelivery(
            product_id=product.id,
            event=event,
            url=product.webhook_url,
            status_code=None,
            success=False,
            response_body=f"blocked: {reason}",
        )
        db.add(delivery)
        try:
            db.commit()
        except Exception:
            db.rollback()
            return None
        db.refresh(delivery)
        from services import notify_channels as notify_channels_service

        notify_channels_service.notify_event(
            db,
            "webhook_blocked",
            "Webhook delivery blocked",
            f"{event} to {product.webhook_url} was blocked ({reason}).",
            type_="error",
            link="/products",
        )
        return delivery

    raw_body = json.dumps(payload).encode("utf-8")
    headers = {
        "Content-Type": "application/json",
        "X-LMP-Event": event,
    }
    signature = _sign_body(product.webhook_secret, raw_body)
    if signature is not None:
        headers["X-LMP-Signature"] = signature

    status_code: int | None = None
    success = False
    response_body: str | None = None
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
    except Exception as exc:
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
    except Exception:
        db.rollback()
        logger.warning("Could not record webhook delivery for event %s", event)
        return None
    db.refresh(delivery)
    if not success:
        # A failed delivery is also an in-app notification (v2.2) so the
        # admin sees it without digging through the deliveries table.
        from services import notify_channels as notify_channels_service

        notify_channels_service.notify_event(
            db,
            "webhook_failed",
            "Webhook delivery failed",
            f"{event} to {product.webhook_url} failed"
            + (f" (HTTP {status_code})" if status_code else ""),
            type_="error",
            link="/products",
        )
    return delivery


def notify_license_event(
    db: Session,
    license_: License,
    event: str,
    reason: str | None = None,
) -> WebhookDelivery | None:
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
            # In-app notification too (v2.2): one per license.
            from services import notify_channels as notify_channels_service

            notify_channels_service.notify_event(
                db,
                "license_expired",
                "License expired",
                f"License {license_.key} for {license_.product} has expired.",
                type_="warning",
                link="/licenses",
                context={
                    "license_key": license_.key,
                    "product_name": license_.product,
                    "expiry_date": license_.expires_at.isoformat() if license_.expires_at else "",
                    "user_email": license_.owner_email or "",
                },
            )
        elif license_.expires_at <= window_end:
            delivery = notify_license_event(db, license_, EVENT_LICENSE_EXPIRING)
            if delivery is not None:
                expiring_notified += 1
            from services import notify_channels as notify_channels_service

            days_left = (license_.expires_at - now).days
            notify_channels_service.notify_event(
                db,
                "license_expiring",
                "License expiring soon",
                f"License {license_.key} for {license_.product} expires in {days_left} day(s).",
                type_="warning",
                link="/licenses",
                context={
                    "license_key": license_.key,
                    "product_name": license_.product,
                    "expiry_date": license_.expires_at.isoformat() if license_.expires_at else "",
                    "days_left": str(days_left),
                    "user_email": license_.owner_email or "",
                },
            )
    return {"expiring_notified": expiring_notified, "expired_notified": expired_notified}
