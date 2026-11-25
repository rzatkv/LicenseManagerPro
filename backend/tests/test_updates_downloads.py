"""Self-update + downloads tests (v2.2). The GitHub API is mocked with a
MockTransport — no test ever hits the real GitHub API."""
import gzip
import io
import json
import zipfile
from pathlib import Path

import httpx
import pytest

import services.updates as update_service

RELEASE_230 = {
    "tag_name": "v2.3.0",
    "html_url": "https://github.com/rzatkv/LicenseManagerPro/releases/tag/v2.3.0",
    "body": "## Highlights\n- something new",
    "published_at": "2026-11-25T00:00:00Z",
    "tarball_url": "https://api.github.com/repos/rzatkv/LicenseManagerPro/tarball/v2.3.0",
}


def _gzip_bytes(payload: bytes = b"fake tarball") -> bytes:
    buffer = io.BytesIO()
    with gzip.GzipFile(fileobj=buffer, mode="wb") as gz:
        gz.write(payload)
    return buffer.getvalue()


def _mock_client(monkeypatch, release=None, tarball_bytes=None, api_status=200):
    def handler(request):
        url = str(request.url)
        if url.endswith("/releases/latest"):
            if api_status != 200:
                return httpx.Response(api_status, json={"message": "not found"})
            return httpx.Response(200, json=release if release is not None else RELEASE_230)
        if "tarball" in url:
            return httpx.Response(200, content=tarball_bytes if tarball_bytes is not None else _gzip_bytes())
        if url.endswith("/modules.json"):
            return httpx.Response(
                200,
                json={
                    "whmcs": {"version": "1.1.0"},
                    "woocommerce": {"version": "1.0.0"},
                },
            )
        return httpx.Response(404, json={"message": "not found"})

    transport = httpx.MockTransport(handler)
    monkeypatch.setattr(
        update_service,
        "create_github_client",
        lambda timeout=10.0: httpx.Client(transport=transport, timeout=timeout, trust_env=False),
    )


def test_update_check_newer_available(client, auth_headers, monkeypatch):
    _mock_client(monkeypatch)
    response = client.get("/api/system/update-check", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["current_version"] == "2.2.0"
    assert data["latest_version"] == "2.3.0"
    assert data["update_available"] is True
    assert "2.3.0" in data["release_url"]
    assert "something new" in (data["release_notes"] or "")


def test_update_check_already_latest(client, auth_headers, monkeypatch):
    _mock_client(monkeypatch, release={**RELEASE_230, "tag_name": "v2.2.0"})
    response = client.get("/api/system/update-check", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["update_available"] is False
    assert response.json()["latest_version"] == "2.2.0"


def test_update_check_github_failure(client, auth_headers, monkeypatch):
    _mock_client(monkeypatch, api_status=500)
    response = client.get("/api/system/update-check", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["update_available"] is False
    assert data["error"]


def test_stage_update_downloads_and_verifies(client, auth_headers, monkeypatch, tmp_path):
    _mock_client(monkeypatch)
    staged = update_service.UPDATES_DIR / "license-manager-pro-2.3.0.tar.gz"
    if staged.exists():
        staged.unlink()
    try:
        response = client.post("/api/system/update", headers=auth_headers)
        assert response.status_code == 200, response.text
        data = response.json()
        assert data["staged"] is True
        assert data["version"] == "2.3.0"
        assert data["auto_applied"] is False
        assert "update.sh" in data["next_step"]
        assert staged.exists()
        # The staged file is a real gzip.
        with gzip.open(staged, "rb") as fh:
            assert fh.read() == b"fake tarball"
    finally:
        if staged.exists():
            staged.unlink()


def test_stage_update_rejects_non_tarball(client, auth_headers, monkeypatch):
    _mock_client(monkeypatch, tarball_bytes=b"this is not gzip")
    response = client.post("/api/system/update", headers=auth_headers)
    assert response.status_code == 400
    assert "gzip" in response.json()["detail"]


def test_downloads_list_and_zip(client, auth_headers):
    response = client.get("/api/downloads", headers=auth_headers)
    assert response.status_code == 200
    items = {item["id"]: item for item in response.json()}
    assert set(items) == {"whmcs", "woocommerce"}
    assert items["whmcs"]["version"] == "1.0.0"
    assert items["whmcs"]["download_url"] == "/api/downloads/whmcs"

    response = client.get("/api/downloads/whmcs", headers=auth_headers)
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/zip"
    zf = zipfile.ZipFile(io.BytesIO(response.content))
    names = zf.namelist()
    assert any(n.endswith("licensemanagerpro.php") for n in names), names
    assert any(n.endswith("ApiClient.php") for n in names), names

    response = client.get("/api/downloads/woocommerce", headers=auth_headers)
    assert response.status_code == 200
    zf = zipfile.ZipFile(io.BytesIO(response.content))
    names = zf.namelist()
    assert any(n.endswith("licensemanagerpro-woocommerce.php") for n in names), names

    assert client.get("/api/downloads/nope", headers=auth_headers).status_code == 404


def test_module_versions_against_manifest(client, auth_headers, monkeypatch):
    _mock_client(monkeypatch)
    response = client.get("/api/downloads/versions", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["whmcs"]["local"] == "1.0.0"
    assert data["whmcs"]["latest"] == "1.1.0"
    assert data["whmcs"]["update_available"] is True
    assert data["woocommerce"]["update_available"] is False
