"""Self-update + downloads tests (v2.3). The GitHub API is mocked with a
MockTransport — no test ever hits the real GitHub API."""
import io
import zipfile

import httpx

import services.updates as update_service

# The mocked "latest" release is always NEWER than the running app
# (3.0.8) — otherwise the update path refuses with "Already up to date".
RELEASE_309 = {
    "tag_name": "v3.0.9",
    "html_url": "https://github.com/rzatkv/LicenseManagerPro/releases/tag/v3.0.9",
    "body": "## Highlights\n- something new",
    "published_at": "2026-11-25T00:00:00Z",
    "tarball_url": "https://api.github.com/repos/rzatkv/LicenseManagerPro/tarball/v3.0.9",
}

ALL_MODULES = (
    "whmcs",
    "woocommerce",
    "wordpress",
    "joomla",
    "prestashop",
    "magento",
    "opencart",
    "shopware",
    "drupal",
    "odoo",
)


def _gzip_bytes(payload: bytes = b"fake tarball") -> bytes:
    """A REAL minimal tar.gz (v2.3: stage_update validates tar members,
    so plain gzip of arbitrary bytes is rejected as a truncated tar)."""
    import tarfile

    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode="w:gz") as tf:
        info = tarfile.TarInfo("hello.txt")
        info.size = len(payload)
        tf.addfile(info, io.BytesIO(payload))
    return buffer.getvalue()


def _mock_client(monkeypatch, release=None, tarball_bytes=None, api_status=200, raise_error=None):
    def handler(request):
        if raise_error is not None:
            raise raise_error
        url = str(request.url)
        if url.endswith("/releases/latest"):
            if api_status != 200:
                return httpx.Response(api_status, json={"message": "not found"})
            return httpx.Response(200, json=release if release is not None else RELEASE_309)
        if "tarball" in url or "codeload.github.com" in url:
            return httpx.Response(200, content=tarball_bytes if tarball_bytes is not None else _gzip_bytes())
        if url.endswith("/modules.json"):
            # whmcs has a newer version upstream; the other 9 are current.
            return httpx.Response(
                200,
                json={
                    **{m: {"version": "3.0.8"} for m in ALL_MODULES},
                    "whmcs": {"version": "3.0.9"},
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
    assert data["current_version"] == "3.0.8"
    assert data["latest_version"] == "3.0.9"
    assert data["update_available"] is True
    assert "3.0.9" in data["release_url"]
    assert "something new" in (data["release_notes"] or "")


def test_update_check_already_latest(client, auth_headers, monkeypatch):
    _mock_client(monkeypatch, release={**RELEASE_309, "tag_name": "v3.0.8"})
    response = client.get("/api/system/update-check", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["update_available"] is False
    assert response.json()["latest_version"] == "3.0.8"


def test_update_check_github_failure(client, auth_headers, monkeypatch):
    _mock_client(monkeypatch, api_status=500)
    response = client.get("/api/system/update-check", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["update_available"] is False
    assert data["error"]


def test_update_check_exception_leaks_nothing(client, auth_headers, monkeypatch):
    """v3.0.6 (security): when the GitHub call itself raises, the raw
    exception text must NEVER reach the client. Before the fix the
    update-check `error` field (and the apply-update 400 detail, via
    stage_update) echoed str(exc) verbatim — e.g. a NameError naming an
    internal symbol. Now both return the generic message only."""
    leaked = "name 'INTERNAL_SECRET' is not defined"
    _mock_client(monkeypatch, raise_error=RuntimeError(leaked))
    response = client.get("/api/system/update-check", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["update_available"] is False
    assert data["error"] == "GitHub update check failed"
    assert leaked not in response.text
    response = client.post("/api/system/update", headers=auth_headers)
    assert response.status_code == 400
    assert response.json()["detail"] == "GitHub update check failed"
    assert leaked not in response.text


def test_stage_update_downloads_and_verifies(client, auth_headers, monkeypatch, tmp_path):
    _mock_client(monkeypatch)
    staged = update_service.UPDATES_DIR / "license-manager-pro-3.0.9.tar.gz"
    if staged.exists():
        staged.unlink()
    try:
        response = client.post("/api/system/update", headers=auth_headers)
        assert response.status_code == 200, response.text
        data = response.json()
        assert data["staged"] is True
        assert data["version"] == "3.0.9"
        assert data["auto_applied"] is False
        assert "update.sh" in data["next_step"]
        assert staged.exists()
        # The staged file is a real tar.gz containing hello.txt.
        import tarfile

        with tarfile.open(staged, "r:gz") as tf:
            member = tf.getmember("hello.txt")
            assert tf.extractfile(member).read() == b"fake tarball"
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
    # v2.3: all 10 modules, each at the app version, with a DIRECT GitHub
    # release-asset link (version parity).
    assert set(items) == set(ALL_MODULES)
    for module_id, item in items.items():
        assert item["version"] == "3.0.8", module_id
        assert item["download_url"] == (
            "https://github.com/rzatkv/LicenseManagerPro/releases/download/"
            f"v3.0.8/licensemanagerpro-{module_id}-3.0.8.zip"
        ), module_id
        assert item["zip_url"] == f"/api/downloads/{module_id}"

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
    assert set(data) == set(ALL_MODULES)
    assert data["whmcs"]["local"] == "3.0.8"
    assert data["whmcs"]["latest"] == "3.0.9"
    assert data["whmcs"]["update_available"] is True
    assert data["woocommerce"]["local"] == "3.0.8"
    assert data["woocommerce"]["latest"] == "3.0.8"
    assert data["woocommerce"]["update_available"] is False


def test_stage_update_refuses_foreign_tarball_host(client, auth_headers, monkeypatch):
    """v3.0.6 (security, M4): the tarball URL comes from the GitHub API
    response. Before the fix any host was fetched — a compromised or
    moved repo could point the updater at an arbitrary server. Only
    GitHub's own hosts are allowed."""
    evil = {**RELEASE_309, "tarball_url": "https://evil.example.com/repo/archive/v3.0.9.tar.gz"}
    _mock_client(monkeypatch, release=evil)
    resp = client.post("/api/system/update", headers=auth_headers)
    assert resp.status_code == 400, resp.text
    assert "unexpected host" in resp.json()["detail"]


def test_stage_update_allows_github_tarball_host(client, auth_headers, monkeypatch):
    """The allowlist must not break the normal path: a codeload URL
    (what GitHub's tarball_url actually points at) stages fine."""
    from services import updates as update_service

    monkeypatch.setattr(update_service, "LMP_ALLOW_SELF_UPDATE", False)
    good = {**RELEASE_309, "tarball_url": "https://codeload.github.com/rzatkv/LicenseManagerPro/tar.gz/refs/tags/v3.0.9"}
    _mock_client(monkeypatch, release=good)
    resp = client.post("/api/system/update", headers=auth_headers)
    assert resp.status_code == 200, resp.text
    assert resp.json()["staged"] is True
