"""Webhook tests (v2.0): dispatch, signature, failure logging, check-expiring,
test-webhook endpoint. All HTTP is mocked — no real network is used."""
import hashlib
import hmac
import json
from unittest.mock import MagicMock, patch

from database import SessionLocal
from models import Product
from services.webhooks import dispatch_webhook


def _mock_client(status_code=200, text="ok"):
    """A mock httpx.Client (context manager) returning a canned response."""
    mock_response = MagicMock()
    mock_response.status_code = status_code
    mock_response.text = text
    mock_client = MagicMock()
    mock_client.__enter__.return_value = mock_client
    mock_client.__exit__.return_value = False
    mock_client.post.return_value = mock_response
    return mock_client


def _create_product(client, auth_headers, **overrides):
    body = {
        "name": "Hooked",
        "billing_cycles": ["monthly", "annual"],
        "webhook_url": "https://example.invalid/hook",
        "webhook_secret": "topsecret",
    }
    body.update(overrides)
    response = client.post("/api/products", json=body, headers=auth_headers)
    assert response.status_code == 201, response.text
    return response.json()


def _db_product(db, product_id):
    """Product row loaded on the caller's open session (stays attached)."""
    return db.query(Product).filter(Product.id == product_id).first()


def test_dispatch_success_and_signature(client, auth_headers):
    product = _create_product(client, auth_headers)
    mock_client = _mock_client(status_code=200, text="received")
    db = SessionLocal()
    try:
        with patch("services.webhooks.httpx.Client", return_value=mock_client):
            delivery = dispatch_webhook(
                db,
                _db_product(db, product["id"]),
                "license.created",
                {"event": "license.created", "license_key": "K-1"},
            )
        assert delivery is not None
        assert delivery.success is True
        assert delivery.status_code == 200
        assert delivery.response_body == "received"
        assert delivery.event == "license.created"
        assert delivery.product_id == product["id"]

        # The POST carried the event header and a correct HMAC signature.
        _, kwargs = mock_client.post.call_args
        assert kwargs["headers"]["X-LMP-Event"] == "license.created"
        assert kwargs["headers"]["Content-Type"] == "application/json"
        raw_body = kwargs["content"]
        expected = hmac.new(
            b"topsecret", raw_body, hashlib.sha256
        ).hexdigest()
        assert kwargs["headers"]["X-LMP-Signature"] == expected
        assert json.loads(raw_body)["license_key"] == "K-1"
    finally:
        db.close()


def test_dispatch_no_signature_without_secret(client, auth_headers):
    product = _create_product(client, auth_headers, webhook_secret=None)
    mock_client = _mock_client()
    db = SessionLocal()
    try:
        with patch("services.webhooks.httpx.Client", return_value=mock_client):
            delivery = dispatch_webhook(
                db, _db_product(db, product["id"]), "license.test", {"event": "license.test"}
            )
        assert delivery is not None and delivery.success is True
        _, kwargs = mock_client.post.call_args
        assert "X-LMP-Signature" not in kwargs["headers"]
    finally:
        db.close()


def test_dispatch_skipped_without_webhook_url(client, auth_headers):
    product = _create_product(client, auth_headers, webhook_url=None)
    mock_client = _mock_client()
    db = SessionLocal()
    try:
        with patch("services.webhooks.httpx.Client", return_value=mock_client):
            delivery = dispatch_webhook(
                db, _db_product(db, product["id"]), "license.created", {}
            )
        assert delivery is None
        mock_client.post.assert_not_called()
    finally:
        db.close()


def test_failed_delivery_logged(client, auth_headers):
    product = _create_product(client, auth_headers)
    mock_client = _mock_client(status_code=500, text="boom")
    db = SessionLocal()
    try:
        with patch("services.webhooks.httpx.Client", return_value=mock_client):
            delivery = dispatch_webhook(
                db, _db_product(db, product["id"]), "license.renewed", {"event": "license.renewed"}
            )
        assert delivery is not None
        assert delivery.success is False
        assert delivery.status_code == 500
        assert delivery.response_body == "boom"

        # The failure is also visible via the deliveries endpoint.
        response = client.get(
            f"/api/webhooks/deliveries?product_id={product['id']}",
            headers=auth_headers,
        )
        assert response.status_code == 200
        rows = response.json()
        assert len(rows) == 1
        assert rows[0]["success"] is False
        assert rows[0]["event"] == "license.renewed"
    finally:
        db.close()


def test_dispatch_never_raises_on_transport_error(client, auth_headers):
    product = _create_product(client, auth_headers)
    mock_client = _mock_client()
    mock_client.post.side_effect = RuntimeError("connection refused")
    db = SessionLocal()
    try:
        with patch("services.webhooks.httpx.Client", return_value=mock_client):
            delivery = dispatch_webhook(
                db, _db_product(db, product["id"]), "license.created", {}
            )
        assert delivery is not None
        assert delivery.success is False
        assert delivery.status_code is None
    finally:
        db.close()


def test_check_expiring_notifies_soon_but_not_later(client, auth_headers):
    product = _create_product(client, auth_headers)
    mock_client = _mock_client()
    with patch("services.webhooks.httpx.Client", return_value=mock_client):
        # License expiring in 3 days (inside the 7-day window).
        soon = client.post(
            "/api/licenses",
            json={"product_id": product["id"], "billing_cycle": "monthly"},
            headers=auth_headers,
        ).json()
        client.put(
            f"/api/licenses/{soon['id']}",
            json={"expires_in_days": 3},
            headers=auth_headers,
        )
        # License expiring in 30 days (outside the window).
        later = client.post(
            "/api/licenses",
            json={"product_id": product["id"], "billing_cycle": "monthly"},
            headers=auth_headers,
        ).json()
        client.put(
            f"/api/licenses/{later['id']}",
            json={"expires_in_days": 30},
            headers=auth_headers,
        )
        # Already-expired license.
        gone = client.post(
            "/api/licenses",
            json={"product_id": product["id"], "billing_cycle": "monthly"},
            headers=auth_headers,
        ).json()
        client.put(
            f"/api/licenses/{gone['id']}",
            json={"expires_in_days": -1},
            headers=auth_headers,
        )

        response = client.post(
            "/api/system/check-expiring?days=7", headers=auth_headers
        )
        assert response.status_code == 200, response.text
        assert response.json() == {"expiring_notified": 1, "expired_notified": 1}

        rows = client.get(
            f"/api/webhooks/deliveries?product_id={product['id']}",
            headers=auth_headers,
        ).json()
        events = sorted(r["event"] for r in rows)
        assert "license.expiring" in events
        assert "license.expired" in events


def test_check_expiring_requires_admin_or_manager(client, auth_headers):
    client.post(
        "/api/users",
        json={"email": "view@example.com", "password": "userpass123", "role": "viewer"},
        headers=auth_headers,
    )
    login = client.post(
        "/api/auth/login",
        json={"email": "view@example.com", "password": "userpass123"},
    ).json()
    viewer_headers = {"Authorization": f"Bearer {login['access_token']}"}
    response = client.post("/api/system/check-expiring", headers=viewer_headers)
    assert response.status_code == 403


def test_test_webhook_endpoint(client, auth_headers):
    product = _create_product(client, auth_headers)
    mock_client = _mock_client(status_code=200, text="ok")
    with patch("services.webhooks.httpx.Client", return_value=mock_client):
        response = client.post(
            f"/api/products/{product['id']}/test-webhook", headers=auth_headers
        )
    assert response.status_code == 200, response.text
    assert response.json() == {"success": True, "status_code": 200}
    _, kwargs = mock_client.post.call_args
    assert kwargs["headers"]["X-LMP-Event"] == "license.test"
    assert json.loads(kwargs["content"])["event"] == "license.test"

    # A product without a webhook_url reports failure, not an error.
    plain = client.post(
        "/api/products",
        json={"name": "Plain", "billing_cycles": ["monthly"]},
        headers=auth_headers,
    ).json()
    response = client.post(
        f"/api/products/{plain['id']}/test-webhook", headers=auth_headers
    )
    assert response.status_code == 200
    assert response.json()["success"] is False
    assert response.json()["status_code"] is None


def test_dispatch_ignores_proxy_env(client, auth_headers, monkeypatch):
    """Regression: a default httpx.Client() (trust_env=True) raises
    InvalidURL ("Invalid port: ':1]'") at construction when no_proxy
    contains bare "[::1]" entries (as in this VM's environment), which
    made every webhook delivery fail. The service must build its client
    with trust_env=False so deliveries go direct."""
    import httpx

    monkeypatch.setenv("HTTP_PROXY", "http://proxy.invalid:3128")
    monkeypatch.setenv("http_proxy", "http://proxy.invalid:3128")
    monkeypatch.setenv("HTTPS_PROXY", "http://proxy.invalid:3128")
    monkeypatch.setenv("ALL_PROXY", "http://proxy.invalid:3128")
    monkeypatch.setenv("no_proxy", "localhost,127.0.0.1,::1,[::1]")
    monkeypatch.setenv("NO_PROXY", "localhost,127.0.0.1,::1,[::1]")

    product = _create_product(client, auth_headers)
    seen_kwargs = {}

    def _handler(request):
        return httpx.Response(200, text="ok")

    transport = httpx.MockTransport(_handler)
    # Capture the real class before patching: inside the factory,
    # httpx.Client resolves to the patched mock, so build with the
    # pre-patch class.
    RealClient = httpx.Client

    def _factory(*args, **kwargs):
        seen_kwargs.update(kwargs)
        return RealClient(transport=transport, **kwargs)

    db = SessionLocal()
    try:
        with patch("services.webhooks.httpx.Client", side_effect=_factory):
            delivery = dispatch_webhook(
                db,
                _db_product(db, product["id"]),
                "license.created",
                {"event": "license.created"},
            )
        assert seen_kwargs.get("trust_env") is False
        assert delivery is not None
        assert delivery.success is True
        assert delivery.status_code == 200
    finally:
        db.close()
