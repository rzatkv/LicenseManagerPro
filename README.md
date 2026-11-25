# License Manager Pro

**License Manager Pro** is a comprehensive system for managing API keys, licenses, and system settings. Specifically designed for teams and organizations, this tool provides precise and secure management of software access and user permissions. Built with **React.js** on the frontend and **FastAPI** on the backend, it offers high performance and flexibility.

## Live demo

Try the frontend right in your browser — no install, no backend needed:

**https://rzatkv.github.io/LicenseManagerPro/**

It runs in demo mode: every API call is answered by an in-browser mock (`frontend/src/utils/demoData.js`), so you can log in with the prefilled demo account (`demo@demo.com` / `demo1234`), browse the dashboard, create/delete licenses and API keys, and manage users. The sample data is stored only in your own browser (localStorage); nothing leaves your machine. The frontend is also installable as a PWA (manifest + service worker + app icons) — use "Install app" in your browser to add it to your home screen. To run the same demo locally: `cd frontend && REACT_APP_DEMO_MODE=true npm run build` (or `npm start` with `REACT_APP_DEMO_MODE=true`). Deployment is automated by `.github/workflows/pages-demo.yml`; one-time repo setup: Settings → Pages → Source: GitHub Actions.

---

## What's new in v2.2.0

- **Real WHMCS module + WooCommerce plugin (downloadable):** the Downloads page in the admin panel serves both as ZIPs built on the fly (`GET /api/downloads/{whmcs,woocommerce}`), with versions tracked in `modules.json` and an "update available" badge when GitHub has a newer one. The WHMCS server module (`modules/whmcs/`) implements the full lifecycle — CreateAccount (creates the license, stores the key in the service's password field), Suspend/Unsuspend, Terminate, Renew, ChangePackage, TestConnection and an admin Services tab — with `RequiresServer = false` and the API URL + admin credentials configured per product. The WooCommerce plugin (`modules/woocommerce/`) creates one license per mapped line item when an order completes, stores the key in order item meta, shows it in the order details / order email, and adds a My Account → Licenses tab with live status, expiry and per-installation deactivate. Both are built from a competitor study (WHMCS Software Licensing addon + marketplace modules, License Manager for WooCommerce / Gatemi / LicenseKit, Keygen.sh, Cryptlex, LemonSqueezy).
- **Product groups:** products can be grouped (`/api/product-groups`, CRUD, delete blocked while products reference the group); the Products page has a group filter + group column and a Groups manager (create/edit/delete with a colour picker).
- **Per-product key generators:** each product defines a key prefix, segment count and segment length (`CPN-XXXX-XXXX-XXXX`); license keys are generated from the product's format.
- **License reissue + activations:** `POST /api/licenses/{id}/reissue` issues a new key (the old one stops working, honouring the product's max-reissues limit) and licenses track activation instances (fingerprint records with activate/deactivate and a max-activations limit) — visible in the license detail panel and in the WooCommerce My Account tab.
- **IP/domain blacklist:** admin-only `/api/blacklist` (exact IP, CIDR ranges and exact-or-subdomain matching); a blacklisted IP or domain is rejected by license validate and by API-key check-access with reason `blocked: blacklisted`.
- **Notification center:** a bell in the topbar with an unread badge + dropdown, plus a Notifications page. Notifications fire on license created, license expiring/expired (from check-expiring), webhook delivery failed and new user created (`GET /api/notifications`, `POST /{id}/read`, `POST /read-all`).
- **Logo + branding:** a designed SVG logo (key glyph in the magenta → violet gradient) used in the login page, the sidebar and as the favicon. `site_name` and `logo_url` are settings — change them from Settings, including uploading a logo image (stored as a data URL) or resetting to the default.
- **Self-update (real):** `GET /api/system/update-check` compares the running version with the latest GitHub release live; `POST /api/system/update` downloads and verifies the release tarball into `./updates/` (staged, never overwriting live code) and `scripts/update.sh` applies it, excluding `.env`, `*.db` and `updates/` itself. The backend only runs the script automatically when `LMP_ALLOW_SELF_UPDATE=1`; otherwise the About → Updates card shows the one-command instruction. Module versions are checked against `modules.json` on GitHub (`GET /api/downloads/versions`).
- **Wizards:** creating a license, a product, a product group or an API key is now a guided multi-step flow (shared `Wizard` component with per-step validation and a review step; the generated API key is shown once, with a copy button). Edit forms stay inline.
- **App-like shell:** the whole app is `100dvh` — sidebar and topbar fixed, the page content is the only scroll region, long tables scroll inside their own card. The v2.1.1 visual re-check defects are all fixed in this release: the drawer overlay tap now closes the drawer (backdrop moved last in the DOM, z-index raised above the page, tap-on-content closes it, and the lingering `animation-fill-mode: both` transforms that created stray stacking contexts were removed); the Products checkbox groups no longer clip in RTL (`fieldset {min-width: 0}` + wrapping flex rows); table rows are short again (horizontal compact row-action groups); license keys break after hyphens only (`overflow-wrap: break-word` instead of `break-all`); the About version date is localized; the drawer title no longer runs under the × button.
- **Better dashboard charts:** a 14-day licenses-created area/line chart (dots + hover tooltips, localized day labels) from `GET /dashboard/license-trend`, an "Estimated MRR" stat (active licenses' prices normalized to monthly by billing cycle), value labels on bars, and full product names on the by-product chart (wrapped onto two lines instead of truncated).

## What's new in v2.1.1

- **RTL fix (the big one):** the layout shell is now fully logical — sidebar docks to the inline-start side (right in Persian, left in English), the mobile drawer breakpoint is 1024px so narrow portrait phones (~886px) get the drawer instead of a squeezed docked sidebar, and `overflow-x: hidden` on the page root stops a wide element from shifting the whole page sideways in RTL.
- **Sidebar drawer now closes properly:** the dimmed overlay closes on click (and is removed from the DOM when closed, so it can never block taps afterwards), Escape closes it, and there is a visible × button inside the drawer.
- **Dates are formatted:** no more raw ISO timestamps (`2026-11-25T08:37:36.534Z`) anywhere — every table shows locale dates (Persian calendar/digits for fa, e.g. `۴ آذر ۱۴۰۵`), and chart month labels follow the current language.
- **Mobile tables:** every data table lives in a horizontally scrollable container; long license/API keys wrap cleanly (`word-break: break-all`) with a copy button; "15 days" / "49 USD" cells never split across lines; search inputs go full width on narrow screens; webhook-event checkboxes are proper flex rows.
- **Dashboard stat cards** are a responsive grid that fills the available width instead of fixed 200px boxes.
- **Persian ZWNJ audit:** all 375 fa strings re-checked programmatically — plurals (`لایسنس‌ها`), verb prefixes (`می‌شود`) and compounds all use the correct half-space; the four strings named in the visual check were already correct in the dictionary.

## What's new in v2.1.0

- **Design refresh (the project design language):** glassmorphism surfaces with backdrop blur, the signature magenta → pink → violet gradient as the primary accent, 16–24px radii, pill chips/buttons, soft layered shadows — in both light and dark themes, and in RTL. Pure-CSS animations throughout: page fade/slide, staggered cards, button lift + glow, shimmer skeletons, animated charts, crossfading highlights slider, pulsing active-status dots, smooth theme transitions.
- **Complete translations:** 375 UI strings in English and Persian (was 259) — including the full ApiDocs prose, toasts, validation errors, confirm dialogs and empty states — with `npm run check-i18n` parity-checking every key. New shared components: Toasts, ConfirmModal, Skeleton, CopyButton, EmptyState, ErrorBoundary.
- **Production hardening:** paginated lists (`skip`/`limit`, `X-Total-Count` header), in-memory rate limiting on login/register (10/min) and license-validate/check-access (60/min, env-overridable), security-headers + request-ID/logging middleware, `GET /api/system/ready` readiness probe, and a full audit log (`GET /api/audit-logs`, admin/manager only) recording every create/update/delete and role change, with its own Audit Logs page in the sidebar.
- **Lists:** search/filter on Licenses, Products, API Keys, Users and Audit Logs, with server pagination (10 per page).

### Production checklist

Before running the API in production: (1) set a long random `SECRET_KEY` in `.env` (the app logs a warning at startup if the shipped default is still in use); (2) set `CORS_ORIGINS` explicitly to your frontend origin(s); (3) use MySQL (`DATABASE_URL=mysql+pymysql://...`) instead of SQLite; (4) run `POST /api/system/check-expiring?days=7` from cron daily so expiry webhooks fire; (5) back up the database regularly; (6) put the API behind HTTPS (e.g. Nginx as a reverse proxy); (7) tune the rate limits (`RATE_LIMIT_AUTH_PER_MINUTE`, `RATE_LIMIT_VALIDATE_PER_MINUTE`) for your traffic.

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
│   ├── models.py            # User, ApiKey, ApiUsageLog, License, SystemSetting, Product, ProductGroup, BlacklistEntry, Notification, LicenseActivation, AuditLog
│   ├── schemas.py           # Pydantic v2 schemas
│   ├── requirements.txt
│   ├── Dockerfile
│   ├── .env.example
│   ├── routers/             # auth, api_keys, licenses, users, dashboard, settings, system, products, product_groups, blacklist, notifications, downloads
│   ├── services/            # api_keys, licenses, users, settings, products, product_groups, blacklist, notifications, updates, downloads, webhooks
│   ├── utils/               # auth (JWT + hashing), email (SMTP, optional)
│   └── tests/               # pytest suite (temporary SQLite DB)
├── frontend/                # React 18 frontend (react-scripts)
│   ├── package.json
│   ├── public/index.html    # SVG favicon (logo.svg)
│   └── src/
│       ├── App.js           # Routes + ProtectedRoute
│       ├── config.js        # API_BASE_URL (REACT_APP_API_URL or http://127.0.0.1:8000/api)
│       ├── index.js         # React 18 createRoot entrypoint
│       ├── pages/           # Login, Dashboard, Products, Settings, LicenseList, APIKeyList, UserManagement, Languages, ApiDocs, About, Blacklist, Downloads, Notifications
│       ├── components/      # Layout (sidebar + topbar CRM shell), Wizard, NotificationsBell
│       ├── i18n/            # translations.js (en/fa) + LanguageContext
│       ├── theme.js         # ThemeContext (light/dark/auto)
│       ├── styles/
│       └── utils/           # api.js (get/post/put/del), auth.js, updateChecker.js
├── modules/                 # Downloadable integrations (see Modules)
│   ├── whmcs/               # WHMCS server module (PHP) + version.json
│   └── woocommerce/         # WordPress/WooCommerce plugin (PHP) + version.json
├── scripts/update.sh        # Applies a staged release tarball
├── modules.json             # Module versions manifest (repo root)
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
- **POST** `/api/licenses/{id}/reissue` — Issue a new key (the old one stops working; blocked when the product's max-reissues limit is reached).
- **GET** `/api/licenses/{id}/activations` — List activation instances.
- **POST** `/api/licenses/{id}/activations` — Register an activation (`{"fingerprint": "...", "label": "..."}`; same fingerprint returns the existing record).
- **DELETE** `/api/licenses/{id}/activations/{activation_id}` — Remove one activation (frees a slot).
- **POST** `/api/licenses/validate` — Validate a license key (`{"key": "..."}`).

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
- **GET** `/api/dashboard/summary` — `{apiKeysCount, usersCount, activeLicenses, inactiveLicenses, estimated_mrr}` (admin only). `estimated_mrr` sums active licenses' product prices normalized to monthly by billing cycle (monthly×1, quarterly÷3, semiannual÷6, annual÷12, biennial÷24, lifetime 0).
- **GET** `/api/dashboard/license-trend?days=14` — `{points: [{date, count}]}` of licenses created per day (admin only).

### System Settings
- **GET** `/api/settings` — All settings as a `{key: value}` object.
- **GET** `/api/settings/{key}` — One setting.
- **PUT** `/api/settings/{key}` — Create or update a setting (`{"key": ..., "value": ...}`).

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

The real WHMCS server module and WooCommerce plugin live in `modules/` and are downloadable from the admin panel (**Downloads** page) as ZIPs, or from the GitHub releases. Versions are tracked in `modules.json` at the repo root.

### WHMCS module (`modules/whmcs/`, version 1.0.0)

1. Copy the `modules/` folder from the ZIP into your WHMCS installation root, so the module lands at `modules/servers/licensemanagerpro/licensemanagerpro.php`.
2. In WHMCS, create or edit a product and select **LicenseManagerPro** as the module (Setup → Products/Services → Products/Services → Module Settings). No server entry is needed (`RequiresServer = false`).
3. Fill in the module settings: **API URL** (base URL of the License Manager Pro API, no trailing slash), **Admin email / Admin password** (an admin user — the module logs in to get a JWT), **Product slug** (the product in License Manager Pro), **Billing cycle** (one of the product's cycles).
4. Use **Test Connection** to verify the login. On order payment WHMCS creates the license and stores the key in the service's password field; suspension, unsuspension, termination, renewal and package changes map to the API; the admin Services tab shows key, status, expiry and activations.

### WooCommerce plugin (`modules/woocommerce/`, version 1.0.0)

1. In WordPress admin: **Plugins → Add New → Upload Plugin**, upload the ZIP and activate it (WooCommerce must already be active).
2. Go to **WooCommerce → License Manager Pro** and fill in the **API URL**, **Admin email / Admin password**, and the **product mapping** (each WooCommerce product → License Manager Pro product slug + billing cycle).
3. Click **Test connection**. When an order completes, one license is created per mapped line item (never before completion, never twice for the same item); the key is stored in order item meta and shown in the order details, the order email and **My Account → Licenses** (with live status, expiry, activations and a deactivate button per installation).

> **Note:** the PHP modules are not linted in this repo's CI (no PHP in the development VM) — they were reviewed by hand. Test them against a real WHMCS / WordPress install before going live.

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
