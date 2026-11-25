# License Manager Pro — Drupal Module

Version 2.3.1 — for License Manager Pro 2.3.1.

Provisions License Manager Pro licenses from Drupal 10/11: administrators
mint licenses for users from the admin area, and logged-in users see the
licenses owned by their account email at `/user/licenses`. The module
authenticates with **one scoped module API key only** — it never asks for,
stores, or sends an admin email or password.

## Requirements

- Drupal 10 or 11.
- PHP 8.1+.
- A reachable License Manager Pro 2.3.1 instance.
- No Commerce dependency and no other contributed modules.

## Install

1. Download the module ZIP from the License Manager Pro admin panel
   (**Downloads** page) or from the GitHub release for v2.3.1.
2. Unzip it so the folder lands at
   `web/modules/contrib/licensemanagerpro/` (Composer-based sites) or
   `modules/licensemanagerpro/` (classic layout), with
   `licensemanagerpro.info.yml` directly inside it.
3. Enable it: `drush en licensemanagerpro` or
   Extend → check **License Manager Pro** → Install.
4. Open **Configuration → Web services → License Manager Pro**
   (`/admin/config/services/licensemanagerpro`) and fill in the settings
   below, then use **Test connection**.

## API-key setup

1. In the License Manager Pro panel, go to **API Keys → Create key**.
2. Choose the **module** scope (licenses create/read/renew/revoke/
   validate, products read, system read — nothing else).
3. Set an expiry: 30, 90 (default), 180 or 365 days. Module keys
   **must** expire. Note the date and rotate the key before it lapses.
4. Optionally restrict the key to this server's IP and turn on
   **Require signed requests** (see below).
5. Copy the key **once** — it is shown only at creation and never
   stored in readable form. Paste it into the module's **Module API
   key** field. Leaving the field blank on later saves keeps the
   stored key.

If the key is wrong, expired, or lacks the module scope, every call
fails closed with HTTP 401/403: no license is minted or changed, and
the error is logged (Reports → Recent log messages) and shown on the
page. Fix the key — there is no fallback login.

## Settings

| Setting | What it does |
|---|---|
| API base URL | Backend API URL including `/api`, e.g. `https://license.example.com/api`. Use `https://` in production. |
| Module API key | The module-scoped key from above (paste once, blank keeps saved). |
| Sign requests with HMAC | Adds `X-LMP-Timestamp` + `X-LMP-Signature` to every call. Enable only if the key requires signed requests. |
| Default billing cycle | Cycle sent when minting without an explicit cycle. |
| Product mapping | One row per content type: pick the License Manager Pro product used when minting a license for that type. The dropdown is loaded live from `GET /products`; if the backend is unreachable it falls back to a manual slug text field. |

**Test connection** calls `GET /system/info` with the typed values
(without saving) and reports success with the backend version, or the
exact failure. The same check is available as JSON at
`/admin/config/services/licensemanagerpro/test-connection`
(admin permission required).

## Product mapping

Map each Drupal content type to a License Manager Pro product slug in
the settings (dropdown from the live product list, manual slug field
when the API is unreachable). The mapping is stored in
`licensemanagerpro.settings` → `product_mapping` as
`node_type => slug` and is read by the mint flow and by any custom
code that mints for a node type:

```php
$slug = \Drupal::service('licensemanagerpro.config')
  ->getProductSlugForNodeType('my_product_page');
```

## Billing-cycle sync

License Manager Pro cycles are `monthly`, `quarterly`, `semiannual`,
`annual`, `biennial`, `lifetime`. Drupal has no native recurring
billing cycle, so the module never invents one: minting sends the
cycle the administrator chose (mint form, or the settings default,
`annual`), and renewing sends the cycle chosen in the renew call.
The backend creates the license with that cycle and adds a missing
cycle to the product automatically. A cycle value that is not one of
the six is rejected by the module before any request is sent, so an
unknown cycle can never reach the backend.

| Source value | License Manager Pro cycle |
|---|---|
| monthly / month | `monthly` |
| quarterly / quarter | `quarterly` |
| semiannual / semi-annually / half-yearly | `semiannual` |
| annual / annually / yearly / year | `annual` |
| biennial / biennially | `biennial` |
| lifetime / one-time / once | `lifetime` |
| anything else | — omitted / rejected, never guessed |

## Signed requests

When the toggle is on (and the key requires it), every request sends:

- `X-API-Key: <secret>`
- `X-LMP-Timestamp: <unix seconds>`
- `X-LMP-Signature: hex(HMAC-SHA256(key = raw bytes of SHA256(secret),
  message = METHOD + "\n" + PATH + "\n" + TIMESTAMP + "\n" +
  SHA256(raw request body).hexdigest()))`

`PATH` is the URL path only (including `/api`), no query string. The
server rejects timestamps older than 5 minutes and each signature is
accepted once. If the toggle is on but the key does not require
signing, the extra headers are ignored by the server.

## What the module does

| Action | License Manager Pro call |
|---|---|
| Admin → Licenses page | `GET /licenses` (admin list) |
| Admin → Mint license | `GET /products?slug=` then `POST /licenses` (201) |
| User → My licenses (`/user/licenses`) | `GET /licenses?search=<email>`, filtered to exact owner match |
| Test connection | `GET /system/info` |
| (Service API, for custom code) | `GET /licenses/{id}`, `PUT /licenses/{id}` (status), `DELETE /licenses/{id}` (revoke), `POST /licenses/{id}/renew`, `POST /licenses/validate` |

## Commerce

This module does **not** depend on Drupal Commerce and mints no
license automatically on checkout. Minting happens through the admin
mint form, or through the service API from your own code. If the site
uses Commerce, a site builder can wire order completion to minting
with five lines in a small custom module:

```php
// On Commerce order completion: mint the mapped product's license.
$slug = \Drupal::service('licensemanagerpro.config')->getProductSlugForNodeType($node_type);
$cycle = \Drupal\licensemanagerpro\Service\BillingCycle::mapPlatformCycle($commerce_cycle);
\Drupal::service('licensemanagerpro.license_service')->mint($order->getEmail(), $slug, $cycle);
```

`mapPlatformCycle()` returns `NULL` for an unmapped Commerce cycle,
and `mint()` then falls back to the configured default cycle — an
unknown cycle is never sent to the backend.

## Troubleshooting

- **"not configured: set the API URL and API key first"** — save the
  settings with both fields filled in.
- **HTTP 401 / 403 on every call** — the key is wrong, expired,
  single-use and already consumed, restricted to another IP, or lacks
  the `module` scope. Create a fresh module-scoped key and paste it
  again. Nothing is minted while auth fails.
- **"Signed requests required for this key" (401)** — the key was
  created with signed requests on; turn the module's HMAC toggle on.
- **"Invalid X-LMP-Signature" (401)** — the server clock and the
  Drupal server clock differ by more than 5 minutes, or the toggle
  does not match the key. Fix the clocks first.
- **Product dropdown is a manual slug field** — the backend could not
  be reached or the key lacks `products:read`. Check the URL/key with
  **Test connection**, then reopen the settings form.
- **"product … was not found" when minting** — the slug does not exist
  in License Manager Pro (Products page). Create the product first.
- **A user sees no licenses** — licenses are matched by exact
  `owner_email`; the license must have been minted for that account's
  email address.
- **Mixed-content / TLS errors** — the module never disables TLS
  verification. If the backend uses a self-signed certificate, fix
  the certificate; there is no setting to skip verification.

## Files

- `licensemanagerpro.info.yml` — module metadata (Drupal 10/11).
- `licensemanagerpro.services.yml` — ApiClient, LicenseService,
  ConfigService (constructor injection, no static calls).
- `licensemanagerpro.routing.yml` — settings, admin list, mint form,
  test-connection JSON route, `/user/licenses`.
- `licensemanagerpro.permissions.yml` — `administer licensemanagerpro`,
  `view own licenses`.
- `licensemanagerpro.module` — help text and theme hooks.
- `config/schema/licensemanagerpro.schema.yml` — settings schema.
- `config/install/licensemanagerpro.settings.yml` — defaults.
- `src/Service/ApiClient.php` — Guzzle client, TLS verified, HMAC
  signing, fail-closed errors.
- `src/Service/ConfigService.php` — typed settings reader.
- `src/Service/LicenseService.php` — mint/find/renew/revoke/validate.
- `src/Service/BillingCycle.php` — the six cycles + platform mapping.
- `src/Form/SettingsForm.php` — connection, signing, mapping, test.
- `src/Form/MintLicenseForm.php` — admin mint-for-user form.
- `src/Controller/LicensesController.php` — `/user/licenses`.
- `src/Controller/AdminController.php` — admin list + test route.
- `templates/licensemanagerpro-licenses.html.twig` — user licenses page.
- `templates/licensemanagerpro-admin-licenses.html.twig` — admin list.
- `css/licensemanagerpro.css`, `js/licensemanagerpro.js` — branded
  styles (magenta → violet gradient, inline SVG key mark) and the
  copy-to-clipboard button. No external assets, no web fonts.

## Updates

New versions of this module are published with License Manager Pro
releases (same version number as the app). The admin panel's
**Downloads** page links directly to the release ZIP.

## Testing note

This module was written and statically checked in the development VM
(no PHP runtime and no Drupal install there), so it has **not** been
tested against a live Drupal 10/11 install. Before production use,
install it on a real Drupal site and verify: enable + settings save,
Test connection against the real backend, mint a license from the
admin form, open `/user/licenses` as that user, and check the
HMAC-signed toggle against a key that requires signing.
