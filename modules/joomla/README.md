# License Manager Pro — Joomla Component (`com_licensemanagerpro`)

Version 3.0.0 — for License Manager Pro 3.0.0.

A Joomla 4/5 native MVC component. Administrators mint, renew,
activate/deactivate, revoke and validate licenses against a License
Manager Pro backend from the Joomla admin area, and logged-in users
see their own licenses on the site ("My Licenses" menu item) as
branded cards with a copy button.

## What it does

| Area | Action |
|---|---|
| Admin → Dashboard | Connection status (Test connection), settings, mint-a-license form, validate-a-key tool, recent licenses with renew / activate / deactivate / revoke |
| Admin → Licenses view | Searchable, status-filtered license list |
| Site → My Licenses | Logged-in user's licenses (cards: product, status pill, key chip + copy, billing cycle, expiry, activations) |

## Install

1. Download `com_licensemanagerpro-3.0.0.zip` from the License
   Manager Pro admin panel (**Downloads** page) or from the GitHub
   release for v3.0.0.
2. In Joomla: **System → Install → Extensions → Upload Package
   File**, and upload the ZIP. (Packaging layout: the ZIP root holds
   `licensemanagerpro.xml` plus the `site/` and `administrator/`
   folders — exactly the contents of `com_licensemanagerpro/` in this
   repository. Do not zip the parent folder.)
3. Joomla creates the admin menu entry **License Manager Pro** under
   **Components**.
4. Requires Joomla 4.x or 5.x and PHP 8.1+.

## API-key setup (no passwords)

The component connects with **one scoped module API key only**. No
admin email/password is stored or sent anywhere.

1. In the License Manager Pro panel, open **API Keys** and create a
   key with the module scopes (`products:read`, `licenses:read`,
   `licenses:write`, `licenses:renew`, `licenses:delete`,
   `licenses:validate`, `system:read` for Test connection). The
   secret is **shown once** — copy it immediately.
2. In Joomla, open **Components → License Manager Pro** and fill in:
   - **API base URL** — e.g. `https://license.example.com/api`
     (the `/api` suffix is added automatically if you omit it).
   - **Module API key** — paste the secret from step 1. Leaving the
     field empty on later saves keeps the stored key.
   - **Signed requests** — leave off unless the key was created with
     signed requests enabled (see below).
   - **Default product slug / Default billing cycle** — pre-fill the
     mint form.
3. Click **Test connection**. It calls `GET /system/info` and shows
   the backend version on success.

TLS verification is never disabled: the HTTP client uses Joomla's
defaults (certificate verification on). A connection to a server
with an invalid certificate fails instead of silently continuing.

On HTTP 401/403 the component **fails closed**: no license is
minted, renewed or changed, and the error is shown/logged in plain
language ("License Manager Pro rejected the API key…").

## Product mapping

The mint form loads the backend's products as a dropdown
(`GET /products`). If the product list cannot be loaded, a manual
slug field is shown instead. The slug is resolved to a product id
first (`GET /products?slug=<slug>`), because the backend's license
create endpoint takes `product_id`, not a slug.

## Billing-cycle sync

License Manager Pro knows six cycles: `monthly`, `quarterly`,
`semiannual`, `annual`, `biennial`, `lifetime`. Joomla core has no
billing cycles, so the admin picks one of the six directly in the
mint form. Subscription extensions describe periods in their own
words; `CycleMapper` translates common period strings before they
are sent:

| Period string | License Manager Pro cycle |
|---|---|
| `1 month`, `month`, `monthly` | `monthly` |
| `3 months`, `quarter`, `quarterly` | `quarterly` |
| `6 months`, `semi-annually`, `semiannual` | `semiannual` |
| `1 year`, `12 months`, `yearly`, `annual` | `annual` |
| `2 years`, `24 months`, `biennial` | `biennial` |
| `forever`, `one-time`, `lifetime`, `never expires` | `lifetime` |
| anything else | — omitted, never guessed |

The chosen cycle is sent on license creation and on renewal
(`POST /licenses/{id}/renew?billing_cycle=...`). The backend
creates the license with that cycle and adds a missing cycle to the
product automatically.

## Signed requests (optional)

When **Signed requests** is on, every request also sends:

- `X-LMP-Timestamp`: unix seconds
- `X-LMP-Signature`: hex(HMAC-SHA256(key = raw bytes of
  SHA256(secret), message)) where
  `message = METHOD + "\n" + PATH + "\n" + TIMESTAMP + "\n" +
  SHA256(raw request body).hexdigest()`

`PATH` is the URL path only (no query string). The server rejects
timestamps older than 5 minutes. Enable the same setting on the
backend key, or every call fails with 401.

## Menu item (site "My Licenses")

1. **Menus → [your menu] → New**.
2. Menu Item Type → **License Manager Pro → My Licenses**.
3. Save. Guests visiting it are redirected to the Joomla login page
   and returned afterwards; the view only ever shows licenses whose
   `owner_email` matches the logged-in user's email.

## API notes (backend contract, v2.3.0)

- Base URL + `/api`. Auth header: `X-API-Key: <secret>`.
- `GET /products?slug=<slug>` — product read.
- `POST /licenses` — body `{product_id, owner_email,
  billing_cycle, key?}` (the backend field for a custom key is
  `key`; a key is generated server-side when omitted). Returns 201.
- `GET /licenses?search=<email>`, `GET /licenses/{id}`,
  `PUT /licenses/{id} {status}`, `DELETE /licenses/{id}` (revoke).
- `POST /licenses/{id}/renew?billing_cycle=<cycle>` — the cycle is
  a query parameter on this backend.
- `POST /licenses/validate` — body `{key, domain?, ip?,
  install_path?}`.
- `GET /system/info` — Test connection.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| "API URL is not configured" / "API key is not configured" | Fill in both fields on the dashboard and save. |
| "rejected the API key (HTTP 401/403)" | Wrong key, expired key, missing scope, or signed requests enabled on only one side. Create a fresh module key and re-paste it. |
| "Could not reach License Manager Pro" | Backend down, wrong URL, or TLS problem (bad/expired certificate — fix the certificate; verification is never disabled). |
| Product dropdown empty / "Product … was not found" | The slug does not exist on the backend, or the key lacks `products:read`. Check the slug on the Products page. |
| "Unknown billing cycle" | Only the six cycles above are accepted; anything else is rejected rather than guessed. |
| Test connection fails but minting works | The key lacks the system scope for `GET /system/info`. Grant it, or ignore the test result — minting uses the license scopes. |

## Testing status (honest note)

This component was **not tested against a live Joomla install in
this VM** (no PHP runtime and no Joomla here). What was checked:
XML manifests parse, `version.json` parses, PHP files were
balance-checked by hand, no external asset URLs, no TODOs, and no
unrelated branding. Before using it in production, install it on a
real Joomla 4/5 site and verify: install, Test connection, mint a
license, renew/revoke it, the site "My Licenses" menu item as a
logged-in user, and the signed-requests toggle.

## File layout

```
com_licensemanagerpro/
  licensemanagerpro.xml            install manifest (Joomla 4/5, v3.0.0)
  administrator/
    config.xml                     component config (mirrors the manifest)
    services/provider.php          DI bootstrap (MVC + dispatcher factories)
    src/
      Extension/LicensemanagerproComponent.php
      Controller/
        DisplayController.php      default view: dashboard
        LicenseController.php      mint / renew / activate / deactivate / revoke / validate
        ConfigController.php       save settings / Test connection
      Model/
        ApiClient.php              Joomla HttpFactory client, HMAC signing, fail-closed
        CycleMapper.php            period string -> LMP billing cycle
        LicenseModel.php           data layer (products, licenses, mint, renew, …)
      Helper/Branding.php          gradient header, key SVG, pills, inline CSS
      View/
        Dashboard/HtmlView.php
        Licenses/HtmlView.php
    tmpl/
      dashboard/default.php        connection + settings + mint + validate + recent
      licenses/default.php         searchable license list
    language/en-GB/                en-GB.com_licensemanagerpro(.sys).ini
  site/
    src/
      Controller/DisplayController.php   login gate, default view: licenses
      Model/LicensesModel.php            current user's licenses by email
      View/Licenses/HtmlView.php
    tmpl/licenses/default.php      branded license cards + copy button
    language/en-GB/                en-GB.com_licensemanagerpro.ini
```
