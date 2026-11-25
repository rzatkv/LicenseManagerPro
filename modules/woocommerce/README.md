# License Manager Pro — WooCommerce Plugin

Version 1.0.0 — for License Manager Pro 2.2.0+ and WooCommerce 7.0+.

Creates a License Manager Pro license when a WooCommerce order completes,
and shows the key to the customer in the order details, the order email
and **My Account → Licenses** (with live status, expiry, activations and
a deactivate button per installation).

## What it does

| WooCommerce event | License Manager Pro action |
|---|---|
| Order status becomes **Completed** | One license per mapped line item (never before completion, never twice for the same item) |
| Order page / admin order view | License key shown under the line item |
| Order email | License keys listed in the email meta |
| My Account → Licenses | All owned keys with live status, expiry, activations; deactivate one installation |

## Install

1. Download the plugin from the License Manager Pro admin panel
   (**Downloads** page) or from the GitHub releases.
2. In WordPress admin go to **Plugins → Add New → Upload Plugin**,
   upload the ZIP and activate it. (WooCommerce must already be active.)
3. Go to **WooCommerce → License Manager Pro** and fill in:
   - **API URL** — base URL of your License Manager Pro API, e.g.
     `https://license.example.com/api` (no trailing slash).
   - **Admin email / Admin password** — an admin user in License Manager
     Pro. Used only to log in and get a JWT (cached 50 minutes).
   - **Product mapping** — for each WooCommerce product, the License
     Manager Pro product slug (e.g. `cloudpanel-pro`) and billing cycle.
     Only mapped products get a license.
4. Click **Test connection** to verify the login and see the License
   Manager Pro version.

## How licenses are stored

The license key and license id are stored in the order item meta
(`_lmp_license_key`, `_lmp_license_id`), so they travel with the order
forever. The plugin never stores customer passwords or API tokens in
the database beyond the 50-minute JWT transient.

## Requirements

- WordPress 6.0+, WooCommerce 7.0+, PHP 7.4+.
- A reachable License Manager Pro 2.2.0+ instance with an admin user.

## Files

- `licensemanagerpro-woocommerce.php` — plugin bootstrap + settings page.
- `includes/class-lmp-api.php` — the API client (wp_remote_post).
- `includes/class-lmp-orders.php` — order-completed hook + order/email display.
- `includes/class-lmp-account.php` — My Account → Licenses tab + deactivate.

## Updates

New versions of this plugin are published with License Manager Pro
releases. The admin panel's **Downloads** page shows when a newer plugin
version is available.
