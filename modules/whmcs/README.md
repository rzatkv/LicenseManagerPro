# License Manager Pro — WHMCS Module

Version 1.0.0 — for License Manager Pro 2.2.0+.

Provisions License Manager Pro licenses from WHMCS: when a customer orders
(and pays for) a product that uses this module, WHMCS creates a license in
License Manager Pro and stores the license key in the service's password
field, so the key is visible in the WHMCS admin area and client area.

## What it does

| WHMCS event | License Manager Pro action |
|---|---|
| Order paid / service created (`CreateAccount`) | Creates a license for the mapped product + billing cycle |
| Invoice overdue (`SuspendAccount`) | Sets the license to `inactive` |
| Overdue invoice paid (`UnsuspendAccount`) | Sets the license back to `active` |
| Service cancelled (`TerminateAccount`) | Deletes (revokes) the license |
| Invoice paid for a renewal (`Renew`) | Renews the license by its billing cycle |
| Package change (`ChangePackage`) | Moves the license to the new product / cycle |
| Admin → Services tab | Shows key, status, expiry, activations |

## Install

1. Download the module from the License Manager Pro admin panel
   (**Downloads** page) or from the GitHub releases.
2. Unzip it and copy the `modules/` folder into your WHMCS installation
   root, so this file ends up at
   `modules/servers/licensemanagerpro/licensemanagerpro.php`.
3. In WHMCS, create or edit a product and select **LicenseManagerPro** as
   the module (Setup → Products/Services → Products/Services → Module
   Settings). No server entry is needed — the API URL and credentials are
   configured per product.
4. Fill in the module settings:
   - **API URL** — base URL of your License Manager Pro API, e.g.
     `https://license.example.com/api` (no trailing slash).
   - **Admin email / Admin password** — an admin user in License Manager
     Pro. The module logs in with these to get a JWT; nothing is stored.
   - **Product slug** — the slug of the product in License Manager Pro
     (Products page), e.g. `cloudpanel-pro`.
   - **Billing cycle** — one of the product's cycles
     (`monthly`, `quarterly`, `semiannual`, `annual`, `biennial`,
     `lifetime`).
5. Use **Test Connection** on the product's Module Settings page to verify
   the login and see the License Manager Pro version.

## How the license key is stored

The key is written into the service's **password** field (via the WHMCS
local API `UpdateClientProduct`), so it shows in the admin service view
and, if your product uses it, in the client area. The admin Services tab
also shows the license status, expiry and activation count.

## Requirements

- WHMCS 8.x (server module API v1.1).
- PHP with the cURL extension.
- A reachable License Manager Pro 2.2.0+ instance with an admin user.

## Files

- `modules/servers/licensemanagerpro/licensemanagerpro.php` — the module.
- `modules/servers/licensemanagerpro/lib/ApiClient.php` — the cURL client.

## Updates

New versions of this module are published with License Manager Pro
releases. The admin panel's **Downloads** page shows when a newer module
version is available.
