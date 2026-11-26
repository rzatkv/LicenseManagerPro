"""Date calendar + system encoding + notes-toggle settings (v3.0)."""
import pytest


@pytest.mark.parametrize("value", ["gregorian", "jalali", "hijri"])
def test_date_calendar_valid(client, auth_headers, value):
    resp = client.put(
        "/api/settings/date_calendar",
        json={"key": "date_calendar", "value": value},
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    resp = client.get("/api/settings/date_calendar", headers=auth_headers)
    assert resp.json()["value"] == value


def test_date_calendar_invalid(client, auth_headers):
    resp = client.put(
        "/api/settings/date_calendar",
        json={"key": "date_calendar", "value": "roman"},
        headers=auth_headers,
    )
    assert resp.status_code == 400


@pytest.mark.parametrize("value", ["utf-8", "windows-1256", "iso-8859-1"])
def test_system_encoding_valid(client, auth_headers, value):
    resp = client.put(
        "/api/settings/system_encoding",
        json={"key": "system_encoding", "value": value},
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text


def test_system_encoding_invalid(client, auth_headers):
    resp = client.put(
        "/api/settings/system_encoding",
        json={"key": "system_encoding", "value": "utf-16"},
        headers=auth_headers,
    )
    assert resp.status_code == 400


def test_system_encoding_applied_to_responses(client, auth_headers):
    """Responses carry the configured charset (default utf-8)."""
    resp = client.get("/api/products", headers=auth_headers)
    assert resp.status_code == 200
    assert "charset=utf-8" in resp.headers["content-type"]
    client.put(
        "/api/settings/system_encoding",
        json={"key": "system_encoding", "value": "windows-1256"},
        headers=auth_headers,
    )
    resp = client.get("/api/products", headers=auth_headers)
    assert "charset=windows-1256" in resp.headers["content-type"]


def test_system_encoding_normalized_lowercase(client, auth_headers):
    client.put(
        "/api/settings/system_encoding",
        json={"key": "system_encoding", "value": "UTF-8"},
        headers=auth_headers,
    )
    resp = client.get("/api/settings/system_encoding", headers=auth_headers)
    assert resp.json()["value"] == "utf-8"
