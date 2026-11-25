"""Live smoke test for v2.3.2 (run against a temp SQLite DB, then exit)."""
import os
import secrets
import subprocess
import sys
import time

import httpx
import pyotp

PORT = 8899
BASE = f"http://127.0.0.1:{PORT}/api"
DB = "/tmp/lmp-smoke-230.db"
for suffix in ("", "-journal"):
    try:
        os.remove(DB + suffix)
    except FileNotFoundError:
        pass

env = dict(os.environ, DATABASE_URL=f"sqlite:///{DB}", SECRET_KEY=secrets.token_hex(32))
proc = subprocess.Popen(
    [sys.executable, "-m", "uvicorn", "main:app", "--port", str(PORT)],
    cwd=os.path.dirname(os.path.abspath(__file__)) or ".",
    env=env,
    stdout=subprocess.DEVNULL,
    stderr=subprocess.DEVNULL,
)
passed, failed = 0, 0


def check(name, cond, extra=""):
    global passed, failed
    if cond:
        passed += 1
        print(f"  ok  {name}")
    else:
        failed += 1
        print(f"  FAIL {name} {extra}")


try:
    with httpx.Client(base_url=BASE, timeout=10, trust_env=False) as c:
        for _ in range(30):
            try:
                if c.get("/system/ready").status_code in (200, 503):
                    break
            except httpx.ConnectError:
                time.sleep(0.5)
        # register + login
        r = c.post("/auth/register", json={"email": "smoke@example.com", "password": "password123"})
        check("register 201", r.status_code == 201, r.text[:200])
        r = c.post("/auth/login", json={"email": "smoke@example.com", "password": "password123"})
        check("login 200", r.status_code == 200, r.text[:200])
        tok = r.json()["access_token"]
        h = {"Authorization": f"Bearer {tok}"}
        # version
        r = c.get("/system/info", headers=h)
        check("version 2.3.2", r.status_code == 200 and r.json().get("version") == "2.3.2", r.text[:200])
        # routes all 200
        for path in ("/dashboard/summary", "/notifications", "/downloads", "/product-groups", "/roles", "/search?q=test", "/dashboard/activations-trend", "/dashboard/webhook-stats"):
            r = c.get(path, headers=h)
            check(f"GET {path} 200", r.status_code == 200, r.text[:160])
        # search works
        r = c.get("/search?q=smoke", headers=h)
        check("search returns groups", r.status_code == 200 and set(r.json()) == {"licenses", "products", "users"}, r.text[:160])
        # 2FA setup/verify end to end
        r = c.post("/auth/2fa/setup", headers=h)
        check("2fa setup 200", r.status_code == 200, r.text[:200])
        secret = r.json()["secret"]
        code = pyotp.TOTP(secret).now()
        r = c.post("/auth/2fa/verify", json={"code": code}, headers=h)
        check("2fa verify correct code 200", r.status_code == 200, r.text[:200])
        check("2fa verify returns backup codes", len(r.json().get("backup_codes", [])) == 8, r.text[:200])
        r = c.post("/auth/2fa/verify", json={"code": "000000"}, headers=h)
        check("2fa verify wrong code rejected", r.status_code in (400, 401), r.text[:160])
        # login now requires the TOTP step
        r = c.post("/auth/login", json={"email": "smoke@example.com", "password": "password123"})
        check("login with 2FA returns requires_2fa", r.status_code == 200 and r.json().get("requires_2fa") is True, r.text[:200])
        temp = r.json().get("temp_token")
        r = c.post("/auth/verify-2fa", json={"temp_token": temp, "code": pyotp.TOTP(secret).now()})
        check("verify-2fa issues token", r.status_code == 200 and "access_token" in r.json(), r.text[:200])
        tok2 = r.json()["access_token"]
        h2 = {"Authorization": f"Bearer {tok2}"}
        # license security modes: strict vs lenient
        r = c.post("/products", json={"name": "SmokeProd", "billing_cycles": ["monthly"]}, headers=h2)
        check("product create 201", r.status_code == 201, r.text[:200])
        pid = r.json()["id"]
        r = c.post("/licenses", json={"product_id": pid, "billing_cycle": "monthly", "allowed_domains": ["a.com"]}, headers=h2)
        check("license create 201", r.status_code == 201, r.text[:200])
        key = r.json()["key"]
        r = c.post("/licenses/validate", json={"key": key, "domain": "other.com"}, headers=h2)
        check("strict mode denies domain mismatch", r.status_code == 200 and r.json().get("valid") is False, r.text[:200])
        r = c.put("/settings/license-security", json={"strictness": "lenient", "missing_lock_behavior": "allow"}, headers=h2)
        check("license-security lenient saved", r.status_code == 200 and r.json().get("strictness") == "lenient", r.text[:200])
        r = c.post("/licenses/validate", json={"key": key, "domain": "other.com"}, headers=h2)
        check("lenient mode allows with warning", r.status_code == 200 and r.json().get("valid") is True and r.json().get("warnings"), r.text[:200])
        # module key: create / use / renew / revoke + signing
        r = c.post("/api-keys", json={"scopes": ["module"], "expires_in_days": 90, "access_rights": ["create_license", "get_license_info", "renew_license"]}, headers=h2)
        check("module key create 201", r.status_code == 201, r.text[:200])
        msecret = r.json()["plain_key"]
        mkid = r.json()["id"]
        check("module key prefix only in key field", r.json()["key"] == msecret[:12], r.json()["key"])
        mh = {"X-API-Key": msecret}
        r = c.post("/licenses", json={"product_id": pid, "billing_cycle": "monthly"}, headers=mh)
        check("module key creates license", r.status_code == 201, r.text[:200])
        mlic = r.json()["id"]
        r = c.post(f"/licenses/{mlic}/renew", headers=mh)
        check("module key renews license", r.status_code == 200, r.text[:200])
        r = c.get("/users", headers=mh)
        check("module key cannot call admin endpoint", r.status_code in (401, 403), r.text[:160])
        r = c.post(f"/api-keys/{mkid}/rotate", headers=h2)
        check("rotate 200 + new secret once", r.status_code == 200 and r.json().get("plain_key") and r.json()["plain_key"] != msecret, r.text[:200])
        r = c.post("/licenses", json={"product_id": pid, "billing_cycle": "monthly"}, headers=mh)
        check("old key dead after rotation", r.status_code == 401, r.text[:160])
        # billing-cycle sync via a fresh module key
        r = c.post("/api-keys", json={"scopes": ["module"], "expires_in_days": 30, "access_rights": ["create_license"]}, headers=h2)
        fresh = r.json()["plain_key"]
        r = c.post("/licenses", json={"product_id": pid, "billing_cycle": "biennial"}, headers={"X-API-Key": fresh})
        check("module billing-cycle sync creates license", r.status_code == 201 and r.json().get("billing_cycle") == "biennial", r.text[:200])
        r = c.get(f"/products/{pid}", headers=h2)
        check("product gained biennial", "biennial" in r.json().get("billing_cycles", []), r.text[:200])
        r = c.post("/licenses", json={"product_id": pid, "billing_cycle": "triennial"}, headers={"X-API-Key": fresh})
        check("unknown cycle 422", r.status_code == 422, r.text[:160])
        # downloads direct URLs
        r = c.get("/downloads", headers=h2)
        dls = {d["id"]: d for d in r.json()}
        check("downloads has 10 modules", len(dls) == 10, str(len(dls)))
        check("download URL is direct GitHub asset", dls["whmcs"]["download_url"] == "https://github.com/rzatkv/LicenseManagerPro/releases/download/v2.3.2/licensemanagerpro-whmcs-2.3.2.zip", dls["whmcs"]["download_url"])
finally:
    proc.terminate()
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        proc.kill()

print(f"\n{passed} passed, {failed} failed.")
sys.exit(1 if failed else 0)
