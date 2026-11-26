# LicenseManagerPro for Odoo (v2.3.4)

Connects Odoo 16 / 17 / 18 to a LicenseManagerPro backend. When a sale
order containing a mapped product is confirmed, a license is minted
automatically on the backend. Customers can see their licenses in the
portal (**My Licenses**), and staff manage the cached mirror under
**Sales → LicenseManagerPro → Licenses**.

> **Honest note:** this module was written and statically validated in
> this VM (Python compile, XML/JSON parsing, manifest evaluation) but
> was **not tested against a live Odoo install** — there is no Odoo
> server in this environment. Install it on a staging Odoo first and
> run the live checklist at the bottom of this file before using it in
> production.

## Installation

1. Copy the `licensemanagerpro` folder into your Odoo addons path
   (e.g. `/opt/odoo/addons/`), next to your other custom addons.
2. Restart the Odoo server.
3. In Odoo, go to **Apps**, click **Update Apps List**, then search
   for **LicenseManagerPro** and click **Install**.
4. Requires the Odoo modules `base`, `sale` and `portal` (installed
   automatically as dependencies).

## API-key setup (no passwords)

The module authenticates with **one module-scoped API key only**.
There is no admin e-mail/password login anywhere in this module.

1. In the LicenseManagerPro panel, go to **API Keys → New Key**.
2. Give it a name (e.g. `odoo-shop`), scope **module**, and make sure
   it covers `licenses` (create/read/update/delete/renew/validate)
   and `products:read`. Set an expiry (default 90 days, max 365 days)
   and, if your Odoo server has a fixed IP, add it to the key's IP
   allowlist.
3. **Copy the secret immediately** — the panel shows it only once.
4. In Odoo, go to **Settings → LicenseManagerPro** and paste:
   - **LicenseManagerPro URL** — the panel root URL, e.g.
     `https://licenses.example.com` (no trailing `/api`; it is added
     automatically).
   - **Module API Key** — the secret from step 3.
5. Optionally enable **Sign requests (HMAC)** (see below).
6. Click **Test Connection**. A success proves the URL, the key and
   the network path; any failure is shown with its reason.

The key is stored in `ir.config_parameter`
(`licensemanagerpro.api_key`) and shown with a password widget. Rotate
it in the panel (old secret stops working) and paste the new one here.

## Product mapping

Odoo sale order lines carry no billing cycle of their own, so each
mapping states the LicenseManagerPro cycle explicitly:

1. Go to **Sales → LicenseManagerPro → Product Mappings → Create**.
2. Pick the **Odoo Product** you sell.
3. Enter the **LicenseManagerPro Product Slug** exactly as shown on
   the Products page of the panel (e.g. `pro-plan`). At mint time the
   module resolves it via `GET /products?slug=` and uses the returned
   product id.
4. Pick the **Billing Cycle** for that product (see below). Leave it
   empty only if you want the cycle omitted from the request — note
   the backend rejects a `product_id`-based create without a cycle,
   so in practice a cycle is required for minting.

Each Odoo product can have only one mapping. Only mapped products
mint licenses; unmapped lines are ignored.

## Billing-cycle sync

LicenseManagerPro cycles are `monthly`, `quarterly`, `semiannual`,
`annual`, `biennial`, `lifetime`. The mapping's cycle is sent with
every license create (`POST /licenses`) and renew
(`POST /licenses/{id}/renew?billing_cycle=...`).

The backend **adds a missing cycle to the product automatically**,
so a product that only lists `monthly` and `annual` will gain
`quarterly` the first time an order mints with that cycle. Only a
cycle from the six known values is ever sent; anything else is
dropped and the cycle is omitted from the request.

## Signed requests (optional HMAC)

When **Sign requests (HMAC)** is enabled in Settings, every request
also carries:

- `X-API-Key: <secret>`
- `X-LMP-Timestamp: <unix seconds>`
- `X-LMP-Signature: hex(HMAC-SHA256(key, message))`

where `key` is the raw bytes of `SHA256(secret)` and `message` is
`METHOD + "\n" + PATH + "\n" + TIMESTAMP + "\n" +
SHA256(raw request body bytes).hexdigest()`. `PATH` is the URL path
only (including `/api`, without any query string). The server rejects
timestamps older than 5 minutes, so the Odoo server clock must be
reasonably accurate (NTP).

## What happens on order confirmation

1. The order confirms normally.
2. For each order line with an active mapping (and no license minted
   yet for that line), the module resolves the product slug, then
   calls `POST /licenses` with `product_id`, `owner_email` (the
   customer's e-mail) and the mapped `billing_cycle`.
3. On success a local `lmp.license` mirror record is created and a
   note is posted on the order's chatter with the license key.

### Fail-closed decision (deliberate)

If the backend rejects the request (**HTTP 401/403** — bad, expired,
revoked or out-of-scope key, or a failed signature) or is
unreachable, **no license is minted**. Instead the module posts a
clear note on the order's chatter, creates a to-do activity for the
salesperson, and writes the failure to the server log. **The order
itself still confirms**: blocking a sale (and its invoice, delivery
and payment flow) because a licensing API is down or a key expired
would do more damage than a missing license, which can be minted
afterwards from **Sales → LicenseManagerPro → Licenses**. The failure
is loud (chatter + activity + log) but non-blocking. Nothing is ever
retried silently or hidden.

## Customer portal

Logged-in customers see **My Licenses** on the portal home page and
at `/my/licenses`, listing their licenses live from the backend by
their e-mail address, with a detail page at `/my/licenses/<id>`. The
detail page re-checks that the license's owner e-mail matches the
logged-in partner and returns 404 otherwise, so guessing another
license's id in the URL can never leak it. A record rule additionally
restricts portal users to their own rows in the cached mirror.

## Backend license management

**Sales → LicenseManagerPro → Licenses** shows the cached mirror of
backend records. Per license:

- **Sync from LicenseManagerPro** — refreshes the record from
  `GET /licenses/{id}`.
- **Renew** — `POST /licenses/{id}/renew` (by the license's billing
  cycle), then refreshes the record.
- **Revoke** — `DELETE /licenses/{id}` on the backend first, then
  marks the local copy revoked. If the API call fails, nothing
  changes locally.

The backend is always the source of truth; this model never invents
license data.

## Security notes

- API-key auth only; no admin credentials are stored or sent.
- TLS verification is always on (`verify=True` on every call) and
  there is no setting to disable it. A backend with an invalid
  certificate will fail loudly instead of connecting insecurely.
- 401/403 fails closed: no license is minted, renewed or changed.
- All dynamic values in portal templates are escaped (`t-esc`).
- Portal users can only read their own licenses (record rule +
  ownership check in the controller).

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| Test Connection: 401/403 | Key is wrong, expired, revoked, or lacks the `licenses` / `products:read` scopes. Create a fresh module-scoped key and paste it again. If signing is on, check the server clock (5-minute window) and that the key matches the one used to sign. |
| Test Connection: could not reach | Wrong panel URL, DNS/firewall, or the backend is down. The URL must be the panel root (no `/api`). |
| Order confirms but no license, chatter note about the slug | The mapping's slug does not match any product in the panel. Fix the slug in the mapping. |
| Order confirms but no license, 422 billing_cycle required | The mapping has no billing cycle. Set one in the mapping. |
| Portal shows no licenses | The customer's e-mail on their partner record must match the license `owner_email`. Also check the key's scopes. |
| License shows "Never" as expiry | The license is `lifetime` (no expiry). |

## Live-Odoo checklist (not yet done)

- [ ] Install on Odoo 16, 17 and 18 staging and confirm the module
      installs with no errors.
- [ ] Test Connection with a real module key (unsigned and signed).
- [ ] Create a mapping, confirm a sale order, verify the license is
      minted with the right cycle and the chatter note appears.
- [ ] Confirm an order with the backend down / a revoked key:
      order still confirms, chatter note + activity appear, no
      license is minted.
- [ ] Portal: log in as a customer, open My Licenses and a detail
      page; open another customer's license id directly and confirm
      a 404.
- [ ] Revoke and renew a license from the backend list view.
- [ ] Verify the settings form renders and saves on all three
      Odoo versions.

## Files

| File | Purpose |
|---|---|
| `version.json` | Module version (`2.3.4`, matches the app version). |
| `licensemanagerpro/__manifest__.py` | Odoo manifest (name, version, deps, data files). |
| `licensemanagerpro/models/lmp_api_client.py` | API client: TLS-verified requests, HMAC signing, fail-closed errors. |
| `licensemanagerpro/models/lmp_license.py` | `lmp.license` cached mirror + Sync/Revoke/Renew actions. |
| `licensemanagerpro/models/lmp_product_mapping.py` | `lmp.product.mapping` (Odoo product ↔ LMP slug + cycle). |
| `licensemanagerpro/models/res_config_settings.py` | Settings (URL, key, signing toggle, Test Connection). |
| `licensemanagerpro/models/sale_order.py` | `action_confirm` override: mint licenses, fail closed. |
| `licensemanagerpro/controllers/main.py` | Portal routes `/my/licenses` and `/my/licenses/<id>`. |
| `licensemanagerpro/views/lmp_views.xml` | Backend menu + license/mapping list & form views. |
| `licensemanagerpro/views/res_config_settings_views.xml` | Settings form block. |
| `licensemanagerpro/views/portal_templates.xml` | Branded portal pages + portal home tile. |
| `licensemanagerpro/security/ir.model.access.csv` | Access rights for licenses and mappings. |
| `licensemanagerpro/security/lmp_security.xml` | Portal record rule (own licenses only). |
| `licensemanagerpro/static/description/icon.png` | Branded module icon (gradient + key mark). |
