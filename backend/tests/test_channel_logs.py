"""Per-channel logs in the existing Logs menu (v3.0): ?channel= filter."""
from models import AuditLog


def _seed(db, action):
    db.add(AuditLog(actor_email="system", action=action, entity="notification"))
    db.commit()


def test_channel_filter_separates_streams(client, auth_headers):
    from database import SessionLocal

    db = SessionLocal()
    try:
        _seed(db, "notify.email_sent")
        _seed(db, "notify.email_failed")
        _seed(db, "notify.sms_sent")
        _seed(db, "notify.telegram_sent")
        _seed(db, "twofa.email_sent")
        _seed(db, "service_status.check_failed")
        _seed(db, "user.login")
    finally:
        db.close()

    def actions(channel=None):
        url = "/api/audit-logs"
        if channel:
            url += f"?channel={channel}"
        resp = client.get(url, headers=auth_headers)
        assert resp.status_code == 200, resp.text
        return [r["action"] for r in resp.json()]

    assert set(actions("email")) == {"notify.email_sent", "notify.email_failed"}
    assert actions("sms") == ["notify.sms_sent"]
    assert actions("telegram") == ["notify.telegram_sent"]
    assert actions("twofa") == ["twofa.email_sent"]
    assert actions("system") == ["service_status.check_failed"]
    all_actions = actions()
    # Plus the register/login audit rows from the fixture (user.create,
    # user.login) on top of the 7 seeded channel rows.
    assert "user.login" in all_actions
    assert len(all_actions) == 9
    for seeded in (
        "notify.email_sent", "notify.email_failed", "notify.sms_sent",
        "notify.telegram_sent", "twofa.email_sent", "service_status.check_failed",
    ):
        assert seeded in all_actions


def test_channel_filter_rejects_unknown(client, auth_headers):
    resp = client.get("/api/audit-logs?channel=pigeon", headers=auth_headers)
    assert resp.status_code == 400


def test_channel_logs_delete_still_works(client, auth_headers):
    """Single delete + clear-all (v3.0 audit delete) work on channel rows."""
    from database import SessionLocal

    db = SessionLocal()
    try:
        _seed(db, "notify.email_sent")
        _seed(db, "notify.sms_sent")
    finally:
        db.close()
    rows = client.get("/api/audit-logs?channel=email", headers=auth_headers).json()
    assert len(rows) == 1
    log_id = rows[0]["id"]
    resp = client.delete(f"/api/audit-logs/{log_id}", headers=auth_headers)
    assert resp.status_code == 200
    assert client.get("/api/audit-logs?channel=email", headers=auth_headers).json() == []
    # Clear-all empties the rest.
    resp = client.delete("/api/audit-logs", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["deleted"] >= 1
    assert client.get("/api/audit-logs", headers=auth_headers).json() == []
