# License Manager Pro — WHMCS Module

Version 3.0.0 — for License Manager Pro 3.0.0.

Provisions License Manager Pro licenses from WHMCS: when a customer orders
(and pays for) a product that uses this module, WHMCS creates a license in
License Manager Pro and stores the license key in the service's password
field, so the key is visible in the WHMCS admin area and client area.

## Authentication — API key only

The module connects with **one module-scoped API key**. There is no login
call and no admin credential stored anywhere in WHMCS.

1. In the License Manager Pro panel, go to **API Keys** and create a key
   with the **module key** toggle on. A module key is scoped to
   `["module"]` and can only create/read/renew/revoke/validate licenses,
   read products, and read system info — it can never call an admin
   endpoint.
2. An expiry is required: **30 / 90 / 180 / 365 days** (default 90).
   Optionally set a per-key IP allowlist, and optionally require signed
   requests.
3. **Copy the secret once** — it is never shown again. Paste it into the
   product's module settings (**API key** field) together with the
   **API URL**.
4. If the key was created with "require signed requests", also tick
   **Sign requests (HMAC)** in the module settings. The module then
   sends `X-LMP-Timestamp` + `X-LMP-Signature` with every request
   (HMAC-SHA256, key = raw bytes of SHA256(secret), over
   `METHOD + "\n" + PATH + "\n" + TIMESTAMP + "\n" + SHA256(body)`).
   The server rejects timestamps older than 5 minutes and bad signatures
   with 401.
5. Click **Test Connection** on the product's Module Settings page: it
   calls `GET /system/info` with the key and reports the License Manager
   Pro version on success, or a clear error (wrong/expired/revoked key,
   missing scope, unreachable backend) on failure.

**Fail closed:** a 401/403 from the backend means no license is minted,
changed, or reported as licensed — the error is shown/logged and the
service is not marked as licensed.

**Rotation:** before a key expires, create a new module key in the panel,
paste it into the module settings, and delete the old key. The old key
stops working the moment it is deleted (or expires) — rotate before the
expiry date, not after.

## Setup — pick the product from a dropdown

1. Download the module from the License Manager Pro admin panel
   (**Downloads** page) or from the GitHub releases.
2. Unzip it and copy the `modules/` folder into your WHMCS installation
   root, so this file ends up at
   `modules/servers/licensemanagerpro/licensemanagerpro.php`.
3. In WHMCS, create or edit a product and select **LicenseManagerPro** as
   the module (Setup → Products/Services → Products/Services → Module
   Settings). No server entry is needed — the API URL and API key are
   configured per product.
4. Fill in the module settings:
   - **API URL** — base URL of your License Manager Pro API, e.g.
     `https://license.example.com/api` (no trailing slash).
   - **API key** — the module-scoped key from the panel (see above).
   - **Sign requests (HMAC)** — only when the key requires it.
   - **LicenseManagerPro Product** — pick the product from the dropdown.
     The list is loaded live from the License Manager Pro API
     (`GET /products`, with the stored key, server-side — the key is
     never exposed to the browser) and cached for 5 minutes, so every
     admin page load does not hammer the API. No manual IDs or slugs.
   - **Billing cycle** — fallback cycle (see below).
5. Use **Test Connection** on the product's Module Settings page to verify
   the key and see the License Manager Pro version.

If the product list cannot be loaded (API unreachable, key rejected),
the settings page shows the error inline instead of breaking: a product
slug already saved for this WHMCS product is kept as the only option,
and the field stays a plain text input, so you can type the product slug
manually, fix the API URL / key, save, and reopen the page.

## What it does

| WHMCS event | License Manager Pro action |
|---|---|
| Order paid / service created (`CreateAccount`) | Creates a license for the picked product + billing cycle |
| Invoice overdue (`SuspendAccount`) | Sets the license to `inactive` |
| Overdue invoice paid (`UnsuspendAccount`) | Sets the license back to `active` |
| Service cancelled (`TerminateAccount`) | Deletes (revokes) the license |
| Invoice paid for a renewal (`Renew`) | Renews the license by its billing cycle |
| Package change (`ChangePackage`) | Moves the license to the new product / cycle |
| Admin → Services tab | Shows key, status, expiry, activations |

## Billing-cycle sync

The module sends the service's own WHMCS billing cycle to License
Manager Pro, and the backend adds a missing cycle to the product
automatically (sync) — the license expiry then follows that cycle.
The configured **Billing cycle** option is only the fallback, used
when the service's cycle has no equivalent.

| WHMCS billing cycle | License Manager Pro cycle |
|---|---|
| Monthly | `monthly` |
| Quarterly | `quarterly` |
| Semi-Annually | `semiannual` |
| Annually | `annual` |
| Biennially | `biennial` |
| Triennially | `biennial` (no triennial cycle exists in License Manager Pro — the longest non-lifetime cycle is used) |
| One Time | `lifetime` |
| Free Account, (empty) | — no equivalent → fallback option is used |

Resolution order (in `CreateAccount`, `Renew` and `ChangePackage`):
mapped service cycle first, then the product's configured **Billing
cycle** option. Renewal passes the resolved cycle as
`?billing_cycle=...` on `POST /api/licenses/{id}/renew`, so the license
switches to that cycle and its expiry is extended by it. The admin
Services tab shows the resolved cycle as **WHMCS Billing Cycle**, so
you can see which cycle will be used for the service. Unknown cycles
are rejected by the backend with HTTP 422.

## How the license key is stored

The key is written into the service's **password** field (via the WHMCS
local API `UpdateClientProduct`), so it shows in the admin service view
and, if your product uses it, in the client area. The admin Services tab
also shows the license status, expiry and activation count.

## Layout (MVC)

WHMCS has no native MVC, so the module is structured into layers:

| Layer | Files | Responsibility |
|---|---|---|
| Model | `lib/ApiClient.php` | HTTP only: `X-API-Key`, optional HMAC signing, TLS verified, fail-closed 401/403 |
| Model | `lib/ProductRepository.php` | Product lookups + 5-minute cached list for the dropdown |
| Model | `lib/LicenseService.php` | License create / suspend / renew / revoke / move |
| Model | `lib/BillingCycle.php` | WHMCS cycle → License Manager Pro cycle |
| View | `lib/AdminTabView.php` | Branded admin services-tab card (inline CSS/SVG only) |
| Controller | `licensemanagerpro.php` | WHMCS entry points: lifecycle handlers, `ConfigOptions`, product Loader, `TestConnection` |

No business logic lives in the View, and no raw HTTP call lives in the
Controller.

## Requirements

- WHMCS 8.x (server module API v1.1; Loader functions need WHMCS 8.0+).
- PHP with the cURL extension.
- A reachable License Manager Pro 3.0.0 instance and a module-scoped
  API key (see Authentication above).

## Files

- `modules/servers/licensemanagerpro/licensemanagerpro.php` — the module (Controller).
- `modules/servers/licensemanagerpro/lib/ApiClient.php` — the API client (Model).
- `modules/servers/licensemanagerpro/lib/ProductRepository.php` — product lookups + dropdown cache (Model).
- `modules/servers/licensemanagerpro/lib/LicenseService.php` — license operations (Model).
- `modules/servers/licensemanagerpro/lib/BillingCycle.php` — billing-cycle mapping (Model).
- `modules/servers/licensemanagerpro/lib/AdminTabView.php` — admin services-tab card (View).

## Updates

New versions of this module are published with License Manager Pro
releases. The admin panel's **Downloads** page shows when a newer module
version is available.
