import React from "react";
import {useLanguage} from "../i18n";
import "../styles/ApiDocs.css";

const CURL_CREATE = `curl -X POST http://127.0.0.1:8000/api/licenses \\
  -H "Authorization: Bearer <JWT>" \\
  -H "Content-Type: application/json" \\
  -d '{"product_id": 1, "billing_cycle": "annual", "owner_email": "buyer@example.com", "max_activations": 1}'`;

const CURL_VALIDATE = `curl -X POST http://127.0.0.1:8000/api/licenses/validate \\
  -H "Content-Type: application/json" \\
  -d '{"key": "LIC-XXXX-XXXX-XXXX", "domain": "example.com", "ip": "203.0.113.10"}'`;

const CURL_RENEW = `curl -X POST http://127.0.0.1:8000/api/licenses/1/renew \\
  -H "Authorization: Bearer <JWT>" \\
  -H "Content-Type: application/json" \\
  -d '{}'
# Renews by the license's own billing cycle (no body needed).
# {"extend_days": 30} overrides the cycle. Lifetime licenses return 400.`;

const WHMCS_HOOK = `<?php
// WHMCS hook: validate the license on every client-area page load
// (modules/addons/lmp_validate/hooks.php) — starting template.
use WHMCS\\Database\\Capsule;

add_hook('ClientAreaPage', 1, function ($vars) {
    $licenseKey = Capsule::table('tblcustomfieldsvalues')
        ->where('fieldid', 1)->where('relid', $_SESSION['uid'] ?? 0)
        ->value('value');
    if (!$licenseKey) return;

    $ch = curl_init('http://127.0.0.1:8000/api/licenses/validate');
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        CURLOPT_POSTFIELDS => json_encode([
            'key' => $licenseKey,
            'domain' => $_SERVER['HTTP_HOST'] ?? null,
        ]),
    ]);
    $res = json_decode(curl_exec($ch), true);
    curl_close($ch);
    if (empty($res['valid'])) {
        // e.g. redirect to a billing/renewal page or show a notice.
        // $res['reason'] explains why (expired, wrong domain, ...).
    }
});`;

const WHMCS_MODULE = `<?php
// WHMCS server module skeleton (modules/servers/lmp/lmp.php) — template.
// Functions WHMCS calls: ValidateLicense, RenewLicense.
function lmp_ValidateLicense(array $params) {
    $ch = curl_init('http://127.0.0.1:8000/api/licenses/validate');
    curl_setopt_array($ch, [
        CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        CURLOPT_POSTFIELDS => json_encode([
            'key' => $params['customfields']['License Key'] ?? '',
            'domain' => $params['domain'] ?? null,
        ]),
    ]);
    $res = json_decode(curl_exec($ch), true);
    curl_close($ch);
    return ['status' => !empty($res['valid']) ? 'Active' : 'Suspended'];
}

function lmp_RenewLicense(array $params) {
    $id = $params['customfields']['License ID'] ?? 0;
    $ch = curl_init("http://127.0.0.1:8000/api/licenses/$id/renew");
    curl_setopt_array($ch, [
        CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            'Authorization: Bearer ' . $params['serverpassword'],
        ],
        CURLOPT_POSTFIELDS => '{}',
    ]);
    $res = json_decode(curl_exec($ch), true);
    curl_close($ch);
    return !empty($res['expires_at']) ? 'success' : 'error';
}`;

const WP_SNIPPET = `<?php
// WordPress / WooCommerce: validate a license on order completion
// and on plugin activation — starting template.
add_action('woocommerce_order_status_completed', function ($order_id) {
    $order = wc_get_order($order_id);
    $license_key = $order->get_meta('_lmp_license_key');
    if (!$license_key) return;

    $res = wp_remote_post('http://127.0.0.1:8000/api/licenses/validate', [
        'headers' => ['Content-Type' => 'application/json'],
        'body' => wp_json_encode([
            'key' => $license_key,
            'domain' => parse_url(home_url(), PHP_URL_HOST),
            'install_path' => ABSPATH,
        ]),
        'timeout' => 15,
    ]);
    $data = json_decode(wp_remote_retrieve_body($res), true);
    if (empty($data['valid'])) {
        $order->add_order_note('License validation failed: ' . ($data['reason'] ?? 'unknown'));
    }
});

// On plugin activation, validate the stored key the same way and
// refuse activation (or show an admin notice) when it is invalid.`;

const WEBHOOK_PAYLOAD = `{
  "event": "license.expiring",
  "license": {
    "id": 12,
    "key": "LIC-XXXX-XXXX-XXXX",
    "product_id": 1,
    "billing_cycle": "annual",
    "owner_email": "buyer@example.com",
    "status": "active",
    "expires_at": "2026-12-01T00:00:00Z"
  },
  "product": {"id": 1, "name": "CloudPanel Pro", "slug": "cloudpanel-pro"},
  "sent_at": "2026-11-24T00:00:00Z"
}`;

const SIG_PHP = `<?php
// Verify the webhook signature (HMAC-SHA256 over the raw request body,
// using the product's webhook_secret; header: X-LMP-Signature).
$payload = file_get_contents('php://input');
$expected = hash_hmac('sha256', $payload, $webhook_secret);
if (!hash_equals($expected, $_SERVER['HTTP_X_LMP_SIGNATURE'] ?? '')) {
    http_response_code(401);
    exit('bad signature');
}`;

const SIG_PY = `# Verify the webhook signature (HMAC-SHA256 over the raw body,
# using the product's webhook_secret; header: X-LMP-Signature).
import hashlib, hmac

def verify_signature(raw_body: bytes, secret: str, header: str) -> bool:
    expected = hmac.new(
        secret.encode(), raw_body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, header or "")`;

const ENDPOINTS = [
  ["POST", "/api/auth/login", "Login, returns a JWT access token"],
  ["POST", "/api/auth/register", "Create a user (first admin is open; afterwards admin only)"],
  ["GET", "/api/products", "List products"],
  ["POST", "/api/products", "Create a product (admin/manager)"],
  ["GET", "/api/products/{id}", "Get one product"],
  ["PUT", "/api/products/{id}", "Update a product (admin/manager)"],
  ["DELETE", "/api/products/{id}", "Delete a product — 400 while licenses reference it"],
  ["POST", "/api/products/{id}/test-webhook", "Send a test webhook, returns {success, status_code}"],
  ["GET", "/api/licenses?filter=&status=&search=", "List licenses"],
  ["POST", "/api/licenses", "Create a license (product_id + billing_cycle compute expiry)"],
  ["GET", "/api/licenses/{id}", "Get one license"],
  ["PUT", "/api/licenses/{id}", "Update a license"],
  ["DELETE", "/api/licenses/{id}", "Delete a license"],
  ["POST", "/api/licenses/{id}/renew", "Renew by billing cycle, or {extend_days} to override"],
  ["POST", "/api/licenses/validate", "Validate a key, optionally with domain / ip / install_path locks"],
  ["GET", "/api/api-keys", "List API keys (JWT)"],
  ["POST", "/api/api-keys", "Create an API key"],
  ["GET", "/api/api-keys/check-access", "Public: validate a key via the api-key header"],
  ["GET", "/api/users/me", "The current user"],
  ["GET", "/api/users", "List users (admin)"],
  ["POST", "/api/users", "Create a user with a role (admin)"],
  ["PUT", "/api/users/{id}", "Update role / active flag (admin)"],
  ["DELETE", "/api/users/{id}", "Delete a user (admin)"],
  ["GET", "/api/settings", "All settings"],
  ["PUT", "/api/settings/{key}", "Create or update a setting"],
  ["DELETE", "/api/settings/{key}", "Delete a setting"],
  ["GET", "/api/system/info", "App version and last update"],
  ["GET", "/api/system/check-updates", "Compare running vs latest version"],
  ["POST", "/api/system/update", "Record the pending version as applied"],
  ["POST", "/api/system/check-expiring?days=7", "Notify expiring/expired licenses (admin/manager)"],
  ["GET", "/api/webhooks/deliveries?product_id=&limit=50", "Recent webhook deliveries"],
  ["GET", "/api/languages", "List languages (code + name)"],
  ["GET", "/api/languages/{code}", "Full translations for a language"],
  ["PUT", "/api/languages/{code}", "Create or update a language"],
  ["DELETE", "/api/languages/{code}", "Delete a custom language"],
  ["GET", "/api/dashboard/summary", "Dashboard counts"],
];

function Section({id, title, children}) {
  return (
    <section className="docs-section" id={id}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function ApiDocs() {
  const {t} = useLanguage();
  return (
    <div className="docs-container">
      <h1>{t("docs.title")}</h1>
      <p className="docs-subtitle">{t("docs.subtitle")}</p>
      <p className="docs-template-note">{t("docs.templateNote")}</p>

      <Section id="auth" title={t("docs.auth")}>
        <p>{t("docs.authText")}</p>
        <pre>{`POST /api/auth/login
{"email": "admin@example.com", "password": "..."}
=> {"access_token": "<JWT>", "token_type": "bearer"}

# Then send on every admin-panel call:
Authorization: Bearer <JWT>`}</pre>
      </Section>

      <Section id="apikeys" title={t("docs.apiKeys")}>
        <p>
          External clients authenticate with an API key, not a JWT. Create one in the
          API Keys page (or POST /api/api-keys with a JWT), then send it in the{" "}
          <code>api-key</code> header — not <code>X-API-Key</code>:
        </p>
        <pre>{`GET /api/api-keys/check-access
api-key: lmp_...

# Success (200) — the key is valid and one use was recorded:
{"access_rights": ["get_license_info", "renew_license"]}

# Failures:
#  403  Invalid API Key / API Key has expired / Single-use API Key already used
#  403  API Key is restricted to another IP / domain / directory
#  429  Daily request limit exceeded`}</pre>
        <p>
          The check enforces expiry, single-use consumption (a single-use key is marked
          consumed on its first successful check), IP / domain / directory restrictions,
          and the daily request limit (system setting <code>daily_request_limit</code>,
          default 100 requests per key per day). Each successful check increments the
          key&apos;s usage counter for today. The CRUD endpoints for API keys themselves
          require a JWT.
        </p>
      </Section>

      <Section id="endpoints" title={t("docs.endpoints")}>
        <table>
          <thead>
            <tr><th>{t("docs.method")}</th><th>{t("docs.path")}</th><th>{t("docs.purpose")}</th></tr>
          </thead>
          <tbody>
            {ENDPOINTS.map(([method, path, purpose]) => (
              <tr key={method + path}>
                <td><span className="badge badge-accent">{method}</span></td>
                <td className="docs-path">{path}</td>
                <td>{purpose}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section id="curl" title={t("docs.curl")}>
        <h3>Create license</h3>
        <pre>{CURL_CREATE}</pre>
        <h3>Validate license</h3>
        <pre>{CURL_VALIDATE}</pre>
        <h3>Renew license</h3>
        <pre>{CURL_RENEW}</pre>
      </Section>

      <Section id="whmcs" title={t("docs.whmcs")}>
        <p>Two pieces: a hook that validates the customer&apos;s license key (with the domain) on client-area pages, and a server module with <code>ValidateLicense</code> / <code>RenewLicense</code> functions for provisioning.</p>
        <h3>Hook — validate on page load</h3>
        <pre>{WHMCS_HOOK}</pre>
        <h3>Server module — ValidateLicense / RenewLicense</h3>
        <pre>{WHMCS_MODULE}</pre>
        <p>Steps: 1) create the product in License Manager Pro and note its id; 2) in WHMCS, add a custom field for the license key (and one for the license id); 3) on product creation call POST /api/licenses with product_id + billing_cycle; 4) store the returned key in the custom field; 5) the hook above (or the module&apos;s ValidateLicense) checks it on each use; 6) on invoice payment call RenewLicense.</p>
      </Section>

      <Section id="wordpress" title={t("docs.wordpress")}>
        <p>Validate the license when an order completes and when the plugin is activated, sending the site domain (and install path) so the license locks apply.</p>
        <pre>{WP_SNIPPET}</pre>
      </Section>

      <Section id="webhooks" title={t("docs.webhooks")}>
        <p>Set a webhook URL and events on a product (Products page). Events: license.created, license.renewed, license.revoked, license.expiring, license.expired, license.validated_failed. Payload example:</p>
        <pre>{WEBHOOK_PAYLOAD}</pre>
        <h3>Signature verification — PHP</h3>
        <pre>{SIG_PHP}</pre>
        <h3>Signature verification — Python</h3>
        <pre>{SIG_PY}</pre>
        <p>Expiry notifications: run this daily from cron (admin/manager JWT) to trigger the expiring/expired webhook events and notifications:</p>
        <pre>{`curl -X POST "http://127.0.0.1:8000/api/system/check-expiring?days=7" \\
  -H "Authorization: Bearer <JWT>"
# => {"expiring_notified": 2, "expired_notified": 1}`}</pre>
      </Section>

      <Section id="locking" title={t("docs.locking")}>
        <p>A license created from a product must use one of that product&apos;s billing cycles. Expiry is computed in whole calendar months from creation: monthly +1, quarterly +3, semiannual +6, annual +12, biennial +24; lifetime never expires (expires_at is null) and cannot be renewed. Renew extends from the current expiry (or from today when already expired) by the license&apos;s own cycle; sending <code>extend_days</code> overrides the cycle.</p>
        <p>Locking: a license can list allowed domains, allowed IPs and an install path. POST /api/licenses/validate accepts optional <code>domain</code>, <code>ip</code> and <code>install_path</code>; when the license has locks, a value that does not match returns <code>valid: false</code> with a <code>reason</code> (and fires a license.validated_failed webhook). A license without locks validates on status alone.</p>
      </Section>
    </div>
  );
}

export default ApiDocs;
