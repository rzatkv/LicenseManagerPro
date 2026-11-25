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
  ["POST", "/api/auth/login", "docs.ep.authLogin"],
  ["POST", "/api/auth/register", "docs.ep.authRegister"],
  ["GET", "/api/products", "docs.ep.productsList"],
  ["POST", "/api/products", "docs.ep.productsCreate"],
  ["GET", "/api/products/{id}", "docs.ep.productsGet"],
  ["PUT", "/api/products/{id}", "docs.ep.productsUpdate"],
  ["DELETE", "/api/products/{id}", "docs.ep.productsDelete"],
  ["POST", "/api/products/{id}/test-webhook", "docs.ep.productsTestWebhook"],
  ["GET", "/api/licenses?filter=&status=&search=", "docs.ep.licensesList"],
  ["POST", "/api/licenses", "docs.ep.licensesCreate"],
  ["GET", "/api/licenses/{id}", "docs.ep.licensesGet"],
  ["PUT", "/api/licenses/{id}", "docs.ep.licensesUpdate"],
  ["DELETE", "/api/licenses/{id}", "docs.ep.licensesDelete"],
  ["POST", "/api/licenses/{id}/renew", "docs.ep.licensesRenew"],
  ["POST", "/api/licenses/validate", "docs.ep.licensesValidate"],
  ["GET", "/api/api-keys", "docs.ep.apiKeysList"],
  ["POST", "/api/api-keys", "docs.ep.apiKeysCreate"],
  ["GET", "/api/api-keys/check-access", "docs.ep.apiKeysCheckAccess"],
  ["GET", "/api/users/me", "docs.ep.usersMe"],
  ["GET", "/api/users", "docs.ep.usersList"],
  ["POST", "/api/users", "docs.ep.usersCreate"],
  ["PUT", "/api/users/{id}", "docs.ep.usersUpdate"],
  ["DELETE", "/api/users/{id}", "docs.ep.usersDelete"],
  ["GET", "/api/settings", "docs.ep.settingsList"],
  ["PUT", "/api/settings/{key}", "docs.ep.settingsUpdate"],
  ["DELETE", "/api/settings/{key}", "docs.ep.settingsDelete"],
  ["GET", "/api/system/info", "docs.ep.systemInfo"],
  ["GET", "/api/system/check-updates", "docs.ep.systemCheckUpdates"],
  ["POST", "/api/system/update", "docs.ep.systemUpdate"],
  ["POST", "/api/system/check-expiring?days=7", "docs.ep.systemCheckExpiring"],
  ["GET", "/api/webhooks/deliveries?product_id=&limit=50", "docs.ep.webhooksDeliveries"],
  ["GET", "/api/languages", "docs.ep.languagesList"],
  ["GET", "/api/languages/{code}", "docs.ep.languagesGet"],
  ["PUT", "/api/languages/{code}", "docs.ep.languagesUpdate"],
  ["DELETE", "/api/languages/{code}", "docs.ep.languagesDelete"],
  ["GET", "/api/dashboard/summary", "docs.ep.dashboardSummary"],
  ["GET", "/api/audit-logs?skip=&limit=&entity=&actor=", "docs.ep.auditLogs"],
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
          {t("docs.apiKeysText1")}{" "}
          <code>api-key</code>
        </p>
        <pre>{`GET /api/api-keys/check-access
api-key: lmp_...

# Success (200) — the key is valid and one use was recorded:
{"access_rights": ["get_license_info", "renew_license"]}

# Failures:
#  403  Invalid API Key / API Key has expired / Single-use API Key already used
#  403  API Key is restricted to another IP / domain / directory
#  429  Daily request limit exceeded`}</pre>
        <p>{t("docs.apiKeysText2")}</p>
      </Section>

      <Section id="endpoints" title={t("docs.endpoints")}>
        <div className="table-wrap">
        <table>
          <thead>
            <tr><th>{t("docs.method")}</th><th>{t("docs.path")}</th><th>{t("docs.purpose")}</th></tr>
          </thead>
          <tbody>
            {ENDPOINTS.map(([method, path, purpose]) => (
              <tr key={method + path}>
                <td><span className="badge badge-accent">{method}</span></td>
                <td className="docs-path">{path}</td>
                <td>{t(purpose)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </Section>

      <Section id="curl" title={t("docs.curl")}>
        <h3>{t("docs.curlCreate")}</h3>
        <pre>{CURL_CREATE}</pre>
        <h3>{t("docs.curlValidate")}</h3>
        <pre>{CURL_VALIDATE}</pre>
        <h3>{t("docs.curlRenew")}</h3>
        <pre>{CURL_RENEW}</pre>
      </Section>

      <Section id="whmcs" title={t("docs.whmcs")}>
        <p>{t("docs.whmcsText")}</p>
        <h3>{t("docs.hookTitle")}</h3>
        <pre>{WHMCS_HOOK}</pre>
        <h3>{t("docs.moduleTitle")}</h3>
        <pre>{WHMCS_MODULE}</pre>
        <p>{t("docs.whmcsSteps")}</p>
      </Section>

      <Section id="wordpress" title={t("docs.wordpress")}>
        <p>{t("docs.wordpressText")}</p>
        <pre>{WP_SNIPPET}</pre>
      </Section>

      <Section id="webhooks" title={t("docs.webhooks")}>
        <p>{t("docs.webhooksText")}</p>
        <pre>{WEBHOOK_PAYLOAD}</pre>
        <h3>{t("docs.sigPhp")}</h3>
        <pre>{SIG_PHP}</pre>
        <h3>{t("docs.sigPy")}</h3>
        <pre>{SIG_PY}</pre>
        <p>{t("docs.webhooksCronText")}</p>
        <pre>{`curl -X POST "http://127.0.0.1:8000/api/system/check-expiring?days=7" \\
  -H "Authorization: Bearer <JWT>"
# => {"expiring_notified": 2, "expired_notified": 1}`}</pre>
      </Section>

      <Section id="locking" title={t("docs.locking")}>
        <p>{t("docs.lockingText1")}</p>
        <p>{t("docs.lockingText2")}</p>
      </Section>
    </div>
  );
}

export default ApiDocs;
