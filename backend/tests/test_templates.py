"""Email templates + signature (v3.0): custom text is really used."""
import json

from services import templates as tpl_service


def _set_email_config(client, auth_headers, payload):
    resp = client.put("/api/settings/email-config", json=payload, headers=auth_headers)
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_template_render_uses_custom_text_and_signature(client, auth_headers):
    _set_email_config(
        client,
        auth_headers,
        {
            "templates": {
                "twofa_code": {
                    "subject": "CUSTOM subject {{code}}",
                    "body": "CUSTOM body, your code is {{code}} for {{user_email}}.",
                }
            },
            "signature": "CUSTOM SIGNATURE -- Team",
        },
    )
    from database import SessionLocal

    db = SessionLocal()
    try:
        subject, body = tpl_service.render_template(
            db, "twofa_code", {"code": "123456", "user_email": "a@b.c"}
        )
    finally:
        db.close()
    assert subject == "CUSTOM subject 123456"
    assert "CUSTOM body, your code is 123456 for a@b.c." in body
    assert body.rstrip().endswith("CUSTOM SIGNATURE -- Team")


def test_template_unknown_variable_left_intact(client, auth_headers):
    _set_email_config(
        client,
        auth_headers,
        {"templates": {"twofa_code": {"subject": "Hi {{nope}}", "body": "x"}}},
    )
    from database import SessionLocal

    db = SessionLocal()
    try:
        subject, _ = tpl_service.render_template(db, "twofa_code", {"code": "1"})
    finally:
        db.close()
    assert subject == "Hi {{nope}}"


def test_template_reset_to_defaults(client, auth_headers):
    _set_email_config(
        client,
        auth_headers,
        {"templates": {"twofa_code": {"subject": "CUSTOM", "body": "CUSTOM"}}},
    )
    cfg = _set_email_config(client, auth_headers, {"reset_templates": True})
    assert cfg["templates"]["twofa_code"]["subject"] == "Your verification code"
    assert cfg["signature"] == tpl_service.DEFAULT_SIGNATURE


def test_email_config_hides_password(client, auth_headers):
    cfg = _set_email_config(
        client,
        auth_headers,
        {"smtp_host": "smtp.example.com", "username": "u", "password": "SECRET123"},
    )
    assert cfg["password_configured"] is True
    assert "SECRET123" not in json.dumps(cfg)
    # Generic settings list never exposes email_config.
    resp = client.get("/api/settings", headers=auth_headers)
    assert "email_config" not in resp.json()


def test_email_config_validation(client, auth_headers):
    resp = client.put(
        "/api/settings/email-config",
        json={"encryption": "weird"},
        headers=auth_headers,
    )
    assert resp.status_code == 400
    resp = client.put(
        "/api/settings/email-config",
        json={"templates": {"unknown_template": {"subject": "x", "body": "y"}}},
        headers=auth_headers,
    )
    assert resp.status_code == 400
