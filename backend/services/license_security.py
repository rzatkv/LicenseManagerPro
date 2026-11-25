"""License security configuration (v2.3).

The global config lives in the `license_security` system setting (a JSON
object, seeded in database.seed_settings). A product may override any
key via its `security_overrides` JSON column. The effective config for a
license is global merged with the linked product's overrides.

Keys:
- strictness: "strict" | "lenient"
    strict  — any enforced lock mismatch denies validation.
    lenient — a lock mismatch still validates, but the response carries
              grace=true and a warning (the client is expected to fix
              the lock; the event is also audit-logged by the caller).
- enforce_domain_lock / enforce_ip_lock / enforce_install_path_lock:
  when false, that lock is ignored entirely.
- enforce_activation_limit: when false, max_activations is not enforced.
- missing_lock_behavior: "deny" | "allow" — what happens when the
  license HAS a lock configured but the client sent no value for it
  (e.g. no domain in the validate call).
"""

import json

from sqlalchemy.orm import Session

DEFAULT_LICENSE_SECURITY = {
    "strictness": "strict",
    "enforce_domain_lock": True,
    "enforce_ip_lock": True,
    "enforce_install_path_lock": True,
    "enforce_activation_limit": True,
    "missing_lock_behavior": "deny",
}

_SETTING_KEY = "license_security"


def _clean(raw: dict, base: dict | None = None) -> dict:
    """Merge a raw config over `base` (defaults when omitted), keeping
    only known keys and coercing each value to its expected type; unknown
    or invalid values keep the base value so a bad setting can never
    open a hole or silently reset an unrelated key."""
    cfg = dict(base if base is not None else DEFAULT_LICENSE_SECURITY)
    if not isinstance(raw, dict):
        return cfg
    if raw.get("strictness") in ("strict", "lenient"):
        cfg["strictness"] = raw["strictness"]
    for key in (
        "enforce_domain_lock",
        "enforce_ip_lock",
        "enforce_install_path_lock",
        "enforce_activation_limit",
    ):
        if key in raw and raw[key] is not None:
            cfg[key] = bool(raw[key])
    if raw.get("missing_lock_behavior") in ("deny", "allow"):
        cfg["missing_lock_behavior"] = raw["missing_lock_behavior"]
    return cfg


def get_license_security_config(db: Session) -> dict:
    """The global license-security config (defaults when unset/invalid)."""
    from models import SystemSetting

    setting = db.query(SystemSetting).filter(SystemSetting.key == _SETTING_KEY).first()
    if setting is None:
        return dict(DEFAULT_LICENSE_SECURITY)
    try:
        return _clean(json.loads(setting.value or "{}"))
    except (ValueError, TypeError):
        return dict(DEFAULT_LICENSE_SECURITY)


def set_license_security_config(db: Session, raw: dict) -> dict:
    """Validate + persist a (possibly partial) config update; keys not
    sent keep their stored values. Returns the stored config."""
    from models import SystemSetting

    cfg = _clean(raw if isinstance(raw, dict) else {}, base=get_license_security_config(db))
    setting = db.query(SystemSetting).filter(SystemSetting.key == _SETTING_KEY).first()
    if setting is None:
        db.add(SystemSetting(key=_SETTING_KEY, value=json.dumps(cfg)))
    else:
        setting.value = json.dumps(cfg)
    db.commit()
    return cfg


def effective_license_security(db: Session, product=None) -> dict:
    """Global config merged with a product's overrides (if any)."""
    cfg = get_license_security_config(db)
    if product is not None and getattr(product, "security_overrides", None):
        try:
            overrides = json.loads(product.security_overrides or "{}")
        except (ValueError, TypeError):
            overrides = {}
        if isinstance(overrides, dict):
            cfg = _clean({**cfg, **overrides})
    return cfg
