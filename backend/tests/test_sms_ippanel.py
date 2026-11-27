"""Real ippanel Edge integration (v3.0): client, balance endpoint, test-send.

HTTP is MOCKED here (no real key, no real sends) — the client code
itself makes real httpx calls in production. Endpoint/auth/body shapes
are pinned by the official reference, github.com/ippanelcom/
Edge-Document (docs/send/webservice.md, docs/send/pattern.md,
docs/payment/my-credit.md): POST /api/send with a RAW
``Authorization: <token>`` header, GET /api/payment/credit/mine.
"""
import json

import pytest

from services import sms as sms_service
from services import sms_ippanel as ippanel

API_KEY = "EDGE-TEST-KEY-123"
SENDER = "+983000505"
TO = "+989121234567"


class FakeResp:
    def __init__(self, status_code, payload):
        self.status_code = status_code
        self._payload = payload

    def json(self):
        return self._payload


class FakeClient:
    """Records every call; returns scripted responses per (method, path)."""

    def __init__(self, routes):
        self.routes = routes  # {(method, path_suffix): FakeResp | callable}
        self.calls = []

    def _call(self, method, url, **kwargs):
        self.calls.append((method, url, kwargs))
        for (m, suffix), resp in self.routes.items():
            if m == method and url.endswith(suffix):
                return resp(self, kwargs) if callable(resp) else resp
        return FakeResp(404, {"meta": {"status": False, "message_code": "404-1"}})

    def post(self, url, **kwargs):
        return self._call("POST", url, **kwargs)

    def get(self, url, **kwargs):
        return self._call("GET", url, **kwargs)

    def close(self):
        pass


def _ok_send(ids=(1123544244,)):
    return FakeResp(200, {
        "data": {"message_outbox_ids": list(ids)},
        "meta": {"status": True, "message": "انجام شد", "message_code": "200-1"},
    })


def _ok_credit(credit=6084722932.705052):
    return FakeResp(200, {
        "data": {
            "credit": credit,
            "yesterday_credit": 195251925510.55,
            "gift": 0,
            "gift_expires_at": None,
            "updated_at": "2025-06-30 18:07:06",
        },
        "meta": {"status": True, "message": "انجام شد", "message_code": "200-1"},
    })


def _unauthorized():
    return FakeResp(401, {
        "data": None,
        "meta": {
            "status": False,
            "message": "اطلاعات وارد شده صحیح نمی باشد",
            "message_code": "400-1",
            "errors": {},
        },
    })


@pytest.fixture(autouse=True)
def _reset_credit_cache():
    ippanel.reset_credit_cache()
    yield
    ippanel.reset_credit_cache()


def _set_ippanel(client, auth_headers, api_key=API_KEY, sender=SENDER, active=True):
    resp = client.put(
        "/api/settings/sms-config",
        json={
            "active_provider": "ippanel" if active else "",
            "providers": {"ippanel": {"api_key": api_key, "sender": sender}},
        },
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text


# --- client: webservice send -------------------------------------------

def test_ippanel_send_webservice_shape(monkeypatch):
    """POST /api/send, RAW Authorization token, webservice body shape."""
    fake = FakeClient({("POST", "/api/send"): _ok_send()})
    monkeypatch.setattr(ippanel, "create_ippanel_client", lambda: fake)
    ids = ippanel.send_webservice(API_KEY, SENDER, TO, "hello")
    assert ids == [1123544244]
    assert len(fake.calls) == 1
    method, url, kwargs = fake.calls[0]
    assert url == "https://edge.ippanel.com/v1/api/send"
    # Raw token — NOT "AccessKey <key>" (old Mediana scheme).
    assert kwargs["headers"]["Authorization"] == API_KEY
    body = kwargs["json"]
    assert body["sending_type"] == "webservice"
    assert body["from_number"] == SENDER
    assert body["message"] == "hello"
    assert body["params"] == {"recipients": [TO]}


def test_ippanel_send_failure_meta_false(monkeypatch):
    fake = FakeClient({("POST", "/api/send"): FakeResp(422, {
        "data": None,
        "meta": {"status": False, "message": "bad", "message_code": "400-2",
                 "errors": {"message": ["required"]}},
    })})
    monkeypatch.setattr(ippanel, "create_ippanel_client", lambda: fake)
    with pytest.raises(ippanel.IppanelError) as exc:
        ippanel.send_webservice(API_KEY, SENDER, TO, "hello")
    assert "400-2" in str(exc.value)


def test_ippanel_send_auth_failure(monkeypatch):
    fake = FakeClient({("POST", "/api/send"): _unauthorized()})
    monkeypatch.setattr(ippanel, "create_ippanel_client", lambda: fake)
    with pytest.raises(ippanel.IppanelAuthError):
        ippanel.send_webservice("BAD-KEY", SENDER, TO, "hello")


# --- client: pattern send ----------------------------------------------

def test_ippanel_send_pattern_shape(monkeypatch):
    fake = FakeClient({("POST", "/api/send"): _ok_send((1123594208,))})
    monkeypatch.setattr(ippanel, "create_ippanel_client", lambda: fake)
    ids = ippanel.send_pattern(API_KEY, SENDER, "abc123code", TO, {"code": "482913"})
    assert ids == [1123594208]
    body = fake.calls[0][2]["json"]
    assert body["sending_type"] == "pattern"
    assert body["code"] == "abc123code"
    assert body["recipients"] == [TO]  # Edge allows ONE recipient per pattern call
    assert body["params"] == {"code": "482913"}
    assert body["from_number"] == SENDER


# --- client: credit ------------------------------------------------------

def test_ippanel_get_credit(monkeypatch):
    fake = FakeClient({("GET", "/api/payment/credit/mine"): _ok_credit()})
    monkeypatch.setattr(ippanel, "create_ippanel_client", lambda: fake)
    data = ippanel.get_credit(API_KEY)
    assert data["credit"] == pytest.approx(6084722932.705052)
    assert isinstance(data["credit"], float)
    assert fake.calls[0][1] == "https://edge.ippanel.com/v1/api/payment/credit/mine"
    assert fake.calls[0][2]["headers"]["Authorization"] == API_KEY


def test_ippanel_get_credit_auth_failure(monkeypatch):
    fake = FakeClient({("GET", "/api/payment/credit/mine"): _unauthorized()})
    monkeypatch.setattr(ippanel, "create_ippanel_client", lambda: fake)
    with pytest.raises(ippanel.IppanelAuthError):
        ippanel.get_credit("BAD-KEY")


def test_ippanel_get_credit_missing_credit_field(monkeypatch):
    fake = FakeClient({("GET", "/api/payment/credit/mine"): FakeResp(200, {
        "data": {"gift": 0},
        "meta": {"status": True, "message_code": "200-1"},
    })})
    monkeypatch.setattr(ippanel, "create_ippanel_client", lambda: fake)
    with pytest.raises(ippanel.IppanelError):
        ippanel.get_credit(API_KEY)


def test_ippanel_credit_cache(monkeypatch):
    fake = FakeClient({("GET", "/api/payment/credit/mine"): _ok_credit(1000.0)})
    monkeypatch.setattr(ippanel, "create_ippanel_client", lambda: fake)
    first = ippanel.get_credit_cached(API_KEY)
    second = ippanel.get_credit_cached(API_KEY)
    assert first["credit"] == 1000.0 and first["_cached"] is False
    assert second["_cached"] is True
    assert len(fake.calls) == 1  # second read came from the cache
    third = ippanel.get_credit_cached(API_KEY, force=True)
    assert third["_cached"] is False
    assert len(fake.calls) == 2  # refresh forces a live call


# --- send_sms wiring -----------------------------------------------------

def test_send_sms_uses_real_ippanel_client(client, auth_headers, monkeypatch):
    fake = FakeClient({("POST", "/api/send"): _ok_send()})
    monkeypatch.setattr(ippanel, "create_ippanel_client", lambda: fake)
    _set_ippanel(client, auth_headers)
    from database import SessionLocal

    db = SessionLocal()
    try:
        assert sms_service.send_sms(db, TO, "hello") is True
    finally:
        db.close()
    assert len(fake.calls) == 1
    assert fake.calls[0][1].endswith("/api/send")


def test_send_sms_ippanel_auth_failure_is_false(client, auth_headers, monkeypatch):
    fake = FakeClient({("POST", "/api/send"): _unauthorized()})
    monkeypatch.setattr(ippanel, "create_ippanel_client", lambda: fake)
    _set_ippanel(client, auth_headers)
    from database import SessionLocal

    db = SessionLocal()
    try:
        assert sms_service.send_sms(db, TO, "hello") is False
    finally:
        db.close()


def test_send_sms_ippanel_no_key_is_false(client, auth_headers, monkeypatch):
    fake = FakeClient({("POST", "/api/send"): _ok_send()})
    monkeypatch.setattr(ippanel, "create_ippanel_client", lambda: fake)
    # Active ippanel but no api_key stored at all.
    resp = client.put(
        "/api/settings/sms-config",
        json={"active_provider": "ippanel", "providers": {"ippanel": {"sender": SENDER}}},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    from database import SessionLocal

    db = SessionLocal()
    try:
        assert sms_service.send_sms(db, TO, "hello") is False
    finally:
        db.close()
    assert fake.calls == []  # no HTTP attempt without a key


# --- balance endpoint ----------------------------------------------------

def test_balance_not_configured(client, auth_headers):
    resp = client.get("/api/sms/balance", headers=auth_headers)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["provider"] == "ippanel"
    assert body["configured"] is False
    assert body["available"] is False
    assert body["credit"] is None
    assert body["error"] == "not_configured"
    assert "EDGE-TEST" not in json.dumps(body)


def test_balance_value_and_cache(client, auth_headers, monkeypatch):
    fake = FakeClient({("GET", "/api/payment/credit/mine"): _ok_credit(2500000.5)})
    monkeypatch.setattr(ippanel, "create_ippanel_client", lambda: fake)
    _set_ippanel(client, auth_headers)
    first = client.get("/api/sms/balance", headers=auth_headers)
    assert first.status_code == 200, first.text
    body = first.json()
    assert body["available"] is True
    assert body["credit"] == pytest.approx(2500000.5)
    assert body["unit"] == "rial"
    assert body["cached"] is False
    assert body["checked_at"]
    second = client.get("/api/sms/balance", headers=auth_headers)
    assert second.json()["cached"] is True
    assert len(fake.calls) == 1
    third = client.get("/api/sms/balance?refresh=1", headers=auth_headers)
    assert third.json()["cached"] is False
    assert len(fake.calls) == 2


def test_balance_auth_failure_degrades(client, auth_headers, monkeypatch):
    fake = FakeClient({("GET", "/api/payment/credit/mine"): _unauthorized()})
    monkeypatch.setattr(ippanel, "create_ippanel_client", lambda: fake)
    _set_ippanel(client, auth_headers)
    resp = client.get("/api/sms/balance", headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["available"] is False
    assert body["credit"] is None
    assert body["error"] == "auth_failed"


def test_balance_requires_admin(client, auth_headers):
    client.post(
        "/api/users",
        json={"email": "viewer@example.com", "password": "viewerpass123", "role": "viewer"},
        headers=auth_headers,
    )
    login = client.post(
        "/api/auth/login",
        json={"email": "viewer@example.com", "password": "viewerpass123"},
    )
    assert login.status_code == 200, login.text
    viewer = {"Authorization": f"Bearer {login.json()['access_token']}"}
    resp = client.get("/api/sms/balance", headers=viewer)
    assert resp.status_code == 403


# --- test-send endpoint ----------------------------------------------------

def test_sms_test_send_real(client, auth_headers, monkeypatch):
    fake = FakeClient({("POST", "/api/send"): _ok_send()})
    monkeypatch.setattr(ippanel, "create_ippanel_client", lambda: fake)
    _set_ippanel(client, auth_headers)
    resp = client.post(
        "/api/sms/test", json={"to": TO, "message": "ping"}, headers=auth_headers
    )
    assert resp.status_code == 200, resp.text
    # v3.0.7: the test-send response also reports the path taken
    # ("webservice" here — no event was given) and the tested event.
    assert resp.json() == {
        "sent": True,
        "provider": "ippanel",
        "mode": "webservice",
        "event": None,
    }
    assert len(fake.calls) == 1
    # Logged so the Logs page's SMS filter + sending charts see it.
    logs = client.get("/api/audit-logs?channel=sms", headers=auth_headers)
    assert logs.status_code == 200
    assert any(
        row["action"] == "notify.sms_sent"
        and (row.get("details") or {}).get("event") == "sms_test"
        for row in logs.json()
    )


def test_sms_test_send_no_provider(client, auth_headers):
    resp = client.post(
        "/api/sms/test", json={"to": TO}, headers=auth_headers
    )
    assert resp.status_code == 400


# --- service-status ippanel check ------------------------------------------

def test_service_status_ippanel_real_credit(monkeypatch):
    from services import service_status

    fake = FakeClient({("GET", "/api/payment/credit/mine"): _ok_credit(777.0)})
    monkeypatch.setattr(ippanel, "create_ippanel_client", lambda: fake)
    cfg = {"active_provider": "ippanel", "providers": {"ippanel": {"api_key": API_KEY}}}
    result = service_status._check_sms(cfg)
    assert result["status"] == "connected"
    assert "777" in result["detail"]


def test_service_status_ippanel_auth_failed(monkeypatch):
    from services import service_status

    fake = FakeClient({("GET", "/api/payment/credit/mine"): _unauthorized()})
    monkeypatch.setattr(ippanel, "create_ippanel_client", lambda: fake)
    cfg = {"active_provider": "ippanel", "providers": {"ippanel": {"api_key": "BAD"}}}
    result = service_status._check_sms(cfg)
    assert result["status"] == "auth_failed"


def test_sms_test_requires_admin_not_manager(client, auth_headers):
    """v3.0.6 (security, M3): POST /api/sms/test sends a REAL SMS to an
    arbitrary number. Before the fix it needed only ``sms:write``,
    which managers hold — a manager could text anyone at the owner's
    expense. Now only admin (\"*\") may call it."""
    created = client.post(
        "/api/users",
        json={"email": "manager@example.com", "password": "managerpass123", "role": "manager"},
        headers=auth_headers,
    )
    assert created.status_code == 201, created.text
    login = client.post(
        "/api/auth/login",
        json={"email": "manager@example.com", "password": "managerpass123"},
    )
    assert login.status_code == 200, login.text
    manager = {"Authorization": f"Bearer {login.json()['access_token']}"}
    resp = client.post(
        "/api/sms/test", json={"to": TO, "message": "ping"}, headers=manager
    )
    assert resp.status_code == 403, resp.text
