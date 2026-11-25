# License Manager Pro — WooCommerce Plugin

Version 2.3.3 — for License Manager Pro 2.3.0+ and WooCommerce 7.0+.

Creates a License Manager Pro license when a WooCommerce order completes,
and shows the key to the customer in the order details, the order email
and **My Account → Licenses** (with live status, expiry, activations and
a deactivate button per installation).

## Authentication — API key only

The plugin connects with **one module-scoped API key**. There is no login
call and no admin credential stored anywhere in WordPress.

1. In the License Manager Pro panel, go to **API Keys** and create a key
   with the **module key** toggle on. A module key is scoped to
   `["module"]` and can only create/read/renew/revoke/validate licenses,
   read products, and read system info — it can never call an admin
   endpoint.
2. An expiry is required: **30 / 90 / 180 / 365 days** (default 90).
   Optionally set a per-key IP allowlist, and optionally require signed
   requests.
3. **Copy the secret once** — it is never shown again. Paste it into
   **WooCommerce → License Manager Pro** (**API key** field) together
   with the **API URL**.
4. If the key was created with "require signed requests", also tick
   **Sign requests (HMAC)** in the plugin settings. The plugin then
   sends `X-LMP-Timestamp` + `X-LMP-Signature` with every request
   (HMAC-SHA256, key = raw bytes of SHA256(secret), over
   `METHOD + "\n" + PATH + "\n" + TIMESTAMP + "\n" + SHA256(body)`).
   The server rejects timestamps older than 5 minutes and bad signatures
   with 401.
5. Click **Test connection**: it calls `GET /system/info` with the key
   and reports the License Manager Pro version on success, or a clear
   error (wrong/expired/revoked key, missing scope, unreachable backend)
   on failure.

**Fail closed:** a 401/403 from the backend means no license is minted,
changed, or reported — the error is written to the order notes (or shown
in the test result) and the order item is left without a license key.

**Rotation:** before a key expires, create a new module key in the panel,
paste it into the plugin settings, and delete the old key. The old key
stops working the moment it is deleted (or expires) — rotate before the
expiry date, not after. Saving the settings clears the cached product
list, so the mapping dropdowns refresh immediately.

## Install

1. Download the plugin from the License Manager Pro admin panel
   (**Downloads** page) or from the GitHub releases.
2. In WordPress admin go to **Plugins → Add New → Upload Plugin**,
   upload the ZIP and activate it. (WooCommerce must already be active.)
3. Go to **WooCommerce → License Manager Pro** and fill in:
   - **API URL** — base URL of your License Manager Pro API, e.g.
     `https://license.example.com/api` (no trailing slash).
   - **API key** — the module-scoped key from the panel (see above).
   - **Sign requests (HMAC)** — only when the key requires it.
   - **Product mapping** — for each WooCommerce product, pick the
     License Manager Pro product from the dropdown (loaded live from
     the API with the stored key, server-side — the key is never
     exposed to the browser — and cached for 10 minutes) and a billing
     cycle. Only mapped products get a license. No manual slugs.
4. Click **Test connection** to verify the key and see the License
   Manager Pro version.

If the product list cannot be loaded (API unreachable, key rejected),
the settings page shows the error inline instead of breaking, and each
row falls back to a plain text field for the product slug — type the
slug manually, fix the API URL / key, save, and reopen the page. A
previously saved slug is kept as an option even when it is no longer in
the fetched list, so saving never wipes a mapping.

## Billing-cycle sync

When an order completes, the plugin sends a billing cycle with every
license it creates, and the backend adds a missing cycle to the product
automatically (sync) — the license expiry then follows that cycle.

| Source | License Manager Pro cycle |
|---|---|
| Subscription billing period `month` | `monthly` |
| Subscription billing period `quarter` | `quarterly` |
| Subscription billing period `year` | `annual` |
| Subscription billing period `day` / `week` | — no equivalent → mapped cycle is used |
| No subscription (or no Subscriptions plugin) | Mapped cycle from the admin product mapping |

When the order is a WooCommerce Subscriptions order, the
subscription's own billing period wins over the mapped cycle. The
plugin only reads the subscription when
`wcs_get_subscriptions_for_order()` exists, so it keeps working
exactly as before when WooCommerce Subscriptions is not installed.
The order note for each created license records the cycle used
(e.g. `— billing cycle annual`). Unknown cycles are rejected by the
backend with HTTP 422.

## How licenses are stored

The license key and license id are stored in the order item meta
(`_lmp_license_key`, `_lmp_license_id`), so they travel with the order
forever. The plugin stores only the module API key in the
`lmp_settings` option — no customer passwords and no other tokens.
(Upgrading from 1.x drops the old login-based settings
on the next save; nothing is migrated.)

## Layout (MVC)

| Layer | Files | Responsibility |
|---|---|---|
| Model | `includes/class-lmp-api.php` | HTTP only: `X-API-Key`, optional HMAC signing, TLS verified, fail-closed 401/403 |
| Model | `includes/class-lmp-cycle-mapper.php` | Subscription period → License Manager Pro cycle |
| Controller | `includes/class-lmp-orders.php` | Order-completed hook + order/email display |
| Controller | `includes/class-lmp-account.php` | My Account endpoint + deactivate action |
| Controller | `includes/class-lmp-admin.php` | Settings page handlers, Test Connection, cached product list |
| View | `includes/views/admin-settings.php` | Settings page (branded, dropdowns + manual fallback) |
| View | `includes/views/my-licenses.php` | My Account → Licenses tab |

No business logic lives in the Views, and no raw HTTP call lives in
the Controllers. `licensemanagerpro-woocommerce.php` is only the
bootstrap (constants, loading, hook registration).

## Requirements

- WordPress 6.0+, WooCommerce 7.0+, PHP 7.4+.
- A reachable License Manager Pro 2.3.0+ instance and a module-scoped
  API key (see Authentication above).

## Files

- `licensemanagerpro-woocommerce.php` — plugin bootstrap.
- `includes/class-lmp-api.php` — the API client (Model).
- `includes/class-lmp-cycle-mapper.php` — billing-cycle mapping (Model).
- `includes/class-lmp-admin.php` — settings handlers + Test Connection (Controller).
- `includes/class-lmp-orders.php` — order-completed hook (Controller).
- `includes/class-lmp-account.php` — My Account → Licenses tab (Controller).
- `includes/views/admin-settings.php` — settings page (View).
- `includes/views/my-licenses.php` — My Account licenses template (View).

## Updates

New versions of this plugin are published with License Manager Pro
releases. The admin panel's **Downloads** page shows when a newer plugin
version is available.
