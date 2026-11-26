[English](#english) | [فارسی](#فارسی)

![License Manager Pro](docs/banner.svg)

<a id="english"></a>
# License Manager Pro

**License Manager Pro** is a comprehensive system for managing API keys, licenses, and system settings. Specifically designed for teams and organizations, this tool provides precise and secure management of software access and user permissions. Built with **React.js** on the frontend and **FastAPI** on the backend, it offers high performance and flexibility. The license check is a public call (no API key, no JWT) with the blacklist and license locks still enforced; everything else needs a JWT or a scoped module key.

## Live demo

Try the frontend right in your browser — no install, no backend needed:

**https://rzatkv.github.io/LicenseManagerPro/**

It runs in demo mode: every API call is answered by an in-browser mock (`frontend/src/utils/demoData.js`), so you can log in with the prefilled demo account (`demo@demo.com` / `demo1234`), browse the dashboard, create/delete licenses and API keys, and manage users. The sample data is stored only in your own browser (localStorage); nothing leaves your machine. The frontend is also installable as a PWA (manifest + service worker + app icons) — use "Install app" in your browser to add it to your home screen. To run the same demo locally: `cd frontend && REACT_APP_DEMO_MODE=true npm run build` (or `npm start` with `REACT_APP_DEMO_MODE=true`). Deployment is automated by `.github/workflows/pages-demo.yml`; one-time repo setup: Settings → Pages → Source: GitHub Actions.

---

## What's new in v3.0.0

Major release: zero scroll on every page, the Settings rebuild, real SMS (IPPanel), CAPTCHA, maintenance mode, and the license check going public — plus the last notes from the v2.3.3 phone check and no money anywhere in the product (this is not a financial system):

- **Login language dropdown can no longer touch the hero headline — and the login page no longer scrolls on phones:** the v2.3.3 phone check found the open menu still covering part of the hero headline text (measured live-DOM: 3,700–5,700 px² over two lines at 360/400px, both languages) — the tile itself was already clear. While the menu is open the slides (+ dots) now drop 110px inside the hero's own slack (the hero is 288px tall on phones, its content ~180px), so the first headline line starts below the dropdown's bottom edge. Verified 0 px² overlap at 360/400px, en + fa, light + dark. The stacked phone layout also used to overflow an 800px viewport by 215px (420px hero + 543px form); the hero is now a fixed 288px, the form logo is hidden on the stacked layout (the hero logo sits right above it), and the form spacing is trimmed — the page fits 360–768px widths at 800px height with room to spare.
- **Money is gone from the whole product:** no money column in the Products table, no money field in the product wizard or edit form, no money in the product details popup or the license wizard's product picker, no money in the demo data, and no money wording in the UI or docs (en + fa). The backend drops the product money fields and the dashboard revenue estimate entirely (the API no longer returns them); pre-v3.0.0 databases have the two columns dropped on startup. Module admin dropdowns (WHMCS, WooCommerce) show the product name + billing cycles only.
- **Zero scroll everywhere — measured, not claimed:** Dashboard, API Docs, About and every list page fit the viewport at 360–1920px, en + fa, light + dark — content is split into tabs and responsive pagination, never squeezed. The dashboard is tabbed (Overview, Highlights, Trends, Status, Monthly, Activity, API Keys, Users, Services, Sending) and the live demo's scrolling dashboard is fixed by it. API Docs verified with a Playwright sweep: 476 tab × mini-view × width × language × theme combinations, 0 scroll failures — the page is a flex column that fills the content region, long samples scroll inside their own block, the endpoints table paginates 3/6/12 rows by width and viewport height, and the module-auth and locking guides are split into their own mini-views.
- **Notifications bell fixed on laptops:** the dropdown was clipped 124px off the right edge in EN (the topbar's `backdrop-filter` made it the containing block for the fixed panel) — it is now portaled to `document.body`, so the viewport clamp is correct at every width. Menu hover no longer underlines (the background/slide feedback stays).
- **Settings rebuilt:** Languages live in Settings as their own tab (no standalone menu entry); the Add Setting form, per-setting delete buttons and the settings DELETE endpoint are gone — settings are predefined, updated only through the one Save button at the bottom of each form with a toast confirmation; app version / released version / last updated are no longer shown in Settings at all (version lives only on About, read from code); Day request limit moved to the Security tab; every label is a proper translated string, never a raw key. New: Panel domain (validated hostname) in General, maintenance mode + custom message (server-side guard, admin bypass; visitors see the maintenance page, admins sign in through it), and CAPTCHA (custom math/text/reverse models + Google reCAPTCHA v2/v3, server-side verified, off by default).
- **Real SMS — IPPanel, for real:** the SMS tab has three providers (IPPanel, Kavenegar, Faraz) with exactly one active at a time. IPPanel is a real integration against the official Edge API (`https://edge.ippanel.com/v1`, API key in the raw `Authorization` header, `POST /api/send` for webservice + pattern sends, `GET /api/payment/credit/mine` for balance) — the key and sender number live server-side only, never reach the frontend and are never logged. 2FA-via-SMS and per-event notification SMS really send through it; the test-send button really sends. Failures are surfaced honestly (logged + returned as errors, never a fake "sent"). The dashboard shows a live IPPanel balance widget (balance + unit, last-checked time, re-check button, ~5-minute cache, loads asynchronously and never blocks the page; "not configured" when no key is set; a clearly-mocked balance in demo mode). Kavenegar/Faraz stay as before (host-reachability check).
- **Email, Telegram, and per-event notifications:** the Email tab has SMTP settings, templates + signature (actually used when sending), and per-event toggles; the Telegram tab has a bot token (server-side), a test-send, and per-event toggles; SMS and email sending can be toggled per event. The Logs menu carries per-channel streams (All / Email / SMS / Telegram / 2FA / System) — no new menu.
- **License check is public:** `POST /api/licenses/validate` needs no API key and no JWT — any server can check a license with one call. The blacklist still applies, the 60/min rate limit stays, and the domain/IP/install-path locks are still enforced (strict or lenient per the license-security settings).
- **2FA by email or SMS, not just TOTP:** the login 2FA step can deliver its code by email or SMS in addition to the authenticator app; the channel is chosen in Settings → Security.
- **Calendars, encoding, and input hygiene:** dates can render in Gregorian, Jalali, or Lunar Hijri calendars (Settings → General); the system encoding setting (UTF-8 default, allowlisted) never touches the database charset; 4-byte characters (emoji) are stripped from inputs server-side by default (toggleable).
- **Product & license notes — really gated:** a notes field on products and licenses, shown only while the General-tab toggle is on. When it is off the field is hidden everywhere and the API rejects notes with 400 — the toggle is enforced in the model, the schemas, and the service, not just the UI.
- **Popups, not inline forms — on every list page:** Add User, Add to Blacklist and Add Language open as animated popups from a toolbar button placed first; the permission-matrix section is removed from Users (Roles is the single place for access levels). **Licenses finally has an edit action:** an edit button on every row (and in the details popup) opens the edit form in the animated popup — product, billing cycle, owner, status, new expiry, max activations, locks, notes — backed by `PUT /api/licenses/{id}`; the key itself is shown read-only, never editable. API Keys edit stays in its popup, and the key is still shown only once at creation.
- **Audit logs can be deleted:** per-row delete + clear-all (admin-only, confirmed), backend + demo mock.
- **API Docs rewritten:** tabbed, no-scroll, code samples in cURL, Python, JavaScript, PHP and Go for the REST API and for HMAC webhook verification; the WHMCS/WordPress guides are gone (one-line pointer to Downloads instead).
- **Dashboard:** service-status widget (email / SMS / Telegram / database / webhooks / GitHub, with a re-check button and a 5-minute timer, async and non-blocking), per-channel sending charts with real data, an independent persisted time range under each chart, and a gear popup for widget visibility (persisted per admin).
- **Themes:** ten built-in presets (Default, Ocean, Forest, Sunset, Graphite, Rose, Teal, Amber, Lime, Ruby) plus the custom theme builder — and each admin's theme is stored separately per admin (backend is the source of truth), so one admin's choice never mixes with another's.
- **Animations:** popups and dropdowns animate open *and* closed, the bell rings and its badge pops, tabs fade/slide — all transform/opacity-based, snappy (~150–300ms), and skipped under `prefers-reduced-motion`.
- **Version bump:** 3.0.0 everywhere, demo storage key `lmp-demo-db-v14`, `smoke_test_300.py`, mock next-release v3.0.1, all 10 module ZIPs rebuilt at 3.0.0 parity. Older releases are in [CHANGELOG.md](CHANGELOG.md).

## Key Features
- **API Key Management:** Create, list, update and delete API keys with access rights, expiry, IP/domain/directory restrictions, single-use keys, and a daily request limit. Module-scoped keys (time-limited, optional HMAC signing + IP allowlist) are the only way modules connect.
- **License Management:** Create and filter licenses (all/active/inactive, created today/this week/this month), view details, edit in a popup, renew, reissue, validate (public endpoint), and track activations. Notes on products and licenses (toggleable).
- **Public license check:** `POST /api/licenses/validate` needs no key — blacklist, rate limit and locks still enforced.
- **Real SMS (IPPanel):** webservice + pattern sends and live balance, with Kavenegar/Faraz alongside; 2FA-via-SMS and per-event SMS notifications.
- **User Management:** Admin-only user CRUD with roles (admin/manager/support/viewer + custom roles); nobody can delete their own account or the last admin.
- **Roles:** Full CRUD for custom roles with permission lists; built-ins protected.
- **System Settings:** Predefined settings only (General, Language, Languages, Theme, Security, SMS, Email, Telegram tabs) — one Save button per form, toast confirmation, no delete.
- **CAPTCHA:** Custom models + Google reCAPTCHA v2/v3, server-side verified, off by default.
- **Maintenance mode:** Server-side guard with a custom message and admin bypass.
- **Notifications:** Bell + Notifications page; per-channel (email/SMS/Telegram) delivery and per-channel log streams.
- **Update Check:** Compare the running version against a configured latest version and record an applied update.
- **High Security:** JWT authentication (Bearer tokens), bcrypt password hashing, TOTP 2FA (+ email/SMS codes), and protected API routes. Security is the top priority: every release is checked against an adversarial test suite that must fail closed.
- **Modern UI:** Responsive, zero-scroll, tabbed and popup-split interface with a graphical dashboard; ten built-in theme presets plus a custom theme builder, stored separately per admin; full English/Persian UI with RTL.

---
## Project Layout

```
LicenseManagerPro/
├── backend/                 # FastAPI backend
│   ├── main.py              # App entrypoint, routers mounted under /api
│   ├── config.py            # Environment-based configuration (APP_VERSION = single version constant)
│   ├── database.py          # SQLAlchemy 2.x engine/session, seed_roles/seed_settings, escape_like
│   ├── models.py            # User, ApiKey (hashed), License, SystemSetting, Product, ProductGroup, BlacklistEntry, Notification, LicenseActivation, AuditLog, Role, UserSetting
│   ├── schemas.py           # Pydantic v2 schemas
│   ├── requirements.txt
│   ├── pyproject.toml       # ruff config (B008 ignored: FastAPI Depends idiom)
│   ├── Dockerfile
│   ├── .env.example
│   ├── routers/             # auth (+2FA), api_keys (+rotate), licenses, users, dashboard, settings, system, products, product_groups, blacklist, notifications, downloads, roles, search, audit_logs, languages, webhooks, sms (balance + test-send)
│   ├── services/            # api_keys (hashing/scopes/signing), licenses (validate + billing sync), users, settings, products, product_groups, blacklist, notifications, updates, downloads (direct GitHub URLs), webhooks (SSRF guard), license_security, roles, twofa, search, sms (provider abstraction), sms_ippanel (real IPPanel Edge client), service_status
│   ├── utils/               # auth (JWT + hashing), permissions (role permission lists), rate_limit (login lockout + 2FA bucket), module_auth (require_actor: JWT or module key)
│   └── tests/               # pytest suite (temporary SQLite DB; run one at a time — shared test.db)
├── frontend/                # React 18 frontend (react-scripts)
│   ├── package.json         # version = single frontend version constant
│   ├── public/index.html    # SVG favicon (logo.svg) + CSP meta tag
│   └── src/
│       ├── App.js           # Routes + ProtectedRoute (/roles, /profile)
│       ├── config.js        # API_BASE_URL (REACT_APP_API_URL or http://127.0.0.1:8000/api)
│       ├── index.js         # React 18 createRoot entrypoint; unregisters any service worker on load
│       ├── theme.js         # ThemeProvider (mode light/dark/auto + 10 presets + custom, per-user persist)
│       ├── pages/           # Login (animated hero + 2FA step + maintenance page), Dashboard (tabbed, customizable widgets, service status, SMS balance, sending charts), Products, Settings (tabs: General/Language/Languages/Theme/Security/SMS/Email/Telegram), LicenseList (edit in popup), APIKeyList (rotate + show-once), UserManagement, Roles, Profile (2FA setup), Languages, ApiDocs (tabbed, zero-scroll), About, Blacklist, Downloads (direct GitHub links), Notifications, ProductGroups
│       ├── components/      # Layout (sidebar + topbar: GlobalSearch, ThemeToggle, ProfileMenu), Wizard, NotificationsBell, ChipSelect, ToggleSwitch, Modal, Toast, ConfirmModal
│       ├── i18n/            # translations.js (en/fa, 877 keys) + LanguageContext
│       ├── styles/
│       └── utils/           # api.js (get/post/put/del), auth.js, demoData.js (in-browser mock, storage key lmp-demo-db-v14), format.js
├── modules/                 # Downloadable integrations, one per platform, each with version.json == app version
│   ├── whmcs/               # WHMCS server module (PHP, MVC) + version.json
│   ├── woocommerce/         # WordPress/WooCommerce plugin (PHP, MVC) + version.json
│   ├── wordpress/           # WordPress plugin, no WooCommerce (PHP, MVC) + version.json
│   ├── joomla/              # Joomla component (MVC) + version.json
│   ├── prestashop/          # PrestaShop module (MVC) + version.json
│   ├── magento/             # Magento 2 module (MVC) + version.json
│   ├── opencart/            # OpenCart extension (MVC) + version.json
│   ├── shopware/            # Shopware 6 plugin (MVC) + version.json
│   ├── drupal/              # Drupal module (MVC) + version.json
│   └── odoo/                # Odoo module (Python, MVC) + version.json
├── install.sh               # One-time interactive install wizard (see "Install on your own server")
├── scripts/
│   ├── update.sh            # Applies a staged release tarball (with member checks)
│   └── build-module-zips.sh # Builds dist/licensemanagerpro-<platform>-<version>.zip + manifest.json (verify version parity)
├── modules.json             # Module versions manifest (repo root; direct GitHub release-asset URLs)
├── docker-compose.yml       # Backend (+ optional MySQL via --profile mysql)
├── CHANGELOG.md             # Release history (v2.0.0 – v2.3.3; v3.0.0 lives above)
└── README.md
```

---

## Architecture

Layers and patterns (v3.0.0), so a new developer can follow the structure:

- **Backend — thin routers, fat services.** Route handlers only parse/authorize and delegate; all business logic lives in `services/` (one service per domain: licenses, api_keys, users, products, webhooks, sms, …). Services depend on abstractions where it matters: `require_actor` (in `utils/module_auth.py`) is the single dual-auth dependency for module-facing routes — JWT path and API-key path converge there, and every route declares exactly which permission or module scope it needs (`jwt_perm` / `module_scope`). The license-validate route is the deliberate exception: public by design, with the blacklist, rate limit and locks enforced inside the service.
- **Repository-ish data access:** queries live in the service that owns the entity (SQLAlchemy 2.x style, parameterized only — no raw SQL string building anywhere; `escape_like()` for every LIKE pattern). `ensure_schema()` auto-migrates existing databases on startup.
- **Strategy for license security:** `services/license_security.py` resolves the effective config (global → per-product override) and `validate_license` applies the strict/lenient strategy; modes are data (a settings JSON document), not branches scattered through handlers.
- **Observer / event dispatch:** `notify()` fans out notifications; webhook dispatch signs (HMAC-SHA256, constant-time compare on the receiving side) and records a `WebhookDelivery` row per attempt. Nothing in a request handler knows about delivery mechanics. SMS goes through the provider abstraction in `services/sms.py` (real IPPanel client in `services/sms_ippanel.py`); notification sending is gated per event and per channel.
- **Factory for key generation:** per-product key generators (prefix/segments/length) build keys with `secrets`; API-key secrets are generated with `secrets.token_urlsafe` and stored only as SHA-256 hashes.
- **Dependency injection:** FastAPI `Depends()` everywhere (DB session, current user, rate limiters, `require_actor`); services take a `Session` and never construct their own.
- **Frontend — presentational components + hooks/utils.** Pages own layout and data fetching; shared behavior lives in `components/` (ChipSelect, ToggleSwitch, Wizard, Modal) and `utils/` (api, auth, format, theme). State that must persist per user (theme, dashboard layout) goes through `PUT /users/me/preferences` with a localStorage fallback so demo mode works identically. No class components; no `var`; no `dangerouslySetInnerHTML` with user data anywhere. Zero scroll is structural: pages are flex columns that fill the content region, tall content scrolls inside its own block, and anything that does not fit is split (tabs, pagination, wizards, popups) — never squeezed.
- **Modules — one shared spec, native MVC per platform.** Every module implements the same contract (API-key auth, billing-cycle sync, optional HMAC signing, fail-closed on 401/403, TLS verified) in the platform's own MVC shape: Model = API client + data layer, Controller = admin/front handlers & hooks, View = templates. Shared behavior is specified once (see `backend/services/api_keys.py` for the signing algorithm and `modules.json` for versions); no module invents its own auth.
- **Clean-code rules enforced in review:** SOLID (single responsibility per file), DRY (shared helpers, no duplicated validation), no magic numbers/strings (constants in `config.py` / service modules), no dead code, no commented-out blocks, no TODOs in shipped code, full type hints on new Python, linted with ruff (`backend/pyproject.toml`; `ruff check` clean) and formatted with `ruff format` on all new files. The legacy backend was not reformatted wholesale (65 files predate the formatter) — new code follows the formatter; a full-repo format pass is a future cleanup, not a release blocker.
- **Versioning:** one version constant per side — `APP_VERSION` in `backend/config.py`, `version` in `frontend/package.json`, `modules.json` + every `modules/<platform>/version.json`, and the demo storage key `lmp-demo-db-v14` in `frontend/src/utils/demoData.js` (increment the suffix each release).

---

## Setup

### 1. Clone the repository

```bash
git clone https://github.com/rzatkv/LicenseManagerPro.git
cd LicenseManagerPro
```

### 2. Backend

```bash
cd backend
cp .env.example .env
# Edit .env: set a long random SECRET_KEY (required in production).
# DATABASE_URL defaults to SQLite (sqlite:///./license_manager.db) and
# works out of the box. For MySQL set e.g.:
#   DATABASE_URL=mysql+pymysql://user:password@localhost:3306/license_manager
python -m venv ../.venv
../.venv/bin/pip install -r requirements.txt
../.venv/bin/uvicorn main:app --reload
```

The API runs at **http://127.0.0.1:8000** — Swagger UI at
[http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs).

### 3. Frontend

```bash
cd ../frontend
npm install
npm start
```

The app runs at **http://localhost:3000**. To point it at a different
backend, create `frontend/.env` with:

```
REACT_APP_API_URL=http://127.0.0.1:8000/api
```

### 4. Docker (alternative)

```bash
# SQLite backend only:
docker compose up --build
# With MySQL instead of SQLite (set DATABASE_URL/SECRET_KEY in .env first):
docker compose --profile mysql up --build
```

---

## First Admin Account

There is deliberately **no default password**. On first startup the server
logs a message telling you to create the first admin. With no users in the
database, registration is open (no token needed) and always creates an admin:

```bash
curl -X POST http://127.0.0.1:8000/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email": "admin@example.com", "password": "choose-a-strong-password"}'
```

Afterwards registration requires an admin JWT. Log in to get a token:

```bash
curl -X POST http://127.0.0.1:8000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email": "admin@example.com", "password": "choose-a-strong-password"}'
# => {"access_token": "...", "token_type": "bearer"}
```

Send the token as `Authorization: Bearer <token>` on protected routes.

---

## API Endpoints

All routes live under `/api`. Protected routes require a JWT Bearer token,
except where noted.

### Authentication
- **POST** `/api/auth/login` — Authenticate and return a JWT access token.
- **POST** `/api/auth/register` — Create a user. Open only when no users exist yet (first-admin bootstrap, always admin); afterwards requires an admin token.

### API Key Management
- **GET** `/api/api-keys?skip=&limit=&search=` — List API keys (paginated).
- **POST** `/api/api-keys` — Create an API key (a random key is generated when `key` is omitted).
- **GET** `/api/api-keys/{id}` — Get one API key.
- **PUT** `/api/api-keys/{id}` — Update an API key.
- **DELETE** `/api/api-keys/{id}` — Delete an API key.
- **GET** `/api/api-keys/check-access` — Validate a key (public; send the key in the `api-key` header, optional `domain`/`directory` query params). Enforces expiry, single-use consumption, IP/domain/directory restrictions, and the daily request limit.

### License Management
- **GET** `/api/licenses?filter=&status=&search=` — List licenses. `filter` is `all` (default), `active`, `inactive`, `daily`, `weekly`, or `monthly`.
- **POST** `/api/licenses` — Create a license (a key is generated when omitted).
- **GET** `/api/licenses/{id}` — Get one license.
- **PUT** `/api/licenses/{id}` — Update a license (product, billing cycle, owner, status, expiry, max activations, locks, notes).
- **DELETE** `/api/licenses/{id}` — Delete a license.
- **POST** `/api/licenses/{id}/renew` — Extend expiry (`{"extend_days": 30}`).
- **POST** `/api/licenses/{id}/reissue` — Issue a new key (the old one stops working; blocked when the product's max-reissues limit is reached).
- **GET** `/api/licenses/{id}/activations` — List activation instances.
- **POST** `/api/licenses/{id}/activations` — Register an activation (`{"fingerprint": "...", "label": "..."}`; same fingerprint returns the existing record).
- **DELETE** `/api/licenses/{id}/activations/{activation_id}` — Remove one activation (frees a slot).
- **POST** `/api/licenses/validate` — **Public: no API key, no JWT.** Validate a license key (`{"key": "...", "domain": "...", "ip": "...", "install_path": "..."}`). The blacklist always applies; 60 checks/min per IP; domain/IP/install-path locks enforced (strict or lenient).

### Product Groups
- **GET** `/api/product-groups` — List groups (sorted by `sort_order`).
- **POST** `/api/product-groups` — Create a group (admin/manager).
- **PUT** `/api/product-groups/{id}` — Update a group.
- **DELETE** `/api/product-groups/{id}` — Delete a group (400 while products reference it).
- Products accept `group_id` on create/update, and `GET /api/products?group_id=` filters by group; `?slug=` looks a product up by exact slug (used by the WHMCS module and the WooCommerce plugin).

### Blacklist (admin only)
- **GET** `/api/blacklist?type=` — List entries.
- **POST** `/api/blacklist` — Add an entry (`{"type": "ip"|"domain", "value": "203.0.113.0/24", "reason": "..."}`).
- **DELETE** `/api/blacklist/{id}` — Remove an entry.
- Enforcement: license validate and API-key check-access reject a blacklisted IP (exact or CIDR) or domain (exact or subdomain) with reason `blocked: blacklisted`.

### SMS (admin only)
- **GET** `/api/sms/balance` — The active provider's credit balance (`{provider, configured, active, available, credit, unit, checked_at, cached}`; cached ~5 minutes; `not_configured` when no key is set).
- **POST** `/api/sms/test` — Really send a test SMS through the active provider (`{"to": "...", "message": "..."}`).

### Notifications
- **GET** `/api/notifications?skip=&limit=` — Unread first, then newest (`{notifications, total, unread}`).
- **POST** `/api/notifications/{id}/read` — Mark one read.
- **POST** `/api/notifications/read-all` — Mark all visible notifications read.

### Downloads
- **GET** `/api/downloads` — List the downloadable modules (`{id, name, version, description, updated_at}`).
- **GET** `/api/downloads/{module_id}` — Stream the module as a ZIP (404 for unknown id).
- **GET** `/api/downloads/versions` — Local versions plus the latest versions from the GitHub `modules.json` manifest.

### Users
- **GET** `/api/users/me` — The currently authenticated user.
- **GET** `/api/users` — List users (admin only).
- **POST** `/api/users` — Create a user with email, password and role (admin only).
- **PUT** `/api/users/{id}` — Update role / active flag (admin only).
- **DELETE** `/api/users/{id}` — Delete a user (admin only; not yourself, not the last admin).

### Dashboard
- **GET** `/api/dashboard/summary` — `{apiKeysCount, usersCount, activeLicenses, inactiveLicenses}` (admin only).
- **GET** `/api/dashboard/license-trend?days=14` — `{points: [{date, count}]}` of licenses created per day (admin only).

### System Settings
- **GET** `/api/settings` — All settings as a `{key: value}` object (secret-looking keys hidden from users without `settings:write`).
- **GET** `/api/settings/{key}` — One setting.
- **PUT** `/api/settings/{key}` — Update one **predefined** setting (`{"key": ..., "value": ...}`). Unknown keys are rejected (404) and system-managed keys with 400; settings can never be created or deleted through the API.

### System Updates
- **GET** `/api/system/info` — `{version, lastUpdated}` (admin only).
- **GET** `/api/system/check-updates` — `{updateAvailable, currentVersion, latestVersion}` (admin only). Compares the running version with the `latest_version` setting.
- **GET** `/api/system/update-check` — Live check against the GitHub releases API: `{current_version, latest_version, update_available, release_url, release_notes, published_at, error}` (admin/manager). On GitHub API failure it returns `update_available: false` with an error note and never raises.
- **POST** `/api/system/update` — Download the latest release tarball into `./updates/` (verified as a gzip tarball), record it in the `latest_version` setting, and return `{staged, version, next_step}` (admin only). The actual apply is `scripts/update.sh` — it extracts the tarball over the install directory excluding `.env`, `*.db` and `updates/`, then restarts the `license-manager` systemd unit if one exists. The backend runs the script automatically only when `LMP_ALLOW_SELF_UPDATE=1`; otherwise run the printed command by hand:

```bash
bash scripts/update.sh
```

---

## Modules

Ten platform modules live in `modules/`, one per platform, each with `version.json` == the app version. They are downloadable from the admin panel (**Downloads** page), which links **directly to the GitHub release asset** for the installed app version (version parity) — or from the GitHub release itself. Each module's ZIP is built by `bash scripts/build-module-zips.sh` (into `dist/`, never committed). Versions are tracked in `modules.json` at the repo root.

**All modules connect with an API key only — never an admin email/password.** Create a module-scoped key in the panel (API Keys → module-key toggle, 30/90/180/365-day expiry), copy the secret once, paste it into the module settings with the backend URL, and optionally enable signed requests (HMAC) and an IP allowlist. See the in-app API Docs → "Module authentication" section. Each module's README documents its own install + mapping flow.

| Platform | Directory | What it does |
|---|---|---|
| WHMCS | `modules/whmcs/` | Server module: full lifecycle (Create/Suspend/Unsuspend/Terminate/Renew/ChangePackage), product picked from a live dropdown of the backend's products, Test connection |
| WooCommerce | `modules/woocommerce/` | Mints one license per mapped line item on order completion; My Account → Licenses tab |
| WordPress (no WooCommerce) | `modules/wordpress/` | License minting on demand, `[lmp_licenses]` shortcode, My Licenses page |
| Joomla | `modules/joomla/` | Component with MVC + admin config; license actions via the API |
| PrestaShop | `modules/prestashop/` | Mints a license when an order reaches a paid status |
| Magento | `modules/magento/` | Magento 2 module: mints on order paid, admin config |
| OpenCart | `modules/opencart/` | Extension: admin settings, minting on order completion |
| Shopware | `modules/shopware/` | Shopware 6 plugin: mints on order placed/paid |
| Drupal | `modules/drupal/` | Settings form + `/user/licenses` page |
| Odoo | `modules/odoo/` | License model, portal page, minting on sale order confirmation |

> **Note:** the PHP modules are not linted in this repo's CI (no PHP in the development VM) — they were reviewed by hand and balance-checked. The modules were NOT tested against live WHMCS/Joomla/PrestaShop/Magento/OpenCart/Shopware/Drupal/Odoo installs in this VM — test them against a real install before going live. Shared behavior (signing, cycle mapping, fail-closed on 401/403) is logic-tested where possible; see each module's README for its honest test status.

---

## Testing

Backend tests use pytest against a temporary SQLite database (no MySQL needed). **Run only one pytest process at a time** — the suite shares one `tests/test.db` file and concurrent runs collide on it. Full suite: **284 passed** (v3.0.0).

```bash
cd backend
../.venv/bin/python -m pytest tests/ -q
```

Frontend checks (all must pass before a release):

```bash
cd frontend
npm run check-i18n   # every key exists in en and fa (877 keys)
npm run check-demo   # the in-browser demo mock (search, roles, 2FA, license security, billing sync, API-key rotation, downloads)
npm run build        # normal build
REACT_APP_DEMO_MODE=true npm run build   # demo build; the bundle must contain the current lmp-demo-db-vN key
```

Live smoke test (35 checks, spins up the real backend on a temp DB): `python backend/smoke_test_300.py` — **35 passed**.

Lint (backend): `ruff check backend/` and `ruff format --check` on the new files — see `backend/pyproject.toml`. Module ZIPs: `bash scripts/build-module-zips.sh` (verifies `version.json` == app version in every ZIP). Install script: `bash -n install.sh` + `bash install.sh --dry-run`.

---

## Contributors
- **Reza Karimi** - [rzatkv](https://github.com/rzatkv)

---

## License

This project is licensed under the [MIT License](https://opensource.org/licenses/MIT).

---
<div dir="rtl" lang="fa">

<a id="فارسی"></a>
# لایسنس منیجر پرو

**لایسنس منیجر پرو** یک سیستم جامع برای مدیریت کلیدهای API، لایسنس‌ها و تنظیمات سیستم است. این ابزار به‌طور خاص برای تیم‌ها و سازمان‌ها طراحی شده و مدیریت دقیق و امن دسترسی به نرم‌افزار و مجوزهای کاربر را فراهم می‌کند. فرانت‌اند با **React.js** و بک‌اند با **FastAPI** ساخته شده است و کارایی و انعطاف‌پذیری بالایی دارد. بررسی لایسنس یک فراخوانی عمومی است (بدون کلید API و بدون JWT) و بلاک‌لیست و قفل‌های لایسنس همچنان اعمال می‌شوند؛ بقیهٔ کارها به JWT یا کلید ماژول نیاز دارند.

[English](#english) | [فارسی](#فارسی)

## نسخهٔ آزمایشی زنده

نسخهٔ فرانت‌اند را مستقیم در مرورگر امتحان کنید — بدون نصب، بدون بک‌اند:

**https://rzatkv.github.io/LicenseManagerPro/**

این نسخه در حالت آزمایشی اجرا می‌شود: همهٔ فراخوانی‌های API را یک موک داخل مرورگر پاسخ می‌دهد (`frontend/src/utils/demoData.js`)، پس می‌توانید با حساب آزمایشی از پیش پرشده (`demo@demo.com` / `demo1234`) وارد شوید، داشبورد را ببینید، لایسنس و کلید API بسازید/حذف کنید و کاربران را مدیریت کنید. داده‌های نمونه فقط در مرورگر خودتان (localStorage) ذخیره می‌شوند؛ هیچ‌چیز از دستگاه شما خارج نمی‌شود. فرانت‌اند به‌صورت PWA هم قابل نصب است (مانیفست + سرویس‌ورکر + آیکن‌ها) — با «Install app» در مرورگر آن را به صفحهٔ اصلی اضافه کنید. برای اجرای همین نسخهٔ آزمایشی به‌صورت محلی: `cd frontend && REACT_APP_DEMO_MODE=true npm run build` (یا `npm start` با `REACT_APP_DEMO_MODE=true`). استقرار با `.github/workflows/pages-demo.yml` خودکار است؛ تنظیم یک‌بارهٔ مخزن: Settings → Pages → Source: GitHub Actions.

---

## تازه‌های نسخهٔ ۳٫۰٫۰

نسخهٔ بزرگ: بدون اسکرول در همهٔ صفحات، بازسازی تنظیمات، پیامک واقعی (آی‌پنل)، کپچا، حالت تعمیرات، و عمومی‌شدن بررسی لایسنس — به‌علاوهٔ آخرین نکته‌های بررسی تلفنی نسخهٔ ۲٫۳٫۳ و نبود هیچ مبلغی در کل محصول (این یک سیستم مالی نیست):

- **منوی زبان در صفحهٔ ورود دیگر روی تیتر هیرو نمی‌افتد:** بررسی تلفنی نسخهٔ ۲٫۳٫۳ نشان داد منوی باز هنوز بخشی از متن تیتر هیرو را می‌پوشاند (اندازه‌گیری زنده: ۳٬۷۰۰ تا ۵٬۷۰۰ پیکسل‌مربع روی دو خط در ۳۶۰/۴۰۰ پیکسل، هر دو زبان) — خود کاشی از قبل تمیز بود. تا وقتی منو باز است، اسلایدها (+ نقطه‌ها) ۱۱۰ پیکسل داخل فضای خالی خود هیرو پایین می‌روند (هیرو در تلفن ۴۲۰ پیکسل ارتفاع دارد، محتوایش ~۱۸۰ پیکسل)، پس اولین خط تیتر زیر لبهٔ پایین منو شروع می‌شود. چیدمان صفحه بزرگ نمی‌شود و چیزی اسکرول یا بریده نمی‌شود؛ با بسته‌شدن منو اسلایدها فوراً بالا می‌روند. در ۳۶۰/۴۰۰ پیکسل، فارسی + انگلیسی، روشن + تیره، هم‌پوشانی ۰ پیکسل‌مربع تأیید شده است.
- **مبلغ از کل محصول حذف شده است:** نه ستون مبلغ در جدول محصولات، نه فیلد مبلغ در ویزارد یا فرم ویرایش محصول، نه در پنجرهٔ جزئیات محصول یا انتخاب محصول در ویزارد لایسنس، نه در داده‌های آزمایشی، و نه در متن رابط کاربری یا مستندات (فارسی + انگلیسی). بک‌اند فیلدهای مبلغ محصول و برآورد درآمد داشبورد را کاملاً حذف کرده است (API دیگر آن‌ها را برنمی‌گرداند)؛ پایگاه‌های دادهٔ پیش از ۳٫۰٫۰ دو ستون را در راه‌اندازی حذف می‌کنند. منوهای مدیریت ماژول‌ها (WHMCS، ووکامرس) فقط نام محصول + دوره‌های پرداخت را نشان می‌دهند.
- **بدون اسکرول در همه‌جا — اندازه‌گیری‌شده، نه ادعاشده:** داشبورد، مستندات API، درباره و همهٔ صفحات لیست در ۳۶۰ تا ۱۹۲۰ پیکسل، فارسی + انگلیسی، روشن + تیره، داخل ویوپورت جا می‌شوند — محتوا به تب و صفحه‌بندی تقسیم شده، هرگز فشرده نشده است. داشبورد تب‌دار است (نمای کلی، برجسته‌ها، روندها، وضعیت، ماهانه، فعالیت، کلیدهای API، کاربران، سرویس‌ها، ارسال) و اسکرول داشبورد نسخهٔ آزمایشی زنده با همین تب‌ها درست شده است. مستندات API با یک پیمایش Playwright تأیید شده است: ۴۷۶ ترکیب تب × زیرنما × عرض × زبان × تم، ۰ خطای اسکرول — صفحه یک ستون فلکس است که ناحیهٔ محتوا را پر می‌کند، نمونه‌های بلند داخل بلوک خودشان اسکرول می‌شوند، جدول اندپوینت‌ها بر اساس عرض و ارتفاع ویوپورت ۳/۶/۱۲ ردیف صفحه‌بندی می‌کند، و راهنمای احراز هویت ماژول و قفل‌ها به زیرنماهای جداگانه تقسیم شده‌اند.
- **زنگ اعلان‌ها در لپ‌تاپ درست شد:** منوی کشویی در انگلیسی ۱۲۴ پیکسل از لبهٔ راست بریده می‌شد (خاصیت `backdrop-filter` نوار بالایی آن را به بلوک مرجع پنل ثابت تبدیل کرده بود) — حالا به `document.body` منتقل شده است، پس محدودهٔ داخل ویوپورت در هر عرضی درست است. هاور منو دیگر زیرخط ندارد (بازخورد پس‌زمینه/لغزش می‌ماند).
- **تنظیمات بازسازی شد:** زبان‌ها در تنظیمات تب خودشان را دارند (دیگر ورودی جداگانه در منو نیست)؛ فرم «افزودن تنظیم»، دکمه‌های حذف تکی و اندپوینت DELETE تنظیمات حذف شده‌اند — تنظیمات از پیش تعریف‌شده‌اند و فقط با یک دکمهٔ ذخیره در پایین هر فرم و تأیید با توست به‌روز می‌شوند؛ نسخهٔ برنامه / نسخهٔ منتشرشده / آخرین به‌روزرسانی دیگر اصلاً در تنظیمات دیده نمی‌شوند (نسخه فقط در «درباره»، خوانده‌شده از کد، هست)؛ محدودیت درخواست روزانه به تب امنیت منتقل شد؛ هر برچسب یک رشتهٔ ترجمه‌شدهٔ درست است، هرگز یک کلید خام نیست. جدید: دامنهٔ پنل (نام میزبان اعتبارسنجی‌شده) در عمومی، حالت تعمیرات + پیام دلخواه (نگهبان سمت سرور، عبور مدیر؛ بازدیدکنندگان صفحهٔ تعمیرات را می‌بینند، مدیران از همان‌جا وارد می‌شوند)، و کپچا (مدل‌های سفارشی ریاضی/متن/معکوس + گوگل reCAPTCHA نسخهٔ ۲ و ۳، اعتبارسنجی سمت سرور، پیش‌فرض خاموش).
- **پیامک واقعی — آی‌پنل، واقعاً:** تب پیامک سه ارائه‌دهنده دارد (آی‌پنل، کاوه‌نگار، فراز) که دقیقاً یکی فعال است. آی‌پنل یک اتصال واقعی به Edge API رسمی است (`https://edge.ippanel.com/v1`، کلید API در هدر خام `Authorization`، `POST /api/send` برای ارسال وب‌سرویس + الگو، `GET /api/payment/credit/mine` برای موجودی) — کلید و شمارهٔ فرستنده فقط سمت سرور می‌مانند، هرگز به فرانت‌اند نمی‌رسند و هرگز لاگ نمی‌شوند. ورود دومرحله‌ای با پیامک و پیامک‌های اعلان هر رویداد واقعاً از همین مسیر ارسال می‌شوند؛ دکمهٔ «ارسال آزمایشی» واقعاً ارسال می‌کند. خطاها صادقانه نشان داده می‌شوند (لاگ + برگشت به‌عنوان خطا، هرگز یک «ارسال شد» جعلی). داشبورد یک ویجت زندهٔ موجودی آی‌پنل دارد (موجودی + واحد، زمان آخرین بررسی، دکمهٔ بررسی دوباره، کش ~۵ دقیقه‌ای، بارگذاری ناهمگام و بدون مسدودکردن صفحه؛ وقتی کلیدی تنظیم نشده «پیکربندی نشده» نشان می‌دهد؛ در حالت آزمایشی یک موجودی مشخصاً ساختگی). کاوه‌نگار/فراز مثل قبل می‌مانند (بررسی دسترسی به میزبان).
- **ایمیل، تلگرام، و اعلان هر رویداد:** تب ایمیل تنظیمات SMTP، قالب‌ها + امضا (که واقعاً در ارسال استفاده می‌شوند) و کلید هر رویداد را دارد؛ تب تلگرام توکن ربات (سمت سرور)، ارسال آزمایشی و کلید هر رویداد را دارد؛ ارسال پیامک و ایمیل را می‌توان برای هر رویداد جداگانه روشن/خاموش کرد. منوی «لاگ‌ها» جریان‌های هر کانال را دارد (همه / ایمیل / پیامک / تلگرام / دومرحله‌ای / سیستم) — بدون منوی جدید.
- **بررسی لایسنس عمومی شد:** `POST /api/licenses/validate` نه کلید API می‌خواهد نه JWT — هر سروری با یک فراخوانی می‌تواند لایسنس را بررسی کند. بلاک‌لیست همچنان اعمال می‌شود، محدودیت ۶۰ بررسی در دقیقه سر جایش است، و قفل‌های دامنه/IP/مسیر نصب همچنان اجرا می‌شوند (سخت‌گیرانه یا با اغماض، طبق تنظیمات امنیت لایسنس).
- **ورود دومرحله‌ای با ایمیل یا پیامک، نه فقط TOTP:** مرحلهٔ دومرحله‌ای ورود می‌تواند کد را با ایمیل یا پیامک هم بفرستد، علاوه بر اپ احراز هویت؛ کانال در تنظیمات → امنیت انتخاب می‌شود.
- **تقویم‌ها، کدگذاری، و بهداشت ورودی:** تاریخ‌ها می‌توانند در تقویم میلادی، جلالی یا هجری قمری نمایش داده شوند (تنظیمات → عمومی)؛ تنظیم کدگذاری سیستم (پیش‌فرض UTF-8، فهرست مجاز) هرگز به کدگذاری پایگاه داده دست نمی‌زند؛ کاراکترهای ۴ بایتی (ایموجی) به‌طور پیش‌فرض سمت سرور از ورودی‌ها حذف می‌شوند (قابل تغییر).
- **یادداشت محصول و لایسنس — واقعاً مشروط:** فیلد یادداشت روی محصولات و لایسنس‌ها، فقط وقتی کلید تب عمومی روشن است نشان داده می‌شود. وقتی خاموش است، فیلد همه‌جا پنهان می‌شود و API یادداشت را با خطای ۴۰۰ رد می‌کند — کلید در مدل، اسکیما و سرویس اعمال می‌شود، نه فقط در رابط کاربری.
- **پنجره‌های بازشو، نه فرم‌های درون‌صفحه‌ای — در همهٔ صفحات لیست:** افزودن کاربر، افزودن به بلاک‌لیست و افزودن زبان به‌صورت پنجرهٔ بازشوی متحرک از دکمهٔ نوار ابزار (اول) باز می‌شوند؛ بخش ماتریس دسترسی از کاربران حذف شد (نقش‌ها تنها جای سطوح دسترسی است). **لایسنس بالاخره ویرایش دارد:** دکمهٔ ویرایش روی هر ردیف (و در پنجرهٔ جزئیات) فرم ویرایش را در پنجرهٔ بازشوی متحرک باز می‌کند — محصول، دورهٔ پرداخت، مالک، وضعیت، انقضای جدید، حداکثر فعال‌سازی، قفل‌ها، یادداشت — با پشتیبانی `PUT /api/licenses/{id}`؛ خود کلید فقط خواندنی نشان داده می‌شود، هرگز قابل ویرایش نیست. ویرایش کلیدهای API در پنجرهٔ خودش می‌ماند و کلید هنوز فقط یک‌بار موقع ساخت نشان داده می‌شود.
- **لاگ‌های حسابرسی قابل حذف‌اند:** حذف هر ردیف + پاک‌کردن همه (فقط مدیر، با تأیید)، بک‌اند + موک آزمایشی.
- **مستندات API بازنویسی شد:** تب‌دار، بدون اسکرول، نمونه‌های کد در cURL، پایتون، جاوااسکریپت، PHP و Go برای API و برای اعتبارسنجی وب‌هوک HMAC؛ راهنماهای WHMCS/وردپرس حذف شدند (به‌جایش یک خط اشاره به دانلودها).
- **داشبورد:** ویجت وضعیت سرویس (ایمیل / پیامک / تلگرام / پایگاه داده / وب‌هوک / گیت‌هاب، با دکمهٔ بررسی دوباره و تایمر ۵ دقیقه‌ای، ناهمگام و بدون مسدودکردن)، نمودارهای ارسال هر کانال با دادهٔ واقعی، بازهٔ زمانی مستقل و ماندگار زیر هر نمودار، و پنجرهٔ چرخ‌دنده برای دیده‌شدن ویجت‌ها (ماندگار برای هر مدیر).
- **تم‌ها:** ده پیش‌تنظیم داخلی (پیش‌فرض، اقیانوس، جنگل، غروب، گرافیت، رز، فیروزه‌ای، کهربایی، لایم، یاقوتی) به‌علاوهٔ سازندهٔ تم سفارشی — و تم هر مدیر جداگانه برای همان مدیر ذخیره می‌شود (بک‌اند مرجع حقیقت است)، پس انتخاب یک مدیر هرگز با دیگری قاطی نمی‌شود.
- **انیمیشن‌ها:** پنجره‌ها و منوها با انیمیشن باز *و* بسته می‌شوند، زنگ می‌لرزد و نشانش می‌پرد، تب‌ها محو/لغزش دارند — همه بر پایهٔ transform/opacity، سریع (~۱۵۰ تا ۳۰۰ میلی‌ثانیه)، و زیر `prefers-reduced-motion` حذف می‌شوند.
- **بالابردن نسخه:** ۳٫۰٫۰ در همه‌جا، کلید ذخیرهٔ آزمایشی `lmp-demo-db-v14`، `smoke_test_300.py`، موکِ نسخهٔ بعدی ۳٫۰٫۱، هر ۱۰ فایل ZIP ماژول با هم‌ترازی ۳٫۰٫۰ بازسازی شد. نسخه‌های قدیمی در [CHANGELOG.md](CHANGELOG.md) هستند.

## ویژگی‌های کلیدی
- **مدیریت کلید API:** ساخت، فهرست، به‌روزرسانی و حذف کلیدهای API با حقوق دسترسی، انقضا، محدودیت IP/دامنه/دایرکتوری، کلید یک‌بارمصرف و محدودیت درخواست روزانه. کلیدهای ماژول (زمان‌دار، امضای HMAC اختیاری + فهرست مجاز IP) تنها راه اتصال ماژول‌ها هستند.
- **مدیریت لایسنس:** ساخت و فیلتر لایسنس‌ها (همه/فعال/غیرفعال، امروز/این هفته/این ماه)، مشاهدهٔ جزئیات، ویرایش در پنجرهٔ بازشو، تمدید، صدور دوباره، اعتبارسنجی (اندپوینت عمومی) و ردیابی فعال‌سازی‌ها. یادداشت روی محصولات و لایسنس‌ها (قابل خاموش‌کردن).
- **بررسی عمومی لایسنس:** `POST /api/licenses/validate` کلید نمی‌خواهد — بلاک‌لیست، محدودیت نرخ و قفل‌ها همچنان اعمال می‌شوند.
- **پیامک واقعی (آی‌پنل):** ارسال وب‌سرویس + الگو و موجودی زنده، همراه کاوه‌نگار/فراز؛ ورود دومرحله‌ای با پیامک و اعلان پیامکی هر رویداد.
- **مدیریت کاربر:** CRUD کاربران فقط برای مدیر با نقش‌ها (مدیر/مدیر میانی/پشتیبان/بیننده + نقش‌های سفارشی)؛ هیچ‌کس نمی‌تواند حساب خودش یا آخرین مدیر را حذف کند.
- **نقش‌ها:** CRUD کامل نقش‌های سفارشی با فهرست دسترسی؛ نقش‌های داخلی محافظت‌شده‌اند.
- **تنظیمات سیستم:** فقط تنظیمات از پیش تعریف‌شده (تب‌های عمومی، زبان، زبان‌ها، تم، امنیت، پیامک، ایمیل، تلگرام) — یک دکمهٔ ذخیره در هر فرم، تأیید با توست، بدون حذف.
- **کپچا:** مدل‌های سفارشی + گوگل reCAPTCHA نسخهٔ ۲ و ۳، اعتبارسنجی سمت سرور، پیش‌فرض خاموش.
- **حالت تعمیرات:** نگهبان سمت سرور با پیام دلخواه و عبور مدیر.
- **اعلان‌ها:** زنگ + صفحهٔ اعلان‌ها؛ تحویل هر کانال (ایمیل/پیامک/تلگرام) و لاگ‌های هر کانال.
- **بررسی به‌روزرسانی:** مقایسهٔ نسخهٔ در حال اجرا با آخرین نسخهٔ پیکربندی‌شده و ثبت به‌روزرسانی اعمال‌شده.
- **امنیت بالا:** احراز هویت JWT (توکن Bearer)، هش رمز عبور bcrypt، ورود دومرحله‌ای TOTP (+ کد ایمیل/پیامک) و مسیرهای محافظت‌شده. امنیت بالاترین اولویت است: هر انتشار با یک مجموعهٔ تست خصمانه بررسی می‌شود که باید بسته (fail closed) بماند.
- **رابط کاربری مدرن:** واکنش‌گرا، بدون اسکرول، تب‌دار و پنجره‌ای با داشبورد گرافیکی؛ ده پیش‌تنظیم تم + سازندهٔ تم سفارشی، ذخیره‌شده جداگانه برای هر مدیر؛ رابط کامل فارسی/انگلیسی با راست‌به‌چپ.

## راه‌اندازی (خلاصه)

```bash
git clone https://github.com/rzatkv/LicenseManagerPro.git
cd LicenseManagerPro
cd backend && cp .env.example .env   # یک SECRET_KEY طولانی و تصادفی بگذارید
python -m venv ../.venv && ../.venv/bin/pip install -r requirements.txt
../.venv/bin/uvicorn main:app --reload   # API روی http://127.0.0.1:8000
cd ../frontend && npm install && npm start   # برنامه روی http://localhost:3000
```

اولین حساب مدیر: رمز پیش‌فرضی وجود ندارد. وقتی پایگاه داده خالی است، ثبت‌نام باز است و همیشه مدیر می‌سازد؛ بعد از آن ثبت‌نام به توکن JWT مدیر نیاز دارد. جزئیات کامل در بخش انگلیسی بالا (Setup / First Admin Account) آمده است.

## ماژول‌ها

ده ماژول برای WHMCS، ووکامرس، وردپرس، جوملا، پرستاشاپ، مجنتو، اپن‌کارت، شاپ‌ور، دروپال و اودو — هر کدام با `version.json` برابر نسخهٔ برنامه — از صفحهٔ **دانلودها** در پنل مدیریت قابل دریافت‌اند (پیوند مستقیم به فایل ضمیمهٔ انتشار گیت‌هاب برای همان نسخه). همهٔ ماژول‌ها فقط با کلید API متصل می‌شوند — هرگز با ایمیل/رمز عبور مدیر.

## آزمایش‌ها

- بک‌اند: `cd backend && ../.venv/bin/python -m pytest tests/ -q` — **۲۸۴ تست، همه قبول**.
- فرانت‌اند: `npm run check-i18n` (۸۷۷ کلید) و `npm run check-demo` (۸۵ بررسی) — همه قبول.
- تست دود زنده: `python backend/smoke_test_300.py` — **۳۵ بررسی، همه قبول**.

## مشارکت‌کنندگان
- **رضا کریمی** - [rzatkv](https://github.com/rzatkv)

## مجوز

این پروژه تحت [مجوز MIT](https://opensource.org/licenses/MIT) منتشر شده است.

</div>
