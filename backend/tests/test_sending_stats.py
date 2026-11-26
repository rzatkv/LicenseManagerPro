"""Sending stats aggregation (v3.0): per-day, per-channel sent/failed."""
from datetime import datetime, timedelta

from models import AuditLog


def _seed_log(db, action, days_ago):
    # Exactly N*24h ago: same time of day, so the calendar date is
    # deterministic regardless of when the test runs.
    row = AuditLog(
        actor_email="system",
        action=action,
        entity="notification",
        entity_id=None,
        details="{}",
        created_at=datetime.utcnow() - timedelta(days=days_ago),
    )
    db.add(row)
    db.commit()


def test_sending_stats_aggregates(client, auth_headers):
    from database import SessionLocal

    db = SessionLocal()
    try:
        # Today: 2 email sent, 1 email failed, 1 sms sent, 1 telegram sent.
        _seed_log(db, "notify.email_sent", 0)
        _seed_log(db, "notify.email_sent", 0)
        _seed_log(db, "notify.email_failed", 0)
        _seed_log(db, "notify.sms_sent", 0)
        _seed_log(db, "notify.telegram_sent", 0)
        # Yesterday: 1 email sent, 1 twofa sms sent (counts as sms).
        _seed_log(db, "notify.email_sent", 1)
        _seed_log(db, "twofa.sms_sent", 1)
        # 20 days ago: outside the 14-day window — must not appear.
        _seed_log(db, "notify.email_sent", 20)
        # A non-channel audit row must not appear either.
        _seed_log(db, "user.login", 0)
    finally:
        db.close()

    resp = client.get("/api/system/sending-stats?days=14", headers=auth_headers)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["days"] == 14
    assert len(body["dates"]) == 14
    today = datetime.utcnow().date().isoformat()
    yesterday = (datetime.utcnow().date() - timedelta(days=1)).isoformat()
    by_date = {row["date"]: row for row in body["series"]["email"]}
    assert by_date[today] == {"date": today, "sent": 2, "failed": 1}
    assert by_date[yesterday] == {"date": yesterday, "sent": 1, "failed": 0}
    sms = {row["date"]: row for row in body["series"]["sms"]}
    assert sms[today] == {"date": today, "sent": 1, "failed": 0}
    assert sms[yesterday] == {"date": yesterday, "sent": 1, "failed": 0}
    tg = {row["date"]: row for row in body["series"]["telegram"]}
    assert tg[today] == {"date": today, "sent": 1, "failed": 0}
    total = {row["date"]: row for row in body["series"]["total"]}
    assert total[today] == {"date": today, "sent": 4, "failed": 1}
    # The 20-day-old row is outside the window: the first date has 0.
    assert body["series"]["email"][0] == {
        "date": body["dates"][0], "sent": 0, "failed": 0,
    }


def test_sending_stats_admin_only(client, auth_headers):
    resp = client.get("/api/system/sending-stats")
    assert resp.status_code == 401
    resp = client.get("/api/system/sending-stats?days=7", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["days"] == 7


def test_sending_stats_days_validation(client, auth_headers):
    resp = client.get("/api/system/sending-stats?days=0", headers=auth_headers)
    assert resp.status_code == 422
    resp = client.get("/api/system/sending-stats?days=91", headers=auth_headers)
    assert resp.status_code == 422
