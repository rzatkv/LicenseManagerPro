# LicenseManagerPro — Shopware 6 Plugin

Version 2.3.0 — for LicenseManagerPro 2.3.0 and Shopware 6.5 / 6.6 (PHP 8.1+).

Mints a LicenseManagerPro license when a Shopware order is **paid**, and shows
the customer their keys at **My account → Licenses** (`/account/licenses`)
as branded cards with status pills and a copy button.

> Honest note: this plugin was written and statically checked in this VM,
> which has no PHP and no Shopware installation. It has **not** been tested
> against a live Shopware install. Install it on a staging shop first and
> run the checklist at the bottom before using it in production.

## What it does

| Shopware event | LicenseManagerPro action |
|---|---|
| Order transaction becomes **paid** | One license per mapped line item (never before payment) |
| Order placed with an already-paid transaction (instant payment) | Same minting, same mint-once guarantee |
| Customer visits **/account/licenses** | All of their licenses, fetched live by e-mail, with status, billing cycle, expiry and activations |
| Admin calls `GET /api/lmp-license-manager/test-connection` | Tests the configured API key against `GET /system/info` |

Mint-once guarantee: minted line items are recorded in the order custom
field `lmp_licenses` (JSON: line item id → license id, created by the
installer), so a duplicate event never mints a second license. One license
is minted per mapped line item, not per unit.

## Install

1. Download `lmp-license-manager-2.3.0.zip` from the LicenseManagerPro
   admin panel (**Downloads** page) or from the GitHub release for v2.3.0
   (the plugin version must match the installed app version).
2. In the Shopware admin go to **Settings → System → Plugins**, upload the
   ZIP, then install and activate **LicenseManagerPro**.
   (Alternatively: extract it to `custom/plugins/LmpLicenseManager`, then
   run `bin/console plugin:refresh`, `bin/console plugin:install --activate
   LmpLicenseManager` and `bin/console cache:clear`.)
3. Go to **Settings → System → Plugins → LicenseManagerPro → Config** and
   fill in the fields below.

## API-key setup (API key only — no passwords)

1. In the LicenseManagerPro panel go to **API Keys** and create a new key
   with the **module** scope (licenses + product read only). Set an expiry
   (required; default 90 days, max 365 days) and, if you want, an IP
   allowlist for this shop.
2. Copy the secret **once** — it is shown only at creation. If you lose it,
   revoke it and create a new one (rotation).
3. In the Shopware plugin settings paste it into **Module API key** and set
   **License Manager Pro URL** to the base URL of your installation, e.g.
   `https://license.example.com` (no trailing slash, no `/api` — the
   plugin appends `/api` itself). Use `https` in production.
4. No admin e-mail or password is ever entered or stored by this plugin.
   TLS verification is always on and can never be disabled from the
   settings. If the key is wrong, revoked or expired, the backend answers
   401/403 and the plugin **fails closed**: no license is minted, and the
   error is written to the Shopware log.

## Product mapping

Map each Shopware product that should grant a license in the **Product
mapping (JSON)** field:

```json
{
  "018f2a1c3d4e5f6a7b8c9d0e1f2a3b4c": {"slug": "cloudpanel-pro", "cycle": "annual"},
  "018f2a1c3d4e5f6a7b8c9d0e1f2a3b4d": {"slug": "starter-pack"}
}
```

- The key is the Shopware product ID (Catalogue → Products → open the
  product; the ID is in the URL).
- `slug` is the LicenseManagerPro product slug.
- `cycle` is optional. Only mapped products receive a license; unmapped
  line items are skipped silently.

## Billing-cycle sync

LicenseManagerPro cycles are `monthly`, `quarterly`, `semiannual`,
`annual`, `biennial`, `lifetime`. The plugin sends a cycle with every
license it creates, and the backend creates the license with that cycle
and adds the cycle to the product if it is missing.

Cycle resolution for a line item, in order:

1. The `cycle` from the product mapping (above).
2. The product's custom field `lmp_billing_cycle` (create it under
   Settings → System → Custom fields → Products if you prefer
   per-product cycles over the mapping). Any of the six LMP cycle names
   works, as do common aliases.
3. Omitted — the backend applies the product default.

| Shopware / custom-field value | LicenseManagerPro cycle |
|---|---|
| `monthly`, `month`, `1-month` | `monthly` |
| `quarterly`, `quarter`, `3-months` | `quarterly` |
| `semiannual`, `semi-annual`, `6-months`, `half-year` | `semiannual` |
| `annual`, `yearly`, `year`, `1-year` | `annual` |
| `biennial`, `2-years` | `biennial` |
| `lifetime`, `once`, `one-time`, `perpetual` | `lifetime` |
| anything else (e.g. `day`, `week`) | — omitted, never sent |

Only a value that maps to a known LMP cycle is ever sent; anything else
is dropped rather than rejected by the backend.

## Signed requests (optional)

Enable **Sign requests with HMAC** in the plugin settings to add, on every
request:

- `X-API-Key: <secret>`
- `X-LMP-Timestamp: <unix seconds>`
- `X-LMP-Signature: hex(HMAC-SHA256(key = raw bytes of SHA256(secret), message))`
- `message = METHOD + "\n" + PATH + "\n" + TIMESTAMP + "\n" + hex(SHA256(raw request body))`

`PATH` is the URL path only (including the `/api` prefix, no query). The
server rejects timestamps older than 5 minutes, so the shop server clock
must be synchronised (NTP). When the toggle is off, only `X-API-Key` is
sent.

## Test connection

There is no custom administration JavaScript in this plugin (the settings
form is the native Shopware `config.xml` form). To test the connection,
call the admin API route with an admin token:

```bash
curl -H "Authorization: Bearer <admin-token>" \
  https://your-shop.example/api/lmp-license-manager/test-connection
```

It returns `{"success": true, "info": {...}}` when `GET /system/info`
answers, or `{"success": false, "error": "..."}` otherwise (wrong key,
unreachable backend, TLS error). The same check is what the plugin does
on every request — a failed check here means no license will be minted.

## Customer page

Logged-in customers see **My account → Licenses** (`/account/licenses`):
branded LicenseManagerPro header (magenta → violet gradient, key mark),
one card per license with a status pill (active / inactive / revoked /
expired), billing cycle, expiry date, activations used vs. allowed, and
the key in a chip with a copy button. All dynamic values are escaped.
Guests are redirected to the login page. No external assets are loaded
(no CDN, no web fonts); all styling is inline in the template.

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| No license after a paid order | Check the mapping JSON (valid JSON? correct product ID and slug?), then the Shopware log for `[LMP]` entries. A 401/403 means the API key is wrong, expired or lacks module scope — create a fresh module-scoped key. |
| Licenses minted twice | Should not happen (mint-once custom field). If it does, check that the `lmp_license_manager` custom field set was created at install; reinstall the plugin if it is missing. |
| Test connection: "Could not reach License Manager Pro" | Backend URL wrong, backend down, or TLS problem (self-signed certificate, expired certificate). TLS verification is never disabled — fix the certificate or the URL. |
| Test connection: clock / signature errors | Only with signed requests on: synchronise the shop server clock (NTP); the server rejects timestamps older than 5 minutes. |
| "Plugin is not configured" | API URL or API key empty in the plugin settings (check the correct sales channel scope — the settings are per sales channel in Shopware; set them for "All sales channels" or each channel you sell in). |
| Licenses page shows "could not be loaded" | The backend call failed (see log). The page still renders; the customer just sees no licenses until the backend is reachable again. |
| `lmp_billing_cycle` custom field is ignored | The mapped cycle in the JSON always wins over the custom field, and the product must still be mapped (slug comes from the mapping). An unknown custom-field value is dropped silently. |

## Files

| Path | Purpose |
|---|---|
| `composer.json` | Shopware plugin package (`lmp/license-manager`, 2.3.0) |
| `src/LicenseManagerPro.php` | Plugin base class; creates/removes the order custom field set |
| `src/Service/ApiClient.php` | Symfony HttpClient wrapper: API-key auth, HMAC signing, TLS verified, fail-closed |
| `src/Service/ConfigService.php` | Reads SystemConfig (URL, key, signed toggle, product mapping) |
| `src/Service/BillingCycleMapper.php` | Maps platform cycle values to the six LMP cycles |
| `src/Service/LicenseService.php` | Mint / list / get / renew / revoke / validate operations |
| `src/Service/ApiException.php` | Exception type for backend refusals |
| `src/Controller/Storefront/LicensesController.php` | `GET /account/licenses` customer page |
| `src/Controller/Api/TestConnectionController.php` | `GET /api/lmp-license-manager/test-connection` (admin API) |
| `src/Subscriber/OrderPlacedSubscriber.php` | Mints licenses on paid orders (paid transition + already-paid placement) |
| `src/Resources/config/services.xml` | Symfony DI service definitions |
| `src/Resources/config/config.xml` | Admin settings form (URL, key, signed toggle, mapping) |
| `src/Resources/config/routes.xml` | Loads the controller routes |
| `src/Resources/views/storefront/page/account/licenses.html.twig` | Branded customer licenses page |
| `version.json` | `{"version": "2.3.0"}` |

## Live-test checklist (staging shop, before production)

- [ ] Plugin installs and activates; `lmp_license_manager` custom field set exists on orders.
- [ ] Test connection returns `success: true` with the API key, and `success: false` with a wrong key.
- [ ] A paid test order for a mapped product mints exactly one license with the mapped cycle; a second paid-transition event does not mint another.
- [ ] An unpaid order mints nothing; an unmapped product mints nothing.
- [ ] `/account/licenses` shows the license, the copy button works, and the page redirects guests to login.
- [ ] Signed requests on: requests succeed with a synchronised clock.
- [ ] Revoking the API key in the panel stops minting (fail-closed, error in the log).
