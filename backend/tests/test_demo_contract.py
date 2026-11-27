"""Backend <-> demo-mock / frontend contract tests (v3.0.6).

Several lists exist twice — once in Python, once in the JS demo mock or
the frontend — because the demo must run standalone (no shared runtime
across the wire). They were verified in sync by hand in v3.0.6 and these
tests are what keeps them that way: edit one side without the other and
the suite fails loudly instead of drifting silently (duplicates audit
F4/F14/F15/F17/F18/F20).

All assertions parse the JS source as text (regex on the exact shapes);
if a JS file is restructured, update the extraction here alongside it.
"""
import json
import re
from pathlib import Path

from config import APP_VERSION
from schemas import BILLING_CYCLES
from services.downloads import KNOWN_MODULES
from services.settings import EDITABLE_VIA_API, SYSTEM_MANAGED, validate_setting_value
from services.sms import PROVIDERS
from services.users import USER_ROLES
from utils.permissions import (
    ALL_PERMISSIONS,
    ROLE_PERMISSIONS,
    ROLE_PERMISSION_ADDITIONS_V304,
)

REPO = Path(__file__).resolve().parents[2]
FRONTEND = REPO / "frontend" / "src"


def _read(path):
    return Path(path).read_text(encoding="utf-8")


def _quoted_list(text, anchor):
    """Parse ["a", "b"] following `anchor` (a regex) in JS source."""
    m = re.search(anchor + r"\s*=\s*\[([^\]]*)\]", text)
    assert m, f"anchor not found: {anchor}"
    return set(re.findall(r'"([^"]+)"', m.group(1)))


def _function_body(text, start_marker, end_marker="\n}\n"):
    # NOTE (v3.0.6): the default used to be the RAW string r"\n}\n"
    # (literal backslashes) — it could never match, so every caller
    # relying on it raised ValueError. It must be a real newline here.
    start = text.index(start_marker)
    end = text.index(end_marker, start)
    return text[start:end]


def test_known_modules_match_manifest():
    """F15: the downloads fallback (used when modules.json is missing)
    must say the same names/descriptions as modules.json."""
    manifest = json.loads((REPO / "modules.json").read_text())
    assert set(KNOWN_MODULES) == set(manifest)
    for mid, info in manifest.items():
        assert KNOWN_MODULES[mid]["name"] == info["name"], mid
        assert KNOWN_MODULES[mid]["description"] == info["description"], mid


def test_module_versions_parity():
    """F20: every module manifest, version.json and the release manifest
    carry the running app version (version parity)."""
    manifest = json.loads((REPO / "modules.json").read_text())
    assert set(manifest) == {
        "whmcs", "woocommerce", "wordpress", "joomla", "prestashop",
        "magento", "opencart", "shopware", "drupal", "odoo",
    }
    for mid, info in manifest.items():
        assert info["version"] == APP_VERSION, mid
        assert f"/v{APP_VERSION}/licensemanagerpro-{mid}-{APP_VERSION}.zip" in info["download"], mid
        version_json = json.loads((REPO / "modules" / mid / "version.json").read_text())
        assert version_json["version"] == APP_VERSION, mid
    dist_manifest_path = REPO / "dist" / "manifest.json"
    if dist_manifest_path.exists():
        # dist/ is gitignored (release assets); when present (after
        # scripts/build-module-zips.sh) it must agree too.
        dist_manifest = json.loads(dist_manifest_path.read_text())
        assert dist_manifest["app_version"] == APP_VERSION
        assert {m["id"] for m in dist_manifest["modules"]} == set(manifest)
        assert {m["version"] for m in dist_manifest["modules"]} == {APP_VERSION}


def test_demo_module_copy_matches_manifest():
    """F15: the demo mock's module names/descriptions must copy
    modules.json verbatim (7 of 10 had drifted into paraphrases)."""
    manifest = json.loads((REPO / "modules.json").read_text())
    demo = _read(FRONTEND / "utils" / "demoData.js")
    for mid, info in manifest.items():
        m = re.search(
            r'\{id: "' + re.escape(mid) + r'", name: "([^"]*)", version: APP_VERSION, description: "([^"]*)"\}',
            demo,
        )
        assert m, f"demo module entry missing: {mid}"
        assert m.group(1) == info["name"], mid
        assert m.group(2) == info["description"], mid


def test_permissions_match_demo_mock():
    """F14: the 27 permission keys exist once in the backend and once in
    the demo mock (GET /roles/permissions list)."""
    demo = _read(FRONTEND / "utils" / "demoData.js")
    m = re.search(r'return \["api_keys:create"((?:, "[^"]+")*)\];', demo)
    assert m, "demo permission list not found"
    demo_perms = {"api_keys:create"} | set(re.findall(r'"([^"]+)"', m.group(1)))
    assert sorted(demo_perms) == ALL_PERMISSIONS
    assert len(demo_perms) == 27


def test_manager_seed_matches_demo():
    """F14: the manager builtin role seeds the same permissions in the
    backend and in the demo mock (19 since v3.0.6, L14: dashboard:read)."""
    demo = _read(FRONTEND / "utils" / "demoData.js")
    m = re.search(r'slug: "manager".*?permissions: \[([^\]]+)\]', demo)
    assert m, "demo manager seed not found"
    demo_manager = set(re.findall(r'"([^"]+)"', m.group(1)))
    assert demo_manager == ROLE_PERMISSIONS["manager"]
    assert len(demo_manager) == 19


def test_permission_additions_subset():
    """F14: the v3.0.4 additions constant is a migration record for
    existing installs (seed_roles merges it into stored rows) — it must
    stay a subset of the current defaults, so editing one list without
    the other fails here instead of diverging fresh vs upgraded installs."""
    for role, additions in ROLE_PERMISSION_ADDITIONS_V304.items():
        assert additions, f"{role}: empty additions"
        assert additions <= ROLE_PERMISSIONS[role], role
        assert additions <= set(ALL_PERMISSIONS), role
    # v3.0.6 (security, L14): the same subset rule for the new additions.
    from utils.permissions import ROLE_PERMISSION_ADDITIONS_V306

    for role, additions in ROLE_PERMISSION_ADDITIONS_V306.items():
        assert additions, f"{role}: empty additions"
        assert additions <= ROLE_PERMISSIONS[role], role
        assert additions <= set(ALL_PERMISSIONS), role


def test_settings_keys_match_demo():
    """F17: editable + system-managed setting keys exist once per side."""
    demo = _read(FRONTEND / "utils" / "demoData.js")
    assert _quoted_list(demo, r"const EDITABLE_SETTINGS") == set(EDITABLE_VIA_API)
    assert _quoted_list(demo, r"const SYSTEM_MANAGED_SETTINGS") == set(SYSTEM_MANAGED)


def test_settings_validation_keys_match_demo():
    """F4: backend validate_setting_value and the demo's
    validateSettingValue must handle the same keys (same rules, same
    messages — verified by hand; this locks the key sets together)."""
    backend = _read(REPO / "backend" / "services" / "settings.py")
    body = _function_body(backend, "def validate_setting_value", end_marker="\ndef ")
    backend_keys = set(re.findall(r'key == "([^"]+)"', body))
    backend_keys |= set(
        k.strip().strip('"')
        for m in re.findall(r'key in \(([^)]+)\)', body)
        for k in m.split(",")
    )
    demo = _read(FRONTEND / "utils" / "demoData.js")
    demo_body = _function_body(demo, "function validateSettingValue(key, value) {")
    demo_keys = set(re.findall(r'key === "([^"]+)"', demo_body))
    assert backend_keys == demo_keys, f"backend={sorted(backend_keys)} demo={sorted(demo_keys)}"
    assert len(backend_keys) == 11


def test_sms_providers_match():
    """F18: the three SMS providers exist in the backend, the Settings
    page and the demo seed."""
    settings_js = _read(FRONTEND / "pages" / "Settings.js")
    assert _quoted_list(settings_js, r"const SMS_PROVIDERS") == set(PROVIDERS)
    demo = _read(FRONTEND / "utils" / "demoData.js")
    # The seed nests braces (providers: {ippanel: {}, ...}), so match
    # the provider ids as object keys instead of balancing braces.
    demo_providers = set(re.findall(r"\b(ippanel|kavenegar|faraz)\b(?=\s*:\s*\{)", demo))
    assert demo_providers == set(PROVIDERS), demo_providers


def test_theme_ids_match_frontend():
    """F18: the backend theme-id allowlist is the frontend THEME_PRESETS
    list (40 ids); 'custom' is a separate builder value, not a preset."""
    from routers.users import THEME_PRESETS as backend_presets

    theme_js = _read(FRONTEND / "theme.js")
    start = theme_js.index("export const THEME_PRESETS = [")
    end = theme_js.index("\n];", start)
    frontend_ids = set(re.findall(r'id: "([^"]+)"', theme_js[start:end]))
    assert frontend_ids == backend_presets - {"custom"}, (
        f"frontend-only={sorted(frontend_ids - backend_presets)} "
        f"backend-only={sorted(backend_presets - {'custom'} - frontend_ids)}"
    )
    assert len(frontend_ids) == 40


def test_roles_match_demo():
    """F18: the four roles exist once per side."""
    demo = _read(FRONTEND / "utils" / "demoData.js")
    assert _quoted_list(demo, r"export const ROLES") == set(USER_ROLES)


def test_billing_cycles_match():
    """F18: the six billing cycles exist in the backend, the demo mock
    and the i18n cycle.* keys."""
    demo = _read(FRONTEND / "utils" / "demoData.js")
    assert _quoted_list(demo, r"export const BILLING_CYCLES") == set(BILLING_CYCLES)
    assert len(BILLING_CYCLES) == 6
    translations = _read(FRONTEND / "i18n" / "translations.js")
    i18n_cycles = {c for c in re.findall(r'"cycle\.([a-z]+)"', translations)}
    assert i18n_cycles == set(BILLING_CYCLES)


def test_audit_channels_match():
    """F18: audit channels exist in the backend prefix map, the AuditLogs
    page and the i18n audit.channel.* keys ('all' is a UI-only filter)."""
    audit_py = _read(REPO / "backend" / "routers" / "audit_logs.py")
    body = _function_body(audit_py, "prefixes = {", end_marker="}")
    backend_channels = set(re.findall(r'"(\w+)":', body))
    audit_js = _read(FRONTEND / "pages" / "AuditLogs.js")
    page_channels = _quoted_list(audit_js, r"const CHANNELS")
    assert page_channels == backend_channels | {"all"}
    translations = _read(FRONTEND / "i18n" / "translations.js")
    i18n_channels = set(re.findall(r'"audit\.channel\.([a-z]+)"', translations))
    assert i18n_channels == backend_channels | {"all"}


def test_version_agreement():
    """F20: the single version constant agrees everywhere it is written
    down (frontend version.js, package.json, module manifests, news)."""
    version_js = _read(FRONTEND / "version.js")
    m = re.search(r'APP_VERSION = "([^"]+)"', version_js)
    assert m and m.group(1) == APP_VERSION
    package = json.loads((REPO / "frontend" / "package.json").read_text())
    assert package["version"] == APP_VERSION
    news = json.loads((REPO / "news.json").read_text())
    assert APP_VERSION in news["items"][0]["title"]["en"]
    assert news["items"][0]["id"] == f"v{APP_VERSION.replace('.', '')}-release"


def test_validate_setting_value_rejects_garbage():
    """F4 (behaviour, not just keys): the on/off toggles reject anything
    that is not on/off on the backend, exactly like the demo mock."""
    import pytest
    from fastapi import HTTPException

    for key in ("strip_4byte", "product_notes_enabled", "maintenance_mode"):
        with pytest.raises(HTTPException):
            validate_setting_value(key, "maybe")
        validate_setting_value(key, "on")
        validate_setting_value(key, "off")


def _js_object_map(text, anchor):
    """Parse `anchor = {event: [...], ...}` in JS source into
    {event: [items]} (single-line entries only)."""
    start = text.index(anchor)
    end = text.index("\n};", start)
    body = text[start:end]
    out = {}
    for m in re.finditer(r'(\w+): \[([^\]]*)\]', body):
        out[m.group(1)] = re.findall(r'"([^"]+)"', m.group(2))
    return out


def test_notification_texts_and_patterns_match_frontend():
    """v3.0.7: the editable texts + ippanel pattern codes exist once per
    side — same events, same per-event variables, same defaults, same
    pattern param keys and length caps. Edit one side without the other
    and this fails loudly instead of drifting silently."""
    from services.notify_channels import (
        DEFAULT_TEXTS,
        EVENTS,
        MAX_PATTERN_CODE_LENGTH,
        MAX_TEXT_LENGTH,
        NOTIFY_TEXT_VARIABLES,
        PATTERN_PARAM_KEYS,
    )

    # Events: backend, Settings page, demo mock.
    settings_js = _read(FRONTEND / "pages" / "Settings.js")
    assert _quoted_list(settings_js, r"const NOTIFY_EVENTS") == set(EVENTS)
    demo = _read(FRONTEND / "utils" / "demoData.js")
    assert _quoted_list(demo, r"const NOTIFY_EVENTS") == set(EVENTS)

    # Per-event template variables: backend vs Settings page.
    assert _js_object_map(settings_js, "const NOTIFY_TEXT_VARIABLES = {") == {
        event: list(NOTIFY_TEXT_VARIABLES[event]) for event in EVENTS
    }

    # Defaults: backend vs demo mock (byte-identical hardcoded output).
    assert re.search(
        r'const DEFAULT_NOTIFY_TEXT = \{sms: "\{title\}: \{message\}", telegram: "\{title\}\\n\{message\}"\}',
        demo,
    ), "demo DEFAULT_NOTIFY_TEXT drifted from the backend defaults"
    for event in EVENTS:
        assert DEFAULT_TEXTS[event] == {
            "sms": "{title}: {message}",
            "telegram": "{title}\n{message}",
        }

    # Pattern params: backend vs demo mock, same keys and cap.
    assert _quoted_list(demo, r"const PATTERN_PARAM_KEYS") == set(PATTERN_PARAM_KEYS)
    assert re.search(
        rf"const MAX_PATTERN_CODE_LENGTH = {MAX_PATTERN_CODE_LENGTH};", demo
    ), "demo pattern-code cap drifted"
    assert re.search(
        rf"const MAX_NOTIFY_TEXT_LENGTH = {MAX_TEXT_LENGTH};", demo
    ), "demo text cap drifted"

    # The pattern send only ever carries the listed variables.
    assert set(PATTERN_PARAM_KEYS) == set(NOTIFY_TEXT_VARIABLES["license_expiring"]) | {
        "title",
        "message",
        "role",
    }
