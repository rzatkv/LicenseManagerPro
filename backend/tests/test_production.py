"""Production-hardening tests (v2.1): pagination, rate limiting, security
headers, readiness, and the audit log."""
from database import SessionLocal, get_db
from main import app
from models import Product
from utils.rate_limit import reset_rate_limits


def _create_license(client, auth_headers, **overrides):
    body = {"product": "Test Product", "expires_in_days": 30}
    body.update(overrides)
    response = client.post("/api/licenses", json=body, headers=auth_headers)
    assert response.status_code == 201, response.text
    return response.json()


def _create_product(client, auth_headers, **overrides):
    body = {"name": "Widget Pro", "billing_cycles": ["monthly", "annual"]}
    body.update(overrides)
    response = client.post("/api/products", json=body, headers=auth_headers)
    assert response.status_code == 201, response.text
    return response.json()


def _login(client, email, password="userpass123"):
    response = client.post(
        "/api/auth/login", json={"email": email, "password": password}
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


# --- Pagination -------------------------------------------------------------


def test_products_pagination_limit_and_total_count(client, auth_headers):
    for i in range(3):
        _create_product(client, auth_headers, name=f"Paged-{i}")
    response = client.get("/api/products?limit=2", headers=auth_headers)
    assert response.status_code == 200
    assert len(response.json()) == 2
    assert response.headers["X-Total-Count"] == "3"

    response = client.get("/api/products?skip=2&limit=2", headers=auth_headers)
    assert len(response.json()) == 1
    assert response.headers["X-Total-Count"] == "3"


def test_licenses_pagination_limit_and_total_count(client, auth_headers):
    for i in range(3):
        _create_license(client, auth_headers, key=f"PAGE-LIC-000{i}")
    response = client.get("/api/licenses?limit=2", headers=auth_headers)
    assert response.status_code == 200
    assert len(response.json()) == 2
    assert response.headers["X-Total-Count"] == "3"


def test_pagination_limit_clamped_to_100(client, auth_headers):
    db = SessionLocal()
    try:
        for i in range(105):
            db.add(Product(name=f"Bulk-{i}", slug=f"bulk-{i}"))
        db.commit()
    finally:
        db.close()
    response = client.get("/api/products?limit=200", headers=auth_headers)
    assert response.status_code == 200
    assert len(response.json()) == 100
    assert response.headers["X-Total-Count"] == "105"

    response = client.get("/api/products?limit=500", headers=auth_headers)
    assert len(response.json()) == 100
    assert response.headers["X-Total-Count"] == "105"


def test_users_and_languages_pagination_headers(client, auth_headers):
    response = client.get("/api/users?limit=2", headers=auth_headers)
    assert response.status_code == 200
    assert response.headers["X-Total-Count"] == "1"

    response = client.get("/api/languages?limit=2", headers=auth_headers)
    assert response.status_code == 200
    assert response.headers["X-Total-Count"] == "0"


# --- Rate limiting ----------------------------------------------------------


def test_login_rate_limited_after_limit(client, auth_headers, monkeypatch):
    monkeypatch.setattr("config.RATE_LIMIT_AUTH_PER_MINUTE", 2)
    reset_rate_limits()
    body = {"email": "admin@example.com", "password": "adminpass123"}
    assert client.post("/api/auth/login", json=body).status_code == 200
    assert client.post("/api/auth/login", json=body).status_code == 200
    third = client.post("/api/auth/login", json=body)
    assert third.status_code == 429
    assert third.json()["detail"] == "Too many requests, please try again later"


def test_license_validate_rate_limited(client, auth_headers, monkeypatch):
    monkeypatch.setattr("config.RATE_LIMIT_VALIDATE_PER_MINUTE", 2)
    reset_rate_limits()
    lic = _create_license(client, auth_headers, key="RATE-LIC-00001")
    body = {"key": lic["key"]}
    assert client.post("/api/licenses/validate", json=body, headers=auth_headers).status_code == 200
    assert client.post("/api/licenses/validate", json=body, headers=auth_headers).status_code == 200
    third = client.post("/api/licenses/validate", json=body, headers=auth_headers)
    assert third.status_code == 429


def test_check_access_rate_limited(client, auth_headers, monkeypatch):
    monkeypatch.setattr("config.RATE_LIMIT_VALIDATE_PER_MINUTE", 2)
    reset_rate_limits()
    response = client.post(
        "/api/api-keys",
        json={"key": "rate-limit-key-123", "access_rights": ["get_license_info"]},
        headers=auth_headers,
    )
    assert response.status_code == 201, response.text
    headers = {"api-key": "rate-limit-key-123"}
    assert client.get("/api/api-keys/check-access", headers=headers).status_code == 200
    assert client.get("/api/api-keys/check-access", headers=headers).status_code == 200
    assert client.get("/api/api-keys/check-access", headers=headers).status_code == 429


# --- Security headers + request IDs -----------------------------------------


def test_security_headers_on_api_response(client, auth_headers):
    response = client.get("/api/products", headers=auth_headers)
    assert response.status_code == 200
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["X-Frame-Options"] == "DENY"
    assert response.headers["Referrer-Policy"] == "no-referrer"
    assert response.headers["Permissions-Policy"] == "camera=(), microphone=(), geolocation=()"
    assert "Content-Security-Policy" in response.headers
    assert "default-src 'none'" in response.headers["Content-Security-Policy"]


def test_no_csp_on_docs(client):
    response = client.get("/docs")
    assert response.status_code == 200
    assert "Content-Security-Policy" not in response.headers
    # The other hardening headers still apply everywhere.
    assert response.headers["X-Content-Type-Options"] == "nosniff"


def test_request_id_present(client, auth_headers):
    response = client.get("/api/products", headers=auth_headers)
    assert response.status_code == 200
    request_id = response.headers.get("X-Request-ID")
    assert request_id
    assert len(request_id) == 32  # uuid4 hex

    # Two requests get different IDs.
    other = client.get("/api/products", headers=auth_headers)
    assert other.headers["X-Request-ID"] != request_id


# --- Readiness --------------------------------------------------------------


def test_ready_returns_200(client):
    response = client.get("/api/system/ready")
    assert response.status_code == 200
    assert response.json() == {"status": "ready"}


def test_ready_returns_503_when_db_down(client):
    def broken_db():
        class BrokenSession:
            def execute(self, *args, **kwargs):
                # A realistic driver error naming host + driver — it
                # must NEVER reach the client (v3.0.6, security L4).
                raise Exception(
                    "pymysql.err.OperationalError: (2003, "
                    "\"Can't connect to MySQL server on "
                    "db.internal.example.com:3306\")"
                )

        yield BrokenSession()

    app.dependency_overrides[get_db] = broken_db
    try:
        response = client.get("/api/system/ready")
        assert response.status_code == 503
        assert response.json()["status"] == "not_ready"
        assert response.json()["detail"] == "Database unreachable"
        assert "db.internal.example.com" not in response.text
        assert "pymysql" not in response.text
    finally:
        app.dependency_overrides.pop(get_db, None)


# --- Audit log --------------------------------------------------------------


def test_license_create_writes_audit_row(client, auth_headers):
    _create_license(client, auth_headers, key="AUDIT-LIC-0001")
    response = client.get("/api/audit-logs", headers=auth_headers)
    assert response.status_code == 200
    rows = response.json()
    assert response.headers["X-Total-Count"] == str(len(rows))
    match = [r for r in rows if r["action"] == "license.create"]
    assert len(match) == 1
    row = match[0]
    assert row["actor_email"] == "admin@example.com"
    assert row["entity"] == "license"
    assert row["entity_id"] is not None
    assert row["details"]["key"] == "AUDIT-LIC-0001"


def test_audit_logs_forbidden_for_viewer(client, auth_headers):
    client.post(
        "/api/users",
        json={"email": "view@example.com", "password": "userpass123", "role": "viewer"},
        headers=auth_headers,
    )
    viewer_headers = _login(client, "view@example.com")
    response = client.get("/api/audit-logs", headers=viewer_headers)
    assert response.status_code == 403


def test_audit_logs_entity_filter(client, auth_headers):
    _create_product(client, auth_headers, name="FilterMe")
    _create_license(client, auth_headers, key="AUDIT-LIC-0002")

    response = client.get("/api/audit-logs?entity=product", headers=auth_headers)
    assert response.status_code == 200
    rows = response.json()
    assert rows, "expected at least one product audit row"
    assert all(r["entity"] == "product" for r in rows)
    assert any(r["action"] == "product.create" for r in rows)

    response = client.get("/api/audit-logs?entity=license", headers=auth_headers)
    assert all(r["entity"] == "license" for r in response.json())

    response = client.get("/api/audit-logs?actor=admin@", headers=auth_headers)
    assert response.status_code == 200
    assert all("admin@" in r["actor_email"] for r in response.json())


def test_user_role_change_audited_distinctly(client, auth_headers):
    created = client.post(
        "/api/users",
        json={"email": "role@example.com", "password": "userpass123", "role": "viewer"},
        headers=auth_headers,
    ).json()
    response = client.put(
        f"/api/users/{created['id']}",
        json={"role": "support"},
        headers=auth_headers,
    )
    assert response.status_code == 200

    rows = client.get("/api/audit-logs?entity=user", headers=auth_headers).json()
    actions = {r["action"] for r in rows}
    assert "user.create" in actions
    assert "user.role_change" in actions
