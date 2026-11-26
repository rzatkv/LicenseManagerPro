"""Auto-strip 4-byte characters (v3.0): middleware + setting toggle."""
import pytest


def _product_payload(name="Widget 😀 Pro"):
    return {
        "name": name,
        "billing_cycles": ["monthly"],
    }


def test_emoji_stripped_by_default(client, auth_headers):
    resp = client.post("/api/products", json=_product_payload(), headers=auth_headers)
    assert resp.status_code == 201, resp.text
    assert resp.json()["name"] == "Widget  Pro"
    # Nested strings are stripped too (description).
    resp = client.post(
        "/api/products",
        json={"name": "Plain", "description": "Hi 👋 there", "billing_cycles": ["monthly"]},
        headers=auth_headers,
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["description"] == "Hi  there"


def test_strip_can_be_turned_off(client, auth_headers):
    resp = client.put(
        "/api/settings/strip_4byte",
        json={"key": "strip_4byte", "value": "off"},
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    resp = client.post("/api/products", json=_product_payload(), headers=auth_headers)
    assert resp.status_code == 201, resp.text
    assert resp.json()["name"] == "Widget 😀 Pro"


def test_strip_setting_validation(client, auth_headers):
    resp = client.put(
        "/api/settings/strip_4byte",
        json={"key": "strip_4byte", "value": "maybe"},
        headers=auth_headers,
    )
    assert resp.status_code == 400


def test_bmp_characters_kept(client, auth_headers):
    """Persian/Arabic (BMP) text is untouched — only 4-byte chars go."""
    resp = client.post(
        "/api/products",
        json={"name": "محصول فارسی", "billing_cycles": ["monthly"]},
        headers=auth_headers,
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["name"] == "محصول فارسی"
