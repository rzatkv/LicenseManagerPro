# License Manager Pro — PrestaShop module (v2.3.4)

Connects a PrestaShop 1.7/8 shop to a License Manager Pro backend. When an
order reaches a paid or shipped status, a license is minted for every
mapped product in the order. Customers can view their licenses from
**My account → My licenses**.

> **Honest note:** this module was written and statically checked in this
> VM but was **not tested against a live PrestaShop install** here. Install
> it on a staging shop first and run the checks in "Testing" below.

## Install

1. Copy the `licensemanagerpro` folder (this directory, renamed to
   `licensemanagerpro` if needed) into your shop's `modules/` directory.
2. In the PrestaShop back office go to **Modules → Module Manager**, find
   **License Manager Pro** and click **Install**.
3. You are redirected to the module settings page.

Requires PHP 8.x and the `curl` extension. No external assets are loaded
(no CDN, no web fonts); all styling is inline and all dynamic values are
escaped in the templates.

## API-key setup

The module authenticates with **one scoped module API key only**. It never
asks for, stores, or sends an admin email or password.

1. In the License Manager Pro panel, create a **module-scoped API key**
   (licenses + product read only). Set an expiry (the panel defaults to
   90 days, max 365 days).
2. The secret is shown **once** — copy it immediately.
3. In PrestaShop, open the module settings and paste:
   - **License Manager Pro URL** — base URL of your panel, e.g.
     `https://licenses.example.com` (no trailing slash, no `/api`).
   - **Module API key** — the key from step 2.
4. Optionally enable **Sign requests (HMAC)** (see below).
5. Click **Test connection** — it calls `GET /api/system/info`. A 401/403
   means the key was rejected: no license is ever minted in that state.

TLS verification is always on; the module never disables it. Plain HTTP
is rejected except for `localhost` testing.

## Product mapping

In the settings page, under **Product mapping**:

1. Pick a PrestaShop product.
2. Pick the matching License Manager Pro product — the list is loaded live
   from `GET /api/products`. If the backend cannot be reached, type the
   LMP product slug in manually instead.
3. Pick the **billing cycle** for that product and click **Add mapping**.

## Billing-cycle sync

License Manager Pro cycles are `monthly`, `quarterly`, `semiannual`,
`annual`, `biennial`, `lifetime`.

PrestaShop has **no native subscription cycle**, so there is nothing to
map automatically: the cycle sent on license creation comes from the
mapping's configured cycle. Choose the cycle that matches how the product
is sold (e.g. a yearly plan → `annual`). If you leave the cycle empty,
the module omits it and the backend applies its own default. The backend
creates the license with that cycle and adds the cycle to the product if
it is missing. A cycle that is not a known LMP cycle is never sent.

Licenses are minted by the `actionOrderStatusPostUpdate` hook when an
order reaches one of the paid/shipped statuses: payment received
(`PS_OS_PAYMENT`), webservice payment (`PS_OS_WS_PAYMENT`), shipped
(`PS_OS_SHIPPING`), or delivered (`PS_OS_DELIVERED`). One license is
minted per unit of a mapped product, for the customer's email address.
Failures are written to the PrestaShop log (`PrestaShopLogger`) and the
order is left untouched — the module never blocks checkout.

## Signed requests (optional)

When **Sign requests (HMAC)** is on, every request also sends:

- `X-API-Key: <secret>`
- `X-LMP-Timestamp: <unix seconds>`
- `X-LMP-Signature: hex(HMAC-SHA256(key = raw bytes of SHA256(secret), message))`

where `message = METHOD + "\n" + PATH + "\n" + TIMESTAMP + "\n" + hex(SHA256(body))`
and PATH is the URL path only (including `/api`, without any query string).
The server rejects timestamps older than 5 minutes. Both sides must agree
on the toggle: if the backend expects signatures and the toggle is off
(or vice versa), requests fail closed with 401/403.

## Customer page

Logged-in customers see **My licenses** in their account menu
(`displayCustomerAccount` hook). The page lists their licenses as cards
with a status pill, the license key with a copy button, the billing cycle
and the expiry date.

## Troubleshooting

| Symptom | Check |
|---|---|
| Test connection fails with 401/403 | The API key is wrong, expired, or not module-scoped. Create a fresh key in the panel and paste it again. |
| Test connection fails with a connection error | The URL is wrong, the panel is unreachable from the shop server, or TLS fails. The URL must be HTTPS and reachable. |
| No license after a paid order | The product must be mapped; the order status must be one of the paid/shipped statuses above; check the PrestaShop log for the exact backend error. |
| Product list empty in mapping | The backend could not be reached or returned no products — type the slug manually and check the connection. |
| "My licenses" missing from the account | The module hooks were not registered — reinstall the module, or re-register `displayCustomerAccount`. |

## Uninstall

Uninstalling from the Module Manager removes all four settings
(`LMP_API_URL`, `LMP_API_KEY`, `LMP_SIGNED_REQUESTS`, `LMP_MAPPING`).
Licenses already issued live in the License Manager Pro backend and are
not affected.

## Files

- `licensemanagerpro.php` — module class: install/uninstall, config keys,
  order-status hook (mint on paid/shipped), customer-account hook.
- `classes/LmpApiClient.php` — cURL client, API-key auth, optional HMAC
  signing, TLS always verified, fail-closed on 401/403.
- `classes/LmpLicense.php` — license value object + API-backed repository.
- `controllers/admin/AdminLicensemanagerproSettingsController.php` —
  HelperForm settings + product mapping (live LMP list, manual fallback).
- `controllers/front/LicensesController.php` — logged-in customer's
  licenses page.
- `views/templates/admin/configure.tpl` — branded settings header, status,
  mapping form. `views/templates/front/licenses.tpl` — customer licenses.
- `config.xml`, `version.json` — module metadata (version 2.3.4).

## Testing (still needed on a live shop)

1. Install on a staging PrestaShop 1.7 or 8 shop; confirm the module
   appears and the settings page renders with the branded header.
2. Save the URL + a real module key; **Test connection** must succeed.
3. Map a product with cycle `annual`; place a test order; move it to
   payment received; confirm a license appears in the backend and on the
   customer's **My licenses** page.
4. Enable signed requests and repeat step 3.
5. Revoke the key in the panel and confirm the next order logs an
   authentication error and mints nothing.
