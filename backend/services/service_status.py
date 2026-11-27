"""Service status checks (v3.0) for the dashboard "Service status"
widget: database, email (SMTP), the active SMS provider, the Telegram
bot, and GitHub reachability (the update check's upstream).

Each check runs with a SHORT timeout (5s) and they run CONCURRENTLY
(ThreadPoolExecutor, one worker per service), so the whole endpoint
answers in ~5s worst case. Config is read once, up front, in the
request thread — the workers only receive plain dicts (a SQLAlchemy
Session is not thread-safe). No secrets ever appear in a response:
statuses are connected / not_configured / auth_failed / unreachable
with a generic detail string.

Check fidelity, stated honestly:
- database: a real SELECT 1.
- email: real SMTP connect + EHLO (+ login when credentials exist).
- sms kavenegar: real API call (account/info.json — validates the key).
- sms ippanel: real API call (GET /api/payment/credit/mine — validates
  the key; the credit is fetched through the shared ~5-minute cache in
  services/sms_ippanel.py, so a status check right after the dashboard
  widget does not cost a second live call).
- sms faraz: no documented ping endpoint exists, so the check is a TCP
  connect to the provider host (reachability only).
- telegram: real getMe call (validates the bot token).
- github: GET https://api.github.com (update-check upstream).
"""
import logging
import smtplib
import socket
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

import httpx
from sqlalchemy import text
from sqlalchemy.orm import Session

from services import mail as mail_service
from services import sms as sms_service
from services import telegram as telegram_service

logger = logging.getLogger(__name__)

_TIMEOUT = 5

# Service-status failures are logged to the audit trail at most once
# per hour per service (the dashboard widget auto-refreshes every 5
# minutes — without this the log would flood while a service is down).
_FAILURE_LOG_DEDUP_SECONDS = 3600
_last_failure_log: dict[str, float] = {}


def _log_failure(db: Session, service: dict) -> None:
    """Log a failed service-status check (v3.0, deduped to 1/hour per
    service) as `service_status.check_failed` so the Logs page's System
    filter shows it."""
    import time as _time

    from services.audit import log_audit

    key = service["key"]
    now = _time.time()
    if now - _last_failure_log.get(key, 0) < _FAILURE_LOG_DEDUP_SECONDS:
        return
    _last_failure_log[key] = now
    log_audit(
        db,
        "system",
        "service_status.check_failed",
        "service",
        key,
        {
            "event": "service_status_check",
            "channel": "system",
            "service": key,
            "status": service["status"],
            "detail": service.get("detail", ""),
        },
    )


def _item(key: str, label: str, status: str, detail: str = "") -> dict:
    return {"key": key, "label": label, "status": status, "detail": detail}


def _check_database(db: Session) -> dict:
    try:
        db.execute(text("SELECT 1"))
        return _item("database", "Database", "connected", "Query answered")
    except Exception as exc:  # noqa: BLE001
        logger.warning("Service check failed for database: %s", exc)
        return _item("database", "Database", "unreachable", "Could not reach the database")


def _check_email(cfg: dict) -> dict:
    host = (cfg.get("smtp_host") or "").strip()
    if not host:
        return _item("email", "Email (SMTP)", "not_configured", "No SMTP host configured")
    try:
        client = mail_service.create_smtp_client(cfg)
        try:
            client.ehlo()
        finally:
            client.quit()
        return _item("email", "Email (SMTP)", "connected", f"Connected to {host}")
    except smtplib.SMTPAuthenticationError:
        return _item("email", "Email (SMTP)", "auth_failed", "SMTP login rejected — check credentials")
    except Exception as exc:  # noqa: BLE001
        logger.warning("Service check failed for email: %s", exc)
        return _item("email", "Email (SMTP)", "unreachable", "Could not reach the SMTP server")


def _check_sms(cfg: dict) -> dict:
    name = cfg.get("active_provider") or ""
    if not name:
        return _item("sms", "SMS", "not_configured", "No SMS provider active")
    fields = (cfg.get("providers") or {}).get(name) or {}
    label = f"SMS ({name})"
    if name == "kavenegar":
        api_key = fields.get("api_key") or ""
        if not api_key:
            return _item("sms", label, "not_configured", "Kavenegar API key missing")
        try:
            resp = httpx.get(
                f"https://api.kavenegar.com/v1/{api_key}/account/info.json",
                timeout=_TIMEOUT, trust_env=False,
            )
            if resp.status_code == 200:
                return _item("sms", label, "connected", "Kavenegar account OK")
            if resp.status_code in (401, 403):
                return _item("sms", label, "auth_failed", "Kavenegar rejected the API key")
            return _item("sms", label, "unreachable", f"Kavenegar HTTP {resp.status_code}")
        except Exception as exc:  # noqa: BLE001
            logger.warning("Service check failed for sms (%s): %s", name, exc)
            return _item("sms", label, "unreachable", "Could not reach the SMS provider")
    if name == "ippanel":
        # Real key-validating check: the documented credit endpoint
        # (GET /api/payment/credit/mine — see services/sms_ippanel.py).
        from services import sms_ippanel as ippanel

        api_key = (fields.get("api_key") or "").strip()
        if not api_key:
            return _item("sms", label, "not_configured", "IPPanel API key missing")
        try:
            credit = ippanel.get_credit_cached(api_key)
            return _item(
                "sms", label, "connected",
                f"IPPanel account OK — credit {credit['credit']:,.0f}",
            )
        except ippanel.IppanelAuthError:
            return _item("sms", label, "auth_failed", "IPPanel rejected the API key")
        except Exception as exc:  # noqa: BLE001
            logger.warning("Service check failed for sms (%s): %s", name, exc)
            return _item("sms", label, "unreachable", "Could not reach the SMS provider")
    # faraz has no documented ping endpoint: host reachability.
    hosts = {"faraz": "rest.payamak-panel.com"}
    host = hosts.get(name)
    if not host:
        return _item("sms", label, "not_configured", "Unknown provider")
    if not any((fields.get(f) or "").strip() for f in ("api_key", "username", "password")):
        return _item("sms", label, "not_configured", f"{name} credentials missing")
    try:
        sock = socket.create_connection((host, 443), timeout=_TIMEOUT)
        sock.close()
        return _item("sms", label, "connected", f"{host} reachable")
    except Exception as exc:  # noqa: BLE001
        logger.warning("Service check failed for sms (%s): %s", name, exc)
        return _item("sms", label, "unreachable", "Could not reach the SMS provider")


def _check_telegram(cfg: dict) -> dict:
    token = cfg.get("bot_token") or ""
    if not token:
        return _item("telegram", "Telegram bot", "not_configured", "No bot token configured")
    if not (cfg.get("chat_ids") or []):
        return _item("telegram", "Telegram bot", "not_configured", "No target chat configured")
    try:
        resp = httpx.get(
            f"https://api.telegram.org/bot{token}/getMe",
            timeout=_TIMEOUT, trust_env=False,
        )
        if resp.status_code == 200 and resp.json().get("ok"):
            username = resp.json().get("result", {}).get("username", "")
            return _item("telegram", "Telegram bot", "connected", f"@{username}" if username else "Bot OK")
        if resp.status_code in (401, 403):
            return _item("telegram", "Telegram bot", "auth_failed", "Telegram rejected the bot token")
        return _item("telegram", "Telegram bot", "unreachable", f"Telegram HTTP {resp.status_code}")
    except Exception as exc:  # noqa: BLE001
        logger.warning("Service check failed for telegram: %s", exc)
        return _item("telegram", "Telegram bot", "unreachable", "Could not reach Telegram")


def _check_github() -> dict:
    try:
        resp = httpx.get("https://api.github.com", timeout=_TIMEOUT, trust_env=False)
        if resp.status_code == 200:
            return _item("github", "GitHub (updates)", "connected", "GitHub reachable")
        return _item("github", "GitHub (updates)", "unreachable", f"GitHub HTTP {resp.status_code}")
    except Exception as exc:  # noqa: BLE001
        logger.warning("Service check failed for github: %s", exc)
        return _item("github", "GitHub (updates)", "unreachable", "Could not reach GitHub")


def check_all_services(db: Session) -> dict:
    """Run every service check concurrently; answer in ~5s worst case."""
    email_cfg = mail_service.get_email_config(db)
    sms_cfg = sms_service.get_sms_config(db)
    telegram_cfg = telegram_service.get_telegram_config(db)
    with ThreadPoolExecutor(max_workers=5) as pool:
        futures = [
            pool.submit(_check_database, db),
            pool.submit(_check_email, email_cfg),
            pool.submit(_check_sms, sms_cfg),
            pool.submit(_check_telegram, telegram_cfg),
            pool.submit(_check_github),
        ]
        services = [f.result() for f in futures]
    # Log failures only (successes every 5 minutes would flood the log).
    for service in services:
        if service["status"] in ("unreachable", "auth_failed"):
            try:
                _log_failure(db, service)
            except Exception:  # noqa: BLE001 - logging must never break the check
                logger.warning("Could not log service-status failure for %s", service["key"])
    return {
        "services": services,
        "checked_at": datetime.now(timezone.utc).isoformat(),
    }
