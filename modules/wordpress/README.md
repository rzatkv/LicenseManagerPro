# License Manager Pro — WordPress (without WooCommerce)

WordPress plugin that connects a plain WordPress site (no WooCommerce)
to License Manager Pro. It maps posts and pages to License Manager Pro
products, shows each logged-in user their licenses on a "My Licenses"
page, lets users mint a license on demand, and lets an admin mint a
license for any customer email from Settings.

Version: **2.3.2** (matches the installed License Manager Pro app version).

## Requirements

- WordPress 6.0+
- PHP 8.0+
- A running License Manager Pro 2.3.2 installation reachable over HTTPS

## Install

1. Copy this `wordpress` folder into `wp-content/plugins/licensemanagerpro-wordpress/`
   (or zip it and upload it via **Plugins → Add New → Upload Plugin**).
2. Activate **License Manager Pro — WordPress** in **Plugins**.
3. Activation creates a **My Licenses** page (`/my-licenses/`) containing
   the `[lmp_licenses]` shortcode. If the page already exists it is reused.
4. Go to **Settings → License Manager Pro** and fill in the connection.

## API-key setup (API key only — no admin email/password)

1. In the License Manager Pro panel, open **API Keys** and create a new
   **module-scoped** key (scope: module — licenses + product read only).
   Set an expiry (required; default 90 days, max 365 days). Optionally
   restrict it with an IP allowlist and require signed requests.
2. Copy the secret **once** — it is never shown again. Rotate it from the
   API Keys page when it expires or leaks.
3. In WordPress (**Settings → License Manager Pro**), paste:
   - **API URL** — base URL of your License Manager Pro install, e.g.
     `https://license.example.com` ("/api" is added automatically).
   - **Module API key** — the secret from step 2.
4. Click **Test connection**. It calls `GET /api/system/info` and shows the
   backend version on success.

The plugin never stores or sends an admin email/password. TLS
verification is always on (`sslverify => true`) and is never disabled.
If the backend answers 401/403 (wrong, expired or revoked key, missing
signature, or a key used outside its scope/IP allowlist), the request
fails **closed**: no license is minted or changed, an error is logged,
and a clear message is shown instead.

## Product mapping

In **Settings → License Manager Pro → Product mapping**, map each post
or page to a License Manager Pro product:

- **Product slug** — pick from the dropdown, which loads your products
  from `GET /api/products` (cached 10 minutes). If the API is
  unreachable the list is empty and you can type the slug by hand.
- **Billing cycle** — the cycle sent when a license is minted for that
  page (see "Billing-cycle sync").

Rows left without a slug are not mapped. Only mapped posts/pages can
mint licenses.

## My Licenses page and shortcode

- The page created on activation uses `[lmp_licenses]`. It lists the
  logged-in user's licenses (looked up by their account email via
  `GET /api/licenses?search=<email>`) as branded cards with a status
  pill, billing cycle, expiry date and a monospace key chip with a
  **Copy** button, plus a **Get a license** form offering every mapped
  product.
- You can also place the shortcode anywhere with a fixed product:
  `[lmp_licenses product="my-product" cycle="annual"]`.
- Visitors who are not logged in see a login prompt, not a license list.

## Minting a license

- **User (frontend):** on the My Licenses page, choose a mapped product
  and click **Get a license**. A license is created for the user's
  account email with the mapped product and its cycle.
- **Admin:** in **Settings → License Manager Pro → Mint a license**,
  enter a customer email, pick a mapped product and click
  **Mint license**. The new key is shown on the page.

## Billing-cycle sync

License Manager Pro cycles are `monthly`, `quarterly`, `semiannual`,
`annual`, `biennial`, `lifetime`. WordPress has no native subscription
cycles, so the cycle is the one the admin picks per mapped post/page
(or the shortcode `cycle` attribute). The plugin only ever sends one
of the six known cycles; anything else is omitted from the request,
and the backend then falls back to the product's default cycle. When
a cycle is sent, the backend creates the license with that cycle and
adds the cycle to the product if it was missing. Renewals send the
cycle as `?billing_cycle=...` on `POST /licenses/{id}/renew`.

## Signed requests (optional)

If the module key is configured to require signed requests, tick
**Signed requests** in the plugin settings. Every request then also
sends:

- `X-API-Key: <secret>`
- `X-LMP-Timestamp: <unix seconds>`
- `X-LMP-Signature: hex(HMAC-SHA256(key = raw bytes of SHA256(secret),
  message))`

where `message = METHOD + "\n" + PATH (URL path only, no query) + "\n"
+ TIMESTAMP + "\n" + SHA256(raw request body).hexdigest()`. The server
rejects timestamps older than 5 minutes and each signature is accepted
once. Leave the toggle off unless the key requires it — a key that does
not require signatures works with plain `X-API-Key` requests.

## Endpoints used

| Purpose | Call |
|---|---|
| Test connection | `GET /api/system/info` |
| Product list / lookup | `GET /api/products`, `GET /api/products?slug=<slug>` |
| Create license | `POST /api/licenses` |
| List a user's licenses | `GET /api/licenses?search=<email>` |
| Get / update / revoke | `GET`, `PUT`, `DELETE /api/licenses/{id}` |
| Renew | `POST /api/licenses/{id}/renew?billing_cycle=...` |
| Validate | `POST /api/licenses/validate` |

## Uninstall

Deactivating flushes rewrite rules. Deleting the plugin removes its
settings, the cached product list and the "My Licenses" page created
on activation (only when it still contains the `[lmp_licenses]`
shortcode, so a page you repurposed is kept).

## Troubleshooting

- **"Not configured yet"** — fill in the API URL and module API key
  under Settings → License Manager Pro and save.
- **Test connection fails with HTTP 401/403** — the key is wrong,
  expired, revoked, outside its IP allowlist, or the key requires
  signed requests and the toggle is off (or vice versa). Create/rotate
  the key in the License Manager Pro panel and paste the new secret.
- **"Product … was not found"** — the slug in the mapping does not
  exist in License Manager Pro. Check the spelling or pick it from
  the dropdown (reload the settings page to refresh the cached list).
- **Empty product dropdown** — the API could not be reached (check the
  URL, HTTPS certificate and the Test connection result). Type the
  slug by hand as a fallback.
- **Mint fails but the test passes** — the key may lack the license
  scope, or the product may not offer the mapped billing cycle. Check
  the key's scope and the product's cycles in the panel.
- **My Licenses page is blank for a user** — the user must be logged
  in, and their WordPress account email must match the `owner_email`
  of their licenses.

## Honest note

This plugin was written and statically checked in this VM only. It was
**not tested against a live WordPress install** here (no WordPress or
PHP runtime is available in this environment), so install it on a
staging site first, run the connection test, map one product, mint a
test license for a test user, and confirm the key and status display
before using it in production.
