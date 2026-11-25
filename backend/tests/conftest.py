"""Pytest fixtures: the app runs against a temporary SQLite database.

The test database file is chosen BEFORE main.py is imported, because the
engine is created at import time. Every test gets fresh tables; the app
lifespan then seeds the system settings on the same engine.
"""
import os
import sys

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)) + "/..")

TEST_DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "test.db")
if os.path.exists(TEST_DB_PATH):
    os.remove(TEST_DB_PATH)
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB_PATH}"
os.environ["SECRET_KEY"] = "test-secret-key-for-pytest-only"

from database import Base, SessionLocal, engine, get_db  # noqa: E402
from main import app  # noqa: E402


@pytest.fixture()
def client():
    """TestClient with fresh tables and get_db bound to the test engine."""

    def override_get_db():
        db = SessionLocal()
        try:
            yield db
        finally:
            db.close()

    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def admin_token(client):
    """Register the bootstrap admin and return a JWT for it."""
    response = client.post(
        "/api/auth/register",
        json={"email": "admin@example.com", "password": "adminpass123"},
    )
    assert response.status_code == 201, response.text
    response = client.post(
        "/api/auth/login",
        json={"email": "admin@example.com", "password": "adminpass123"},
    )
    assert response.status_code == 200, response.text
    return response.json()["access_token"]


@pytest.fixture()
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}
