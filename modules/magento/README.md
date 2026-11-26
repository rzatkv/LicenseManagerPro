# License Manager Pro — Magento 2 Module

Version 3.0.0 — for License Manager Pro 3.0.0 and Magento 2.4.6+ (PHP 8.1+).

Mints a License Manager Pro license when a Magento invoice is paid, and
shows the customer's licenses under **My Account → My Licenses** (branded
cards with status pills, license-key chip and a copy button).

> **Not tested against a live Magento install in this VM.** The code was
> lint-checked by hand (no `php` binary exists in this VM) and all XML/JSON
> was validated for well-formedness. Install it on a real Magento 2 store
> and run the live checks listed at the end before relying on it.

## What it does

| Magento event | License Manager Pro action |
|---|---|
| Invoice is paid (`sales_order_invoice_pay`) | One license per mapped line item (never before payment, never twice for the same SKU) |
| Admin mints manually | `lmpadmin/license/mint` action (see below) |
| Customer visits **My Account → My Licenses** | Live license list from `GET /licenses?search=<email>` |
| Admin clicks **Test Connection** in config | `GET /system/info` via the configured API key |

## Install

1. Download the module ZIP from the License Manager Pro admin panel
   (**Downloads** page) or from the GitHub release for v3.0.0.
2. Copy the contents into `app/code/Lmp/LicenseManager/` in your Magento
   root, so that `app/code/Lmp/LicenseManager/registration.php` exists.
3. Run:
   ```bash
   bin/magento module:enable Lmp_LicenseManager
   bin/magento setup:upgrade
   bin/magento setup:di:compile
   bin/magento cache:flush
   ```
   (Composer install: `composer require lmp/license-manager:3.0.0` — the
   package type is `magento2-module`.)

## API-key setup (no passwords)

This module authenticates with **one scoped module API key only**. It never
asks for, stores, or sends an admin email/password.

1. In the License Manager Pro panel go to **API Keys** and create a key
   scoped to the module (licenses + product read). The secret is shown
   **once** — copy it immediately.
2. In Magento go to **Stores → Configuration → License Manager Pro →
   Connection** and fill in:
   - **API URL** — base URL of the License Manager Pro API, e.g.
     `https://license.example.com/api` (no trailing slash). HTTPS is
     required; TLS verification is always on and cannot be disabled.
   - **Module API Key** — paste the key. It is stored encrypted.
   - **Sign requests (HMAC)** — optional; see below.
3. Click **Test Connection**. It calls `GET /system/info` and reports the
   License Manager Pro version on success.

A **401/403 fails closed**: no license is minted, the error is logged and
recorded as an order comment, and the admin can mint manually. Check the
key (revoked? expired? wrong scope?) and re-test.

## Product mapping

Only mapped SKUs get a license. In **Stores → Configuration → License
Manager Pro → Product Mapping**, add one JSON object per line:

```json
{"sku": "CLOUDPANEL-PRO", "slug": "cloudpanel-pro", "billing_cycle": "annual"}
{"sku": "VPN-STARTER", "slug": "vpn-starter", "billing_cycle": "monthly"}
```

- `sku` — the Magento product SKU (exact match).
- `slug` — the License Manager Pro product slug.
- `billing_cycle` — optional; one of `monthly`, `quarterly`,
  `semiannual`, `annual`, `biennial`, `lifetime`. When omitted, the
  license is created with the product's default cycle.

If the store also has a custom product attribute `lmp_billing_cycle`,
its value wins over the mapped cycle for that product (create it as a
text attribute on the product if you want per-product cycles without
editing the mapping).

## Billing-cycle sync

When a license is created (or renewed), the module sends the billing
cycle with the request, and the backend creates the license with that
cycle — adding the cycle to the product automatically if it is missing
(sync). Only cycles that map to a known License Manager Pro cycle are
ever sent; anything else is omitted.

| Source value | License Manager Pro cycle |
|---|---|
| `monthly`, `month`, `1 month` | `monthly` |
| `quarterly`, `quarter`, `3 months` | `quarterly` |
| `semiannual`, `semi-annual`, `half-yearly`, `6 months` | `semiannual` |
| `annual`, `yearly`, `year`, `12 months` | `annual` |
| `biennial`, `2 years`, `24 months` | `biennial` |
| `lifetime`, `one-time`, `onetime`, `perpetual` | `lifetime` |
| anything else | omitted — backend uses the product default |

Magento has no native billing-cycle concept for simple products, so the
mapping (or the `lmp_billing_cycle` attribute) is the source of truth.
For subscriptions, map the subscription product to the cycle that matches
its recurring period.

## Signed requests (optional HMAC)

When **Sign requests (HMAC)** is on, every request also carries:

- `X-API-Key: <secret>`
- `X-LMP-Timestamp: <unix seconds>`
- `X-LMP-Signature: hex(HMAC-SHA256(key = raw bytes of SHA256(secret), message))`
- `message = METHOD + "\n" + PATH + "\n" + TIMESTAMP + "\n" + hex(SHA256(raw request body))`

PATH is the URL path only (no query). The server rejects timestamps
older than 5 minutes. Enable the same option on the License Manager Pro
key for this to verify; with it off, plain `X-API-Key` auth is used.

## How licenses are stored

The license key and id are recorded in the order's status-history
comments (`License Manager Pro minted license <key> for SKU <sku> …`),
so they travel with the order. A second invoice payment (or a re-fired
event) never mints a duplicate: the observer skips any SKU that already
has a mint comment on the order. The module stores no customer passwords
and no API tokens beyond the encrypted module key in Magento config.

## Manual mint (admin)

If automatic minting failed (e.g. the API was unreachable when the
invoice was paid), mint manually by POSTing to the admin action
`lmpadmin/license/mint` with `product_slug`, `owner_email` and an
optional `billing_cycle` (any spelling from the table above). There is
no admin grid or mint form in this version — that is out of scope; the
observer + Test Connection + manual action are the admin surface.

## Files

- `registration.php`, `composer.json`, `etc/module.xml` — module bootstrap.
- `etc/acl.xml`, `etc/adminhtml/system.xml`, `etc/adminhtml/routes.xml`,
  `etc/frontend/routes.xml`, `etc/events.xml` — ACL, config, routes, event.
- `Model/Config.php` — scope-config reader (encrypted API key).
- `Model/BillingCycle.php` — the six LMP cycles + spelling map.
- `Model/ApiClient.php` — HTTP client (cURL, TLS verified, HMAC signing,
  fail-closed on 401/403) covering `/products`, `/licenses`,
  `/licenses/{id}`, `/licenses/{id}/renew`, `/licenses/validate`,
  `/system/info`.
- `Model/LicenseService.php` — mint/find/renew/revoke/validate logic.
- `Observer/OrderPaidObserver.php` — `sales_order_invoice_pay` → mint.
- `Controller/Adminhtml/Index/TestConnection.php` — AJAX test connection.
- `Controller/Adminhtml/License/Mint.php` — admin manual mint.
- `Controller/Customer/Licenses.php` — customer licenses page.
- `Block/Customer/Licenses.php` — loads the customer's licenses.
- `Block/Adminhtml/System/Config/Test.php` + `view/adminhtml/templates/system/config/test.phtml` — Test Connection button.
- `view/frontend/layout/customer_account.xml` + `view/frontend/layout/lmp_licensemanager_customer_licenses.xml` + `view/frontend/templates/customer/licenses.phtml` — My Account → My Licenses.

## Troubleshooting

- **Test Connection fails with 401/403** — the key is wrong, revoked,
  expired, or lacks the module scope. Create a fresh module-scoped key
  and paste it again. Nothing is minted while auth fails.
- **No license after payment** — check the order's comments: a failed
  mint is recorded there with the reason. Common causes: SKU not in the
  mapping, product slug wrong in the mapping, API unreachable.
- **Duplicate licenses** — should not happen (mint comments are checked);
  if you see one, check whether the order was re-invoiced with a
  different increment id.
- **My Licenses is empty** — the customer email on the order must match
  the account email; licenses are looked up by that email.

## Live checks still needed (not done in this VM)

1. Install on Magento 2.4.6+ with PHP 8.1+, run `setup:upgrade` and
   `setup:di:compile` cleanly.
2. Configure the key, click Test Connection, confirm the version shows.
3. Place a test order for a mapped SKU, pay the invoice, confirm one
   license is minted with the right cycle and the order comment appears.
4. Pay a second invoice / re-fire the event and confirm no duplicate.
5. Open **My Account → My Licenses** as that customer; check the card,
   status pill and copy button render correctly.
6. Revoke the API key in the panel and confirm a new order fails closed
   with a clear error and no license.
7. With HMAC on, confirm requests succeed; with a skewed clock (> 5 min)
   confirm the server rejects them.

## Updates

New versions of this module are published with License Manager Pro
releases. The admin panel's **Downloads** page shows when a newer module
version is available.
