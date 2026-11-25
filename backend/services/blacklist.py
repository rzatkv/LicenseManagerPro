"""IP / domain blacklist (v2.2).

A blacklisted value can never validate a license or pass an API-key
check, whatever else it presents. IP entries match exactly or as a CIDR
block (e.g. 203.0.113.0/24); domain entries match exactly or as a
subdomain (e.g. bad.example.com matches example.com).
"""
import ipaddress

from sqlalchemy.orm import Session

from models import BlacklistEntry


def _domain_matches(requested: str, blocked: str) -> bool:
    requested = requested.strip().lower()
    blocked = blocked.strip().lower()
    return requested == blocked or requested.endswith("." + blocked)


def _ip_matches(requested: str, blocked: str) -> bool:
    requested = requested.strip()
    blocked = blocked.strip()
    if requested == blocked:
        return True
    try:
        network = ipaddress.ip_network(blocked, strict=False)
    except ValueError:
        return False
    try:
        return ipaddress.ip_address(requested) in network
    except ValueError:
        return False


def is_blacklisted(db: Session, ip: str | None = None, domain: str | None = None) -> str | None:
    """Return the matching blacklist value, or None when nothing matches."""
    if ip:
        for entry in db.query(BlacklistEntry).filter(BlacklistEntry.type == "ip").all():
            if _ip_matches(ip, entry.value):
                return entry.value
    if domain:
        for entry in db.query(BlacklistEntry).filter(BlacklistEntry.type == "domain").all():
            if _domain_matches(domain, entry.value):
                return entry.value
    return None


def validate_entry_value(entry_type: str, value: str) -> None:
    """Raise ValueError when the value is not a usable ip/domain entry."""
    from fastapi import HTTPException

    value = (value or "").strip()
    if not value:
        raise HTTPException(status_code=400, detail="value is required")
    if entry_type == "ip":
        try:
            ipaddress.ip_network(value, strict=False)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid IP or CIDR block: {value}",
            )
    elif entry_type == "domain":
        if any(ch.isspace() for ch in value) or "." not in value:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid domain: {value}",
            )
    else:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid type: {entry_type} (expected ip or domain)",
        )
