# License Manager Pro

**License Manager Pro** is a comprehensive system for managing API keys, licenses, and system settings. Specifically designed for teams and organizations, this tool provides precise and secure management of software access and user permissions. Built with **React.js** on the frontend and **FastAPI** on the backend, it offers high performance and flexibility.

## Live demo

Try the frontend right in your browser — no install, no backend needed:

**https://rzatkv.github.io/LicenseManagerPro/**

It runs in demo mode: every API call is answered by an in-browser mock (`frontend/src/utils/demoData.js`), so you can log in with the prefilled demo account (`demo@demo.com` / `demo1234`), browse the dashboard, create/delete licenses and API keys, and manage users. The sample data is stored only in your own browser (localStorage); nothing leaves your machine. The frontend is also installable as a PWA (manifest + service worker + app icons) — use "Install app" in your browser to add it to your home screen. To run the same demo locally: `cd frontend && REACT_APP_DEMO_MODE=true npm run build` (or `npm start` with `REACT_APP_DEMO_MODE=true`). Deployment is automated by `.github/workflows/pages-demo.yml`; one-time repo setup: Settings → Pages → Source: GitHub Actions.

---

## What's new in v2.3.0

The biggest release yet — a redesign of the header, themes, roles, security and the module system, built on v2.2.2:

- **Two stubborn defects finally fixed (live-DOM measured, not guessed):** the RTL checkbox stacking was a `Wizard.css` rule (`.wizard-body input {width: 100%}`) stretching the checkbox to the full label width and squeezing the label text to 0px — and the tables were overflowing because a stale service-worker cache served old CSS. Both are gone by construction: checkbox groups are now **chip/pill multi-selects** (tappable rounded pills, gradient + ✓ when selected, `white-space: nowrap`, whole-unit wrapping — a label can never stack character by character), single booleans are styled toggle switches, and the frontend **unregisters any service worker on every load** so a stale bundle can never shadow a fix again.
- **Header redesign:** no page title in the topbar; **global search** (licenses by key/customer, products, users — keyboard navigable, ↑/↓/Enter/Esc); an **animated theme toggle** (light/dark/auto with a sun/moon cross-fade); a **profile menu** (avatar with photo-or-initials, Profile / Settings / Logout). The language selector moved into Settings.
- **Themes:** Gmail-style theme picker — presets Default (magenta/violet), Ocean, Forest, Sunset, Graphite, plus a **custom theme builder** (accent, accent 2, background, surface). Theme + mode persist per user (localStorage and the backend) and animate smoothly on change.
- **Customizable dashboard:** widgets resize (S/M/L), chart time-range switcher (7/14/30/90 days), drag-to-reorder; layout persists per user. New widgets: activations trend and webhook delivery success rate. The **Estimated MRR card is removed** — this is not a financial system.
- **Roles page:** full CRUD for custom roles (permission checklist, built-ins protected, cannot delete a role assigned to users); the Users page assigns roles from the role list; permission checks use the role's permission list server-side.
- **TOTP 2FA:** enable from the Profile page (QR code + manual key, verify a code to enable, backup codes hashed + single-use, disable with password + code); login asks for the TOTP step when 2FA is enabled. Demo mode accepts code `123456` with an honest note.
- **License security modes:** global settings + per-product overrides — strict/lenient validation, domain/IP/install-path/activation-limit toggles, missing-lock behavior — enforced in license validate and API-key check-access, with tests.
- **Profiles:** display name, avatar upload (raster PNG/JPEG/WebP only, ≤2 MB, magic-byte checked), role display, 2FA status, last login; header avatar shows the photo or initials.
- **About page redesigned:** version, what's-new, system info, update-check card, links, credits — polished in both languages and both themes.
- **Filters on every list:** Licenses, Products, API keys, Users, Audit logs, Notifications, Blacklist — search + status/type filters + sorting, in the split-not-squeeze style.
- **Stunning login:** animated gradient-mesh / floating-orbs background, glass card, rotating feature slides with smooth crossfades, staggered entrance — in both languages, both themes, phone + desktop. Animations everywhere are GPU-friendly (transform/opacity) and respect `prefers-reduced-motion`.
- **Billing-cycle sync:** license create/renew accept an explicit `billing_cycle`; expiry follows that cycle, and a cycle the product doesn't list is **added to the product server-side** (the sync). Unknown cycles are rejected with 422. WHMCS passes the service's cycle; WooCommerce passes the order's billing period.
- **Module auth — API key only:** WHMCS/WooCommerce connect with a scoped module key, never an admin email/password. Module keys are time-limited (30/90/180/365 days, default 90), support an optional IP allowlist and optional HMAC-signed requests (5-minute timestamp replay protection), rotate from the API Keys page (secret shown once), and are **stored hashed** (SHA-256) with a startup migration. Every module call is audit-logged; module keys can never call admin endpoints.
- **WHMCS product dropdown:** the module's per-product settings show a live dropdown of the backend's products (cached a few minutes, manual fallback if the API is unreachable) instead of typed IDs.
- **All 10 platform modules, in MVC:** WHMCS, WooCommerce, WordPress (no WooCommerce), Joomla, PrestaShop, Magento, OpenCart, Shopware, Drupal, Odoo — each with `version.json` == app version, a README, and a branded admin UI. Each gets its own ZIP in the GitHub release (`scripts/build-module-zips.sh`), and the Downloads page links **directly to the GitHub release asset** built from the installed app version (version parity).
- **One-time install script:** `install.sh` — `curl -fsSL https://raw.githubusercontent.com/rzatkv/LicenseManagerPro/main/install.sh | bash` — an interactive wizard (separate backend/frontend domains, MySQL 8, admin account, optional Let's Encrypt HTTPS) that does the whole install. See "Install on your own server" below.
- **Security audit (top priority):** API keys hashed, failed-login lockout (5 in 15 min → 15-min lock), login no longer reveals whether an email exists, TOTP replay protection + constant-time compares, LIKE-wildcard injection fixed on every search, privilege-escalation guards on user management, secret settings hidden from non-privileged users, webhook SSRF guard (private/loopback/link-local hosts blocked), avatar/logo raster-only validation, self-update tarball member checks, audit logs for failed logins / 2FA / key rotation / module calls / self-update. Adversarial tests in `backend/tests/test_security_adversarial.py` + `test_module_keys.py` — every attack in them must fail closed. `pip audit` findings fixed by upgrading PyJWT → 2.15.0, python-dotenv → 1.2.2, FastAPI → 0.165.0 (starlette 1.10.0); `npm audit` could not run in the build VM (registry policy blocks the audit endpoint) — run it before publishing if your network allows. Known limits are listed in the Security section of the release notes (see below).
- **Version bump process (for 2.3.1 → 2.3.10 / 3.0.0):** one version constant per side — `APP_VERSION` in `backend/config.py`, `version` in `frontend/package.json`, `modules.json` + every `modules/<platform>/version.json`, and the demo storage key `lmp-demo-db-v9` in `frontend/src/utils/demoData.js` (increment the suffix each release).

### Install on your own server

One command, one interactive wizard, one install:

```bash
curl -fsSL https://raw.githubusercontent.com/rzatkv/LicenseManagerPro/main/install.sh | bash
```

The wizard asks for, in order: backend domain and frontend domain **separately**, MySQL 8 host/port/database/user/password, the first admin email/password, and whether to enable HTTPS via Let's Encrypt (certbot) when domains are given. It then installs system deps (Python 3.11+, Node, Nginx, MySQL client), creates the backend venv + systemd service, builds the frontend, writes Nginx vhosts for both domains (backend as API reverse proxy, frontend as static site), generates `backend/.env` (random `SECRET_KEY`, mode 600, never printed), creates the database and runs migrations, and prints a final summary with the URLs + login.

- **Idempotent-safe:** re-run with `--repair` to refresh code/deps/build/vhosts/migrations — it never drops the database, never regenerates `backend/.env` secrets, never recreates the admin account. A fresh run refuses if the install marker already exists (use `--repair` instead).
- **MySQL only:** SQLite/PostgreSQL are refused, same rule as `deploy.sh`.
- **Dry run:** `bash install.sh --dry-run` prints every step (including the exact Nginx/systemd configs) and changes nothing; `--help` lists all options (every prompt also has a `--flag` form for unattended runs).
- A full run on a real server was not possible in the build VM (no public domains); everything testable here was tested (`bash -n`, `--dry-run` end to end).

### Security — what was checked, fixed, and what remains

Checked and fixed in v2.3.0 (tests in `test_security_adversarial.py` / `test_module_keys.py`): API-key plaintext storage → SHA-256 hashed + prefix display + migration; login user enumeration → dummy bcrypt verify + identical 401s + lockout; TOTP replay → last-code window; LIKE injection → `escape_like` on all 6 sites; user-management privilege escalation → admin-only delete + admin-equivalence guards; settings secret leak → secret-looking keys hidden; avatar/logo SVG → raster-only magic-byte validation; webhook SSRF → public-hosts-only guard; self-update tarball → member checks (no absolute/`..`/symlink/device entries); audit-log gaps → failed logins, 2FA, rotation, module calls, update staging.

Known limitations (honest): logout is client-side token deletion (stateless JWT, 60-min TTL — no server-side revocation list); the webhook SSRF guard checks DNS immediately before the request but cannot close the DNS-rebinding TOCTOU window; GitHub auto-generated release tarballs carry no published checksum, so the update check is gzip+tar validity over HTTPS from the releases API, not a hash comparison; module-key HMAC replay cache is per-process (in-memory); `npm audit` could not run in the build VM (see above).

## What's new in v2.2.1

UI polish round for v2.2.0, from a phone-browser visual check (886×1920) of the live demo:

- **Notification dropdown no longer clips off-screen:** the panel is now fixed-positioned and clamped inside the viewport in JS (right-aligned to the bell when there is room, otherwise pushed in from the edge); titles wrap instead of truncating.
- **Sidebar gains Notifications + Product Groups:** Notifications links to the `/notifications` page (previously reachable only via the bell); Product Groups is now a dedicated `/product-groups` route — the manager moved out of the Products page, which keeps only its group filter and group column.
- **Products table rows are compact again:** name/slug cells truncate with ellipsis, billing-cycle pills sit in one small horizontal wrap, and the five text action buttons are now 32px icon buttons (eye / edit / test webhook / view licenses / delete) with title tooltips and aria-labels — the actions cell fits without sideways scrolling.
- **Checkbox groups fixed for real in RTL:** the `<fieldset>` is gone (its UA `min-inline-size: min-content` and legend box kept long labels overflowing even with `min-width: 0`). Groups are now plain bordered divs, every label is a flex row with a shrinkable text span (`overflow-wrap: anywhere`), and `min-width: 0` runs through the whole chain (card → group → label). Applies to the product wizard, the API-key wizard and the inline edit forms.
- **Drawer brand row fits:** the gradient text moved from the brand container onto the name span itself (the container-level `background-clip: text` let the logo overlap the name), and the span is now a real flex item with `min-width: 0` — long site names ellipsize instead of overflowing the 248px sidebar.
- **Dashboard nits:** the 14-day trend chart's y-axis no longer shows a duplicated "1" (unique integer ticks only); Estimated MRR now reads "48.25 USD" instead of a bare number.
- **License wizard polish:** step 1 cannot advance without a product selected or a name typed (with an inline error message instead of a silently disabled Next); the customer step's fields have visible labels; the review step labels a name-only license "Expires in 365 days" instead of calling it a billing cycle.

## What's new in v2.2.2

Second polish round for v2.2.1, from a phone-browser visual check (886×1920) of the live demo — 4 of the 8 v2.2.1 fixes passed, 4 failed, plus new defects:

- **RTL checkbox groups fixed for real (severe v2.2.1 regression):** the v2.2.1 fix made it *worse* — a flex-wrap row with `min-width: 0` labels and `anywhere` wrapping let every label shrink to a one-character column, so each label rendered as a vertical single-character stack with ~450px rows. Checkbox groups are now a CSS grid with a real minimum column width (`repeat(auto-fill, minmax(170px, 1fr))`), and label text uses `break-word` (breaks only when a word alone overflows its line) — `anywhere` is gone from every label rule. Long tokens like `license.validated_failed` fit whole in a 170px cell.
- **Products table fits the viewport by splitting, not squeezing:** at 886px only the essential columns stay — name, price, status, actions. Slug, group, cycles, webhook and license count live in a beautiful animated details popup (the eye button opens it, with the full record plus the webhook-deliveries list); the same popup pattern carries the license detail view. Nothing is compressed: rows keep their comfortable height and the actions stay 32px icons. The Licenses table gets the same treatment: keys truncate with ellipsis (full key one tap away via the copy button) instead of wrapping over five lines, the ID / created columns hide under 1024px, and the four text action buttons are now 32px icon buttons.
- **Drawer brand title fully readable:** the v2.2.1 ellipsis only changed overlap into truncation ("License Ma…" / "…anager Pro"). The sidebar is now 280px and the brand name wraps onto two lines instead of truncating — the full name renders in both languages, and a long custom site name wraps gracefully too.
- **Notification dropdown is opaque:** the `glass-card` translucency is gone from the panel (solid surface background, no backdrop blur) so page content no longer bleeds through, and the header uses the theme text colour with the "Mark all read" button kept from shrinking it.
- **License wizard step 3 has visible labels:** the domains / IPs / install-path fields are now labelled field groups (not placeholder-only), and the hints wrap inside the card instead of being cut off at its edge.
- **"Manage groups" link no longer clipped:** `.btn-ghost` now carries its own padding, so links and labels styled as ghost buttons render like real buttons (they previously got no padding from the `button` base rule, so the text sat on the border edge).
- **Dashboard trend chart x-axis labels readable:** every third day only, at 11px instead of every other day at 9px, with more bottom padding — Persian date labels ("۴ آذر" etc.) are no longer tiny and cramped.
- **License wizard Review verified, unchanged:** with an Annual billing cycle selected the Review correctly shows "Billing Cycle: Annual"; the "Expires in 365 days" line only applies to standalone licenses without a product, and that case was verified working in code.

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
│   ├── config.py            # Environment-based configuration (APP_VERSION = single version constant)
│   ├── database.py          # SQLAlchemy 2.x engine/session, seed_roles/seed_settings, escape_like
│   ├── models.py            # User, ApiKey (hashed), License, SystemSetting, Product, ProductGroup, BlacklistEntry, Notification, LicenseActivation, AuditLog, Role, UserSetting
│   ├── schemas.py           # Pydantic v2 schemas
│   ├── requirements.txt
│   ├── pyproject.toml       # ruff config (B008 ignored: FastAPI Depends idiom)
│   ├── Dockerfile
│   ├── .env.example
│   ├── routers/             # auth (+2FA), api_keys (+rotate), licenses, users, dashboard, settings, system, products, product_groups, blacklist, notifications, downloads, roles, search, audit_logs, languages, webhooks
│   ├── services/            # api_keys (hashing/scopes/signing), licenses (validate + billing sync), users, settings, products, product_groups, blacklist, notifications, updates, downloads (direct GitHub URLs), webhooks (SSRF guard), license_security, roles, twofa, search
│   ├── utils/               # auth (JWT + hashing), permissions (role permission lists), rate_limit (login lockout + 2FA bucket), module_auth (require_actor: JWT or module key)
│   └── tests/               # pytest suite (temporary SQLite DB; run one at a time — shared test.db)
├── frontend/                # React 18 frontend (react-scripts)
│   ├── package.json         # version = single frontend version constant
│   ├── public/index.html    # SVG favicon (logo.svg) + CSP meta tag
│   └── src/
│       ├── App.js           # Routes + ProtectedRoute (/roles, /profile)
│       ├── config.js        # API_BASE_URL (REACT_APP_API_URL or http://127.0.0.1:8000/api)
│       ├── index.js         # React 18 createRoot entrypoint; unregisters any service worker on load
│       ├── theme.js         # ThemeProvider (mode light/dark/auto + preset + custom, per-user persist)
│       ├── pages/           # Login (animated hero + 2FA step), Dashboard (customizable widgets), Products, Settings (tabs: General/Language/Theme/License Security/Advanced), LicenseList, APIKeyList (rotate + show-once), UserManagement, Roles, Profile (2FA setup), Languages, ApiDocs, About, Blacklist, Downloads (direct GitHub links), Notifications, ProductGroups
│       ├── components/      # Layout (sidebar + topbar: GlobalSearch, ThemeToggle, ProfileMenu), Wizard, NotificationsBell, ChipSelect, ToggleSwitch, Modal, Toast, ConfirmModal
│       ├── i18n/            # translations.js (en/fa, 660+ keys) + LanguageContext
│       ├── styles/
│       └── utils/           # api.js (get/post/put/del), auth.js, demoData.js (in-browser mock, storage key lmp-demo-db-v9), format.js
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
└── README.md
```

---

## Architecture

Layers and patterns (v2.3.0), so a new developer can follow the structure:

- **Backend — thin routers, fat services.** Route handlers only parse/authorize and delegate; all business logic lives in `services/` (one service per domain: licenses, api_keys, users, products, webhooks, …). Services depend on abstractions where it matters: `require_actor` (in `utils/module_auth.py`) is the single dual-auth dependency for module-facing routes — JWT path and API-key path converge there, and every route declares exactly which permission or module scope it needs (`jwt_perm` / `module_scope`).
- **Repository-ish data access:** queries live in the service that owns the entity (SQLAlchemy 2.x style, parameterized only — no raw SQL string building anywhere; `escape_like()` for every LIKE pattern). `ensure_schema()` auto-migrates existing databases on startup.
- **Strategy for license security:** `services/license_security.py` resolves the effective config (global → per-product override) and `validate_license` applies the strict/lenient strategy; modes are data (a settings JSON document), not branches scattered through handlers.
- **Observer / event dispatch:** `notify()` fans out notifications; webhook dispatch signs (HMAC-SHA256, constant-time compare on the receiving side) and records a `WebhookDelivery` row per attempt. Nothing in a request handler knows about delivery mechanics.
- **Factory for key generation:** per-product key generators (prefix/segments/length) build keys with `secrets`; API-key secrets are generated with `secrets.token_urlsafe` and stored only as SHA-256 hashes.
- **Dependency injection:** FastAPI `Depends()` everywhere (DB session, current user, rate limiters, `require_actor`); services take a `Session` and never construct their own.
- **Frontend — presentational components + hooks/utils.** Pages own layout and data fetching; shared behavior lives in `components/` (ChipSelect, ToggleSwitch, Wizard, Modal) and `utils/` (api, auth, format, theme). State that must persist per user (theme, dashboard layout) goes through `PUT /users/me/preferences` with a localStorage fallback so demo mode works identically. No class components; no `var`; no `dangerouslySetInnerHTML` with user data anywhere.
- **Modules — one shared spec, native MVC per platform.** Every module implements the same contract (API-key auth, billing-cycle sync, optional HMAC signing, fail-closed on 401/403, TLS verified) in the platform's own MVC shape: Model = API client + data layer, Controller = admin/front handlers & hooks, View = templates. Shared behavior is specified once (see `backend/services/api_keys.py` for the signing algorithm and `modules.json` for versions); no module invents its own auth.
- **Clean-code rules enforced in review:** SOLID (single responsibility per file), DRY (shared helpers, no duplicated validation), no magic numbers/strings (constants in `config.py` / service modules), no dead code, no commented-out blocks, no TODOs in shipped code, full type hints on new Python, linted with ruff (`backend/pyproject.toml`; `ruff check` clean) and formatted with `ruff format` on all new files. The legacy backend was not reformatted wholesale (65 files predate the formatter) — new code follows the formatter; a full-repo format pass is a future cleanup, not a release blocker.
- **Versioning:** one version constant per side (see the v2.3.0 notes above); the demo storage key increments with the version so a new demo never reads a stale schema.


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

Backend tests use pytest against a temporary SQLite database (no MySQL needed). **Run only one pytest process at a time** — the suite shares one `tests/test.db` file and concurrent runs collide on it.

```bash
cd backend
../.venv/bin/python -m pytest tests/ -q
```

Frontend checks (all must pass before a release):

```bash
cd frontend
npm run check-i18n   # every key exists in en and fa
npm run check-demo   # the in-browser demo mock (search, roles, 2FA, license security, billing sync, API-key rotation, downloads)
npm run build        # normal build
REACT_APP_DEMO_MODE=true npm run build   # demo build; the bundle must contain the current lmp-demo-db-vN key
```

Lint (backend): `ruff check backend/` and `ruff format --check` on the new files — see `backend/pyproject.toml`. Module ZIPs: `bash scripts/build-module-zips.sh` (verifies `version.json` == app version in every ZIP). Install script: `bash -n install.sh` + `bash install.sh --dry-run`.

---

## Contributors
- **Reza Karimi** - [rzatkv](https://github.com/rzatkv)

---

## License

This project is licensed under the [MIT License](https://opensource.org/licenses/MIT).
