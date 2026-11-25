# License Manager Pro

**License Manager Pro** is a comprehensive system for managing API keys, licenses, and system settings. Specifically designed for teams and organizations, this tool provides precise and secure management of software access and user permissions. Built with **React.js** on the frontend and **FastAPI** on the backend, it offers high performance and flexibility.

## Live demo

Try the frontend right in your browser — no install, no backend needed:

**https://rzatkv.github.io/LicenseManagerPro/**

It runs in demo mode: every API call is answered by an in-browser mock (`frontend/src/utils/demoData.js`), so you can log in with the prefilled demo account (`demo@demo.com` / `demo1234`), browse the dashboard, create/delete licenses and API keys, and manage users. The sample data is stored only in your own browser (localStorage); nothing leaves your machine. The frontend is also installable as a PWA (manifest + service worker + app icons) — use "Install app" in your browser to add it to your home screen. To run the same demo locally: `cd frontend && REACT_APP_DEMO_MODE=true npm run build` (or `npm start` with `REACT_APP_DEMO_MODE=true`). Deployment is automated by `.github/workflows/pages-demo.yml`; one-time repo setup: Settings → Pages → Source: GitHub Actions.

---

## What's new in v2.0.0

- **Products & billing cycles:** products with monthly / quarterly / semiannual / annual / biennial / lifetime cycles; license expiry is computed automatically from the product's cycle. Licenses can still be created without a product (the old flow).
- **CRM shell:** sidebar + topbar layout (Dashboard, Products, Licenses, API Keys, Users, Languages, API Docs, Settings, About) with a mobile hamburger menu, theme toggle and language switcher in the topbar. Navigation hides Users and Languages for roles that cannot use them.
- **Bilingual + language management:** full English / Persian UI (RTL for Persian) with a Language Management page — built-in en/fa are read-only, custom languages can be added (cloned from English), edited key by key (grouped by section, with search) and deleted. Missing keys fall back to English.
- **Dark / light / auto theme:** CSS-variable theming across every page; Auto follows the OS setting.
- **Roles & permissions:** admin / manager / support / viewer, enforced on write endpoints (403 otherwise), with a permission matrix on the Users page.
- **License locking:** allowed domains, allowed IPs and install path per license; validate checks the locks and reports a reason on mismatch.
- **Webhooks:** per-product webhook URL, events and secret; test-webhook button, recent-deliveries list, HMAC signature verification docs, and a daily `POST /api/system/check-expiring?days=7` cron endpoint.
- **In-app API docs:** authentication (JWT + the `api-key` header check-access endpoint), endpoint reference, cURL examples, and WHMCS / WordPress-WooCommerce PHP templates.
- **Dashboard v2:** license-by-status donut, licenses-per-month and licenses-by-product bar charts (hand-rolled SVG, no new dependencies) plus an auto-rotating highlights slider.

### Existing-database auto-migration on startup

On startup the backend creates any missing tables/columns for v2.0 automatically (products, webhook deliveries, languages, and the new license fields), so an existing v1.x database keeps working — no manual migration step is needed. Back up your database before upgrading anyway, as with any release.

## Key Features
- **API Key Management:** Create, list, update and delete API keys with access rights, expiry, IP/domain/directory restrictions, single-use keys, and a daily request limit.
- **License Management:** Create and filter licenses (all/active/inactive, created today/this week/this month), view details, renew, and validate license keys.
- **User Management:** Admin-only user CRUD with roles (admin/user); nobody can delete their own account or the last admin.
- **System Settings:** Dynamically update system configurations.
- **Update Check:** Compare the running version against a configured latest version and record an applied update.
- **High Security:** JWT authentication (Bearer tokens), bcrypt password hashing, and protected API routes.
- **Modern UI:** Responsive and user-friendly interface with a graphical dashboard.

---

## Project Layout

```
LicenseManagerPro/
├── backend/                 # FastAPI backend
│   ├── main.py              # App entrypoint, routers mounted under /api
│   ├── config.py            # Environment-based configuration
│   ├── database.py          # SQLAlchemy 2.x engine/session
│   ├── models.py            # User, ApiKey, ApiUsageLog, License, SystemSetting
│   ├── schemas.py           # Pydantic v2 schemas
│   ├── requirements.txt
│   ├── Dockerfile
│   ├── .env.example
│   ├── routers/             # auth, api_keys, licenses, users, dashboard, settings, system
│   ├── services/            # api_keys, licenses, users, settings
│   ├── utils/               # auth (JWT + hashing), email (SMTP, optional)
│   └── tests/               # pytest suite (temporary SQLite DB)
├── frontend/                # React 18 frontend (react-scripts)
│   ├── package.json
│   ├── public/index.html
│   └── src/
│       ├── App.js           # Routes + ProtectedRoute
│       ├── config.js        # API_BASE_URL (REACT_APP_API_URL or http://127.0.0.1:8000/api)
│       ├── index.js         # React 18 createRoot entrypoint
│       ├── pages/           # Login, Dashboard, Products, Settings, LicenseList, APIKeyList, UserManagement, Languages, ApiDocs, About
│       ├── components/      # Layout (sidebar + topbar CRM shell)
│       ├── i18n/            # translations.js (en/fa) + LanguageContext
│       ├── theme.js         # ThemeContext (light/dark/auto)
│       ├── styles/
│       └── utils/           # api.js (get/post/put/del), auth.js, updateChecker.js
├── docker-compose.yml       # Backend (+ optional MySQL via --profile mysql)
└── README.md
```

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
- **PUT** `/api/licenses/{id}` — Update a license.
- **DELETE** `/api/licenses/{id}` — Delete a license.
- **POST** `/api/licenses/{id}/renew` — Extend expiry (`{"extend_days": 30}`).
- **POST** `/api/licenses/validate` — Validate a license key (`{"key": "..."}`).

### Users
- **GET** `/api/users/me` — The currently authenticated user.
- **GET** `/api/users` — List users (admin only).
- **POST** `/api/users` — Create a user with email, password and role (admin only).
- **PUT** `/api/users/{id}` — Update role / active flag (admin only).
- **DELETE** `/api/users/{id}` — Delete a user (admin only; not yourself, not the last admin).

### Dashboard
- **GET** `/api/dashboard/summary` — `{apiKeysCount, usersCount, activeLicenses, inactiveLicenses}` (admin only).

### System Settings
- **GET** `/api/settings` — All settings as a `{key: value}` object.
- **GET** `/api/settings/{key}` — One setting.
- **PUT** `/api/settings/{key}` — Create or update a setting (`{"key": ..., "value": ...}`).

### System Updates
- **GET** `/api/system/info` — `{version, lastUpdated}` (admin only).
- **GET** `/api/system/check-updates` — `{updateAvailable, currentVersion, latestVersion}` (admin only). Compares the running version with the `latest_version` setting.
- **POST** `/api/system/update` — Record the pending version as applied (admin only).

> **Note:** the update mechanism is an honest stub — it records the new version in the settings but does not perform a real self-update (no `git pull` / rebuild). Deploying a new version is still a manual step.

---

## Testing

Backend tests use pytest against a temporary SQLite database (no MySQL needed):

```bash
cd backend
../.venv/bin/python -m pytest tests/ -q
```

---

## Contributors
- **Reza Karimi** - [rzatkv](https://github.com/rzatkv)

---

## License

This project is licensed under the [MIT License](https://opensource.org/licenses/MIT).
