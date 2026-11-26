"""Audit-log deletion (v3.0): single delete + clear-all, admin only."""
import pytest


def _manager_headers(client, auth_headers):
    client.post(
        "/api/users",
        json={"email": "manager@example.com", "password": "managerpass123", "role": "manager"},
        headers=auth_headers,
    )
    resp = client.post(
        "/api/auth/login",
        json={"email": "manager@example.com", "password": "managerpass123"},
    )
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


def _seed_logs(client, auth_headers, n=3):
    # Any mutation creates audit rows; creating products is enough.
    for i in range(n):
        resp = client.post(
            "/api/products",
            json={"name": f"AuditProd{i}", "slug": f"audit-prod-{i}", "billing_cycles": ["monthly"]},
            headers=auth_headers,
        )
        assert resp.status_code in (200, 201), resp.text


def _list_logs(client, auth_headers):
    resp = client.get("/api/audit-logs?limit=100", headers=auth_headers)
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_delete_single_log(client, auth_headers):
    _seed_logs(client, auth_headers, 3)
    logs = _list_logs(client, auth_headers)
    assert len(logs) >= 3
    target = logs[0]["id"]
    resp = client.delete(f"/api/audit-logs/{target}", headers=auth_headers)
    assert resp.status_code == 200, resp.text
    remaining = _list_logs(client, auth_headers)
    assert all(l["id"] != target for l in remaining)
    assert len(remaining) == len(logs) - 1


def test_delete_missing_log_404(client, auth_headers):
    resp = client.delete("/api/audit-logs/999999", headers=auth_headers)
    assert resp.status_code == 404


def test_clear_all_logs(client, auth_headers):
    _seed_logs(client, auth_headers, 2)
    assert len(_list_logs(client, auth_headers)) >= 2
    resp = client.delete("/api/audit-logs", headers=auth_headers)
    assert resp.status_code == 200, resp.text
    assert resp.json()["deleted"] >= 2
    assert _list_logs(client, auth_headers) == []


def test_delete_forbidden_for_manager(client, auth_headers):
    _seed_logs(client, auth_headers, 1)
    mgr = _manager_headers(client, auth_headers)
    # Baseline AFTER the manager was created + logged in (those actions
    # themselves write audit rows).
    logs = _list_logs(client, auth_headers)
    resp = client.delete(f"/api/audit-logs/{logs[0]['id']}", headers=mgr)
    assert resp.status_code == 403
    resp = client.delete("/api/audit-logs", headers=mgr)
    assert resp.status_code == 403
    # Nothing was deleted.
    assert len(_list_logs(client, auth_headers)) == len(logs)


def test_delete_requires_auth(client, auth_headers):
    _seed_logs(client, auth_headers, 1)
    logs = _list_logs(client, auth_headers)
    resp = client.delete(f"/api/audit-logs/{logs[0]['id']}")
    assert resp.status_code == 401
