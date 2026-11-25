# License Manager Pro — OpenCart Extension

Version **2.3.0** — for License Manager Pro 2.3.0 and OpenCart **3.0.x / 4.0.x**.

Mints a License Manager Pro license when an OpenCart order completes,
and shows the customer their keys at **Account → My Licenses**
(route `extension/module/licensemanagerpro`).

## What it does

| OpenCart event | License Manager Pro action |
|---|---|
| Order reaches the configured "complete" status (default: Complete, id 5) | One license per mapped order line, for the order's customer email — never before completion, never twice for the same line |
| Customer visits **Account → My Licenses** | All licenses owned by their email, with status pill, key chip + copy button, billing cycle and expiry |
| Admin clicks **Test Connection** | `GET /system/info` with the stored API key |

## Install

1. Download the module ZIP from the License Manager Pro admin panel
   (**Downloads** page) or from the GitHub release for v2.3.0.
2. In OpenCart admin go to **Extensions → Installer**, upload the ZIP
   and install it. The ZIP contains an `upload/` tree plus
   `install.json`, which the Extension Installer reads.
3. Go to **Extensions → Extensions → Modules → License Manager Pro**
   and click **Install**, then **Edit**.
4. Fill in the settings (see below) and save.

The installer creates a small table, `oc_lmp_license`
(`DB_PREFIX` + `lmp_license`), recording which order line already
received a license. Uninstalling the module drops that table and
removes the order event and the settings.

## API-key setup (no password anywhere)

1. In the License Manager Pro panel, open **API Keys** and create a
   **module-scoped** key (scope `module`). The secret is shown **once**
   — copy it immediately.
2. In the OpenCart module settings paste:
   - **License Manager Pro API URL** — base URL of your License
     Manager Pro API, e.g. `https://license.example.com/api`
     (no trailing slash).
   - **Module API Key** — the key from step 1.
3. Click **Test Connection**. A green result means the key works and
   shows the License Manager Pro version.

The key is sent as the `X-API-Key` header on every request. The
module never asks for, stores, or sends an admin email/password.
TLS verification is always on (`CURLOPT_SSL_VERIFYPEER` /
`CURLOPT_SSL_VERIFYHOST 2`) and is never disabled. A **401/403**
fails closed: no license is minted, the failure is written to the
OpenCart error log, and the admin sees the error on Test Connection.

## Product mapping

On the settings page, every OpenCart product has a row:

- **License Manager Pro Product** — a dropdown of the products
  loaded from the backend (`GET /products`). If the backend cannot
  be reached, the dropdown falls back to a free-text field where you
  type the product slug (e.g. `cloudpanel-pro`). Leave it blank and
  the product is sold without a license.
- **Billing Cycle** — the cycle sent when the license is created.

Only mapped products get a license.

## Billing-cycle sync

OpenCart has no native subscription cycle, so the cycle comes from
the mapping row above — one cycle per OpenCart product, chosen by
the admin. Valid cycles: `monthly`, `quarterly`, `semiannual`,
`annual`, `biennial`, `lifetime`.

When an order completes, the module resolves the mapped slug to the
License Manager Pro product id (`GET /products?slug=<slug>`) and
creates the license with that cycle
(`POST /licenses` with `product_id`, `owner_email`, `billing_cycle`).
The backend adds a cycle it does not know yet to the product
automatically, and the license expiry follows the cycle. A cycle
that is not one of the six is never sent.

## Signed requests (optional)

Turn on **Sign requests (HMAC)** in the settings and the module adds
to every call:

- `X-LMP-Timestamp`: current Unix seconds
- `X-LMP-Signature`: hex `HMAC-SHA256`, keyed with the raw bytes of
  `SHA256(api key)`, over
  `METHOD + "\n" + PATH + "\n" + TIMESTAMP + "\n" + SHA256(body)`

The path is the URL path only, without the query string. The server
rejects timestamps older than 5 minutes. Enable this only if the
same key is configured for signed requests in License Manager Pro.

## How license creation works

- The module registers an OpenCart event on
  `catalog/model/checkout/order/addOrderHistory/after`. When an order
  history entry sets the configured complete status, the handler
  mints licenses for the mapped lines and records each minted line
  in `oc_lmp_license`, so a later status change never mints twice.
- A failure (unknown slug, rejected key, backend down) is logged
  to the OpenCart error log and that line is skipped; other lines
  still mint. The order itself is never blocked by a license failure.

## Layout

```
upload/
  admin/
    controller/extension/module/licensemanagerpro.php   settings + install/uninstall + Test connection
    model/extension/module/licensemanagerpro.php        API client + mapping + lmp_license table
    view/template/extension/module/licensemanagerpro.twig  branded settings page
    language/en-gb/extension/module/licensemanagerpro.php
  catalog/
    controller/extension/module/licensemanagerpro.php   My Licenses page + order-history event
    model/extension/module/licensemanagerpro.php        API client copy + table helpers
    view/theme/default/template/extension/module/licensemanagerpro.twig  license cards
    language/en-gb/extension/module/licensemanagerpro.php
install.json   OpenCart Extension Installer metadata
version.json   {"version": "2.3.0"}
```

OpenCart admin and catalog are separate applications, so the API
client exists twice (admin model + catalog model). That duplication
is intentional and documented in both files — keep the two copies in
sync when the client changes.

## Notes on the backend contract

Verified against the License Manager Pro 2.3.0 backend in this repo:

- `POST /licenses` accepts `product_id` (integer) plus
  `owner_email` and `billing_cycle`; there is no `product_slug`
  field, so this module resolves the slug to an id first.
- `POST /licenses/{id}/renew` takes a new cycle as the
  `?billing_cycle=` query parameter, not in the request body.
- `POST /licenses/validate` takes the key in the `key` field.
- `GET /licenses?search=<email>` lists the licenses for an email.
- `GET /system/info` is the connection test.

## Troubleshooting

| Symptom | Check |
|---|---|
| Test Connection fails with 401/403 | The key is wrong, expired, or not module-scoped. Create a fresh module key in the panel and paste it again. |
| Test Connection fails "Could not reach" | API URL typo, backend down, or TLS problem (expired/self-signed certificate on the backend — fix the certificate, the module never disables verification). |
| Product dropdown is empty | The API list could not be loaded (see the warning on the page). Type the slug manually in the text field. |
| No license after an order completes | The order status must match the configured complete status; the product must be mapped; check the OpenCart error log for the mint error. |
| Same line minted twice | Should not happen — `oc_lmp_license` has a unique key on `order_product_id`. If the table was dropped manually, reinstall the module. |

## Testing status

**Not tested against a live OpenCart install in this VM** — no PHP
runtime and no OpenCart instance were available here. The PHP files
were verified by hand (balanced braces/parens, no stray syntax) and
the JSON files were parsed. Before release, test on a real
OpenCart 3.0.x and 4.0.x store: installer upload, settings save,
Test Connection, a full order to Complete, the My Licenses page,
and uninstall cleanup.
