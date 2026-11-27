"""Shared notification-template renderer (v3.0.8): one renderer for
email, SMS and Telegram — %var%, {var} and {{var}} in every channel,
%client% with its documented fallback chain."""
from services import notify_channels as texts
from services import template_render as tr
from services import templates as tpl_service

TITLE = "License created"
MESSAGE = "License LIC-1 for Widget was created."
CTX = {
    "license_key": "LIC-1",
    "product_name": "Widget",
    "expiry_date": "2027-01-31",
    "days_left": "7",
    "user_email": "buyer@example.com",
    "role": "viewer",
    "site_name": "License Manager Pro",
}


def test_user_example_renders_with_sample_values():
    """The user's own example (2026-11-27): %client% / %license% with
    the guide's sample values."""
    rendered = tr.render_template_text(
        "%client% عزیز\nلایسنس شما ایجاد شد.\nکد لایسنس : %license%",
        tr.sample_context(),
        fallback="FALLBACK",
    )
    assert rendered == (
        "علی رضایی عزیز\nلایسنس شما ایجاد شد.\nکد لایسنس : XXXX-XXXX-XXXX-XXXX"
    )


def test_all_three_syntaxes_and_every_variable():
    template = (
        "%title% | {title} | {{title}} — "
        "%client%/{client_name} | %license%/{license_key} | "
        "%product%/{product_name} | %expiry%/{expiry_date} | "
        "%days%/{days_left} | %email%/{user_email} | "
        "{role} | {{role}} | %role% | {site_name} | {{site_name}} | "
        "%code%/{code}"
    )
    ctx = {**CTX, "title": "License created", "client_name": "Sara Ahmadi", "code": "482917"}
    rendered = tr.render_template_text(template, ctx, fallback="FALLBACK")
    assert rendered == (
        "License created | License created | License created — "
        "Sara Ahmadi/Sara Ahmadi | LIC-1/LIC-1 | "
        "Widget/Widget | 2027-01-31/2027-01-31 | "
        "7/7 | buyer@example.com/buyer@example.com | "
        "viewer | viewer | viewer | License Manager Pro | License Manager Pro | "
        "482917/482917"
    )


def test_braces_and_percent_forms_do_not_half_eat_each_other():
    # {{x}} must substitute as one placeholder, not as { + {x} + }.
    assert tr.render_template_text("{{license_key}}", CTX, "FB") == "LIC-1"
    assert tr.render_template_text("{license_key}", CTX, "FB") == "LIC-1"
    assert tr.render_template_text("%license_key%", CTX, "FB") == "LIC-1"
    # A bare percent with no closing % is plain text, not a placeholder.
    assert tr.render_template_text("100% sure", CTX, "FB") == "100% sure"
    assert tr.render_template_text(
        "50% off {title}", {**CTX, "title": "License created"}, "FB"
    ) == "50% off License created"


def test_unknown_placeholders_stay_literal_in_all_syntaxes(caplog):
    rendered = tr.render_template_text(
        "{nope} %nope% {{nope}} {title}",
        {**CTX, "title": "License created"},
        fallback="FALLBACK",
    )
    assert rendered == "{nope} %nope% {{nope}} License created"
    assert "nope" in caplog.text


def test_client_fallback_chain():
    # 1. explicit client_name wins (and is stripped).
    assert tr.resolve_client_name({"client_name": "  Ali Rezaei  "}) == "Ali Rezaei"
    # 2. otherwise the user_email local-part.
    assert tr.resolve_client_name({"user_email": "buyer@example.com"}) == "buyer"
    assert tr.resolve_client_name({"client_name": "  ", "user_email": "a@b.c"}) == "a"
    # 3. otherwise the fallback — never empty, never silent.
    assert tr.resolve_client_name({}) == "مشتری گرامی"
    assert tr.resolve_client_name({"user_email": ""}) == "مشتری گرامی"
    assert tr.resolve_client_name({"user_email": "not-an-email"}) == "مشتری گرامی"
    # The renderer itself never leaves %client% literal.
    assert tr.render_template_text("%client%", {}, "FB") == "مشتری گرامی"
    assert (
        tr.render_template_text("%client%", {"user_email": "z@y.z"}, "FB") == "z"
    )


def test_aliases_need_their_canonical_key():
    # %license% with no license_key in context stays literal (it is a
    # normal variable, unlike %client% which always derives).
    assert tr.render_template_text("%license%", {}, "FB") == "%license%"
    assert tr.render_template_text("%product%", {"product_name": "P"}, "FB") == "P"
    # An explicit alias in the context never overrides the canonical.
    assert (
        tr.render_template_text(
            "%license%", {"license_key": "REAL", "license": "FAKE"}, "FB"
        )
        == "REAL"
    )


def test_render_never_crashes_on_bad_context():
    class Exploding:
        def __str__(self):
            raise RuntimeError("boom")

    assert (
        tr.render_template_text("%license%", {"license_key": Exploding()}, "FB")
        == "FB"
    )
    assert tr.render_template_text(None, CTX, "FB") == "FB"


def test_sms_telegram_texts_use_the_shared_renderer():
    # render_notification_text keeps its old signature and defaults,
    # but now understands %var% too — and title/message still win over
    # a context key of the same name.
    rendered = texts.render_notification_text(
        "%client% عزیز: {message} (%license%)",
        TITLE, MESSAGE, CTX, fallback="FALLBACK",
    )
    assert rendered == "buyer عزیز: License LIC-1 for Widget was created. (LIC-1)"
    assert texts.render_notification_text(
        "{title}", TITLE, MESSAGE, {"title": "FAKE"}, fallback="FALLBACK"
    ) == TITLE
    # The v3.0.7 defaults still reproduce the hardcoded output.
    assert texts.render_notification_text(
        texts.DEFAULT_TEXTS["license_created"]["sms"], TITLE, MESSAGE, CTX,
        fallback="FALLBACK",
    ) == f"{TITLE}: {MESSAGE}"


def test_email_template_renders_percent_and_brace_syntax(client):
    # The client fixture creates the tables + seeds the settings first;
    # without it SessionLocal() has no system_settings table.
    from database import SessionLocal

    db = SessionLocal()
    try:
        # The stored default template uses {{var}}; %var% must work in
        # the same template, and %client% derives from user_email.
        subject, body = tpl_service.render_template(
            db,
            "license_created",
            {**CTX, "client_name": "Sara Ahmadi"},
        )
        assert subject == "Your license for Widget is ready"
        assert "License key: LIC-1" in body
        # A custom template mixing all three syntaxes.
        from services.settings import update_setting
        import json

        update_setting(
            db,
            "email_config",
            json.dumps(
                {
                    "templates": {
                        "license_created": {
                            "subject": "%client% — {{product_name}}",
                            "body": "Dear {client}, key %license% / {{license_key}}.",
                        }
                    }
                }
            ),
        )
        subject, body = tpl_service.render_template(db, "license_created", CTX)
        assert subject == "buyer — Widget"
        assert "Dear buyer, key LIC-1 / LIC-1." in body
    finally:
        db.close()


def test_sample_values_cover_every_guide_variable():
    # Every placeholder in the guide has a non-empty sample, and the
    # sample context resolves every guide variable.
    assert tr.SAMPLE_VALUES
    for name, sample in tr.VARIABLE_GUIDE:
        assert sample, name
        assert name in tr.SAMPLE_VALUES or name in tr.VARIABLE_ALIASES, name
    ctx = tr.sample_context()
    for name, _ in tr.VARIABLE_GUIDE:
        assert tr.render_template_text(f"%{name}%", ctx, "FB") != f"%{name}%", name
        assert tr.render_template_text(f"{{{name}}}", ctx, "FB") != f"{{{name}}}", name
