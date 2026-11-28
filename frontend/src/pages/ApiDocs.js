import React, {useState, useEffect} from "react";
import {Link} from "react-router-dom";
import {useLanguage} from "../i18n";
import CopyButton from "../components/CopyButton";
import TabDropdown from "../components/TabDropdown";
import {KeyRound, List, Code, Webhook, BookOpen} from "lucide-react";
import "../styles/ApiDocs.css";

/** A code sample with a copy button (v3.0.4): EVERY docs sample gets
 * one, copying the whole text at once (clipboard + fallback, with
 * "Copied" feedback — see components/CopyButton). */
function DocsSample({text, label}) {
  const {t} = useLanguage();
  return (
    <>
      <div className="docs-sample-head">
        {label ? <span className="docs-sample-lang">{label}</span> : <span />}
        <CopyButton text={text} label={t("common.copy")} />
      </div>
      <pre>{text}</pre>
    </>
  );
}

// API Docs (v3.0): tabbed, zero scroll. The WHMCS and WordPress guides
// are GONE — those platforms are covered by the ready-made modules on
// the Downloads page (one-line pointer in the Guides tab). Code samples
// cover every language for REST and for webhook verification.

const BASE = "http://127.0.0.1:8000";

const TABS = ["auth", "endpoints", "samples", "webhooks", "guides"];
const DOC_TAB_ICONS = {
  auth: <KeyRound size={16} />,
  endpoints: <List size={16} />,
  samples: <Code size={16} />,
  webhooks: <Webhook size={16} />,
  guides: <BookOpen size={16} />,
};
const SAMPLE_OPS = ["login", "create", "validate", "renew", "checkAccess"];
const SAMPLE_LANGS = ["curl", "python", "javascript", "php", "go"];
const VERIFY_LANGS = ["python", "php", "javascript", "go", "ruby", "java", "csharp"];
// Module-connection guide (Guides tab): the license check + webhook
// receiver in every language we can show — cURL, Python, JavaScript,
// PHP, Go, Ruby, Java and C#. The guide reuses SAMPLES.validate and
// WEBHOOK_VERIFY so each snippet has exactly one source of truth.
const GUIDE_LANGS = ["curl", "python", "javascript", "php", "go", "ruby", "java", "csharp"];
const CONNECT_VIEWS = ["check", "response", "webhook"];
const GUIDES_VIEWS = ["connect", "locking", "billing", "modules"];
const AUTH_VIEWS = ["auth", "apiKeys", "moduleAuth", "moduleSigning"];
const LOCKING_VIEWS = ["billing", "locks"];
const WEBHOOK_VIEWS = ["payload", "verify", "cron"];

// REST samples, one per operation per language. All hit the real API:
// login returns a JWT, create/renew need the JWT, validate is public,
// check-access sends the `api-key` header (not X-API-Key).
const SAMPLES = {
    login: {
        curl: `curl -X POST ${BASE}/api/auth/login \\
  -H "Content-Type: application/json" \\
  -d '{"email": "admin@example.com", "password": "..."}'
# => {"access_token": "<JWT>", "token_type": "bearer"}`,
        python: `import requests

resp = requests.post(
    "${BASE}/api/auth/login",
    json={"email": "admin@example.com", "password": "..."},
    timeout=15,
)
resp.raise_for_status()
token = resp.json()["access_token"]`,
        javascript: `const res = await fetch("${BASE}/api/auth/login", {
  method: "POST",
  headers: {"Content-Type": "application/json"},
  body: JSON.stringify({email: "admin@example.com", password: "..."}),
});
if (!res.ok) throw new Error(\`Login failed: \${res.status}\`);
const {access_token: token} = await res.json();`,
        php: `<?php
$ch = curl_init('${BASE}/api/auth/login');
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
    CURLOPT_POSTFIELDS => json_encode([
        'email' => 'admin@example.com',
        'password' => '...',
    ]),
]);
$res = json_decode(curl_exec($ch), true);
curl_close($ch);
$token = $res['access_token'] ?? null;`,
        go: `package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
)

func main() {
	body, _ := json.Marshal(map[string]string{
		"email": "admin@example.com", "password": "...",
	})
	resp, err := http.Post("${BASE}/api/auth/login",
		"application/json", bytes.NewReader(body))
	if err != nil {
		panic(err)
	}
	defer resp.Body.Close()
	var out struct {
		AccessToken string \`json:"access_token"\`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		panic(err)
	}
	fmt.Println(out.AccessToken)
}`,
    },
    create: {
        curl: `curl -X POST ${BASE}/api/licenses \\
  -H "Authorization: Bearer <JWT>" \\
  -H "Content-Type: application/json" \\
  -d '{"product_id": 1, "billing_cycle": "annual", "owner_email": "buyer@example.com", "max_activations": 1}'
# => {"id": 12, "key": "LIC-XXXX-XXXX-XXXX", "expires_at": "2027-11-26T00:00:00Z", ...}`,
        python: `import requests

resp = requests.post(
    "${BASE}/api/licenses",
    headers={"Authorization": f"Bearer {token}"},
    json={
        "product_id": 1,
        "billing_cycle": "annual",  # monthly, quarterly, semiannual, annual, biennial, lifetime
        "owner_email": "buyer@example.com",
        "max_activations": 1,
    },
    timeout=15,
)
resp.raise_for_status()
license = resp.json()  # license["key"] is the new license key`,
        javascript: `const res = await fetch("${BASE}/api/licenses", {
  method: "POST",
  headers: {
    "Authorization": \`Bearer \${token}\`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    product_id: 1,
    billing_cycle: "annual", // monthly, quarterly, semiannual, annual, biennial, lifetime
    owner_email: "buyer@example.com",
    max_activations: 1,
  }),
});
if (!res.ok) throw new Error(\`Create failed: \${res.status}\`);
const license = await res.json(); // license.key is the new license key`,
        php: `<?php
$ch = curl_init('${BASE}/api/licenses');
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => [
        'Content-Type: application/json',
        'Authorization: Bearer ' . $token,
    ],
    CURLOPT_POSTFIELDS => json_encode([
        'product_id' => 1,
        'billing_cycle' => 'annual', // monthly, quarterly, semiannual, annual, biennial, lifetime
        'owner_email' => 'buyer@example.com',
        'max_activations' => 1,
    ]),
]);
$license = json_decode(curl_exec($ch), true);
curl_close($ch); // $license['key'] is the new license key`,
        go: `package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
)

func main() {
	body, _ := json.Marshal(map[string]any{
		"product_id":      1,
		"billing_cycle":   "annual", // monthly, quarterly, semiannual, annual, biennial, lifetime
		"owner_email":     "buyer@example.com",
		"max_activations": 1,
	})
	req, _ := http.NewRequest("POST", "${BASE}/api/licenses", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		panic(err)
	}
	defer resp.Body.Close()
	var license struct {
		Key string \`json:"key"\`
	}
	json.NewDecoder(resp.Body).Decode(&license)
	fmt.Println(license.Key)
}`,
    },
    validate: {
        curl: `# License checks are PUBLIC (v3.0) — no API key, no JWT.
# 60 checks/min per IP; a blacklisted IP/domain is rejected.
# "ip" is optional and informational only — the IP lock uses your
# connection IP, not this field (v3.0.6).
curl -X POST ${BASE}/api/licenses/validate \\
  -H "Content-Type: application/json" \\
  -d '{"key": "LIC-XXXX-XXXX-XXXX", "domain": "example.com", "ip": "203.0.113.10", "install_path": "/var/www/html"}'
# => {"valid": true, "detail": "License is valid", "license": {"product": "CloudPanel Pro", "product_id": 1, "billing_cycle": "annual", "status": "active", "expires_at": "2027-11-26T00:00:00Z", "max_activations": 10, "activations": 3}, "grace": false, "warnings": []}
# => {"valid": false, "detail": "License has expired", "license": {"product": "CloudPanel Pro", "product_id": 1, "billing_cycle": "annual", "status": "expired", "expires_at": "2026-11-01T00:00:00Z", "max_activations": 10, "activations": 3}, "grace": false, "warnings": []}
# => {"valid": false, "detail": "blocked: blacklisted", "license": null, "grace": false, "warnings": []}
# "license" holds only 7 fields (v3.0.6) — product, product_id,
# billing_cycle, status, expires_at, max_activations, activations —
# never the key, the owner email or the lock lists.
# In lenient mode a lock mismatch returns valid: true with grace: true and a warning.`,
        python: `import requests

# License checks are PUBLIC (v3.0) — no API key, no JWT.
resp = requests.post(
    "${BASE}/api/licenses/validate",
    json={
        "key": "LIC-XXXX-XXXX-XXXX",
        "domain": "example.com",        # optional; checked against the license locks
        "ip": "203.0.113.10",           # optional; informational only — the IP lock uses your connection IP, not this field (v3.0.6)
        "install_path": "/var/www/html",  # optional; checked against the license locks
    },
    timeout=15,
)
resp.raise_for_status()  # 429 when the 60/min per-IP limit is hit
data = resp.json()
# data["license"] holds only 7 fields (v3.0.6): product, product_id,
# billing_cycle, status, expires_at, max_activations, activations.
# It never contains the key, the owner email or the lock lists.
if data["valid"]:
    lic = data["license"]
    print("valid:", lic["product"], lic["status"], "expires", lic["expires_at"])
    if data.get("grace"):
        print("grace warnings:", data.get("warnings", []))
else:
    print("invalid:", data["detail"])  # expired, wrong domain, blocked: blacklisted, ...`,
        javascript: `// License checks are PUBLIC (v3.0) — no API key, no JWT.
const res = await fetch("${BASE}/api/licenses/validate", {
  method: "POST",
  headers: {"Content-Type": "application/json"},
  body: JSON.stringify({
    key: "LIC-XXXX-XXXX-XXXX",
    domain: "example.com",  // optional; checked against the license locks
    ip: "203.0.113.10",     // optional; informational only — the IP lock uses your connection IP, not this field (v3.0.6)
    install_path: "/var/www/html", // optional; checked against the license locks
  }),
});
if (!res.ok) throw new Error(\`Validate failed: \${res.status}\`); // 429 at 60/min per IP
const data = await res.json();
// data.license holds only 7 fields (v3.0.6): product, product_id,
// billing_cycle, status, expires_at, max_activations, activations.
// It never contains the key, the owner email or the lock lists.
if (data.valid) {
  console.log("valid:", data.license.product, data.license.status, "expires", data.license.expires_at);
  if (data.grace) console.log("grace warnings:", data.warnings);
} else {
  console.log("invalid:", data.detail); // expired, wrong domain, blocked: blacklisted, ...
}`,
        php: `<?php
// License checks are PUBLIC (v3.0) — no API key, no JWT.
$ch = curl_init('${BASE}/api/licenses/validate');
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
    CURLOPT_POSTFIELDS => json_encode([
        'key' => 'LIC-XXXX-XXXX-XXXX',
        'domain' => 'example.com', // optional; checked against the license locks
        'ip' => '203.0.113.10',    // optional; informational only — the IP lock uses your connection IP, not this field (v3.0.6)
        'install_path' => '/var/www/html', // optional; checked against the license locks
    ]),
]);
$data = json_decode(curl_exec($ch), true);
curl_close($ch);
// $data['license'] holds only 7 fields (v3.0.6): product, product_id,
// billing_cycle, status, expires_at, max_activations, activations.
// It never contains the key, the owner email or the lock lists.
if (!empty($data['valid'])) {
    $lic = $data['license'];
    echo 'valid: ' . $lic['product'] . ' / ' . $lic['status'] . ', expires ' . ($lic['expires_at'] ?? 'never');
    if (!empty($data['grace'])) echo ' (grace: ' . implode(', ', $data['warnings'] ?? []) . ')';
} else {
    echo 'invalid: ' . ($data['detail'] ?? 'unknown'); // expired, wrong domain, blocked: blacklisted, ...
}`,
        go: `package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
)

func main() {
	body, _ := json.Marshal(map[string]string{
		"key":          "LIC-XXXX-XXXX-XXXX",
		"domain":       "example.com", // optional; checked against the license locks
		"ip":           "203.0.113.10", // optional; informational only — the IP lock uses your connection IP, not this field (v3.0.6)
		"install_path": "/var/www/html", // optional; checked against the license locks
	})
	// License checks are PUBLIC (v3.0) — no API key, no JWT.
	resp, err := http.Post("${BASE}/api/licenses/validate",
		"application/json", bytes.NewReader(body))
	if err != nil {
		panic(err)
	}
	defer resp.Body.Close()
	var data struct {
		Valid    bool     \`json:"valid"\`
		Detail   string   \`json:"detail"\`
		License  *struct {
			Product        string \`json:"product"\`
			ProductID      int    \`json:"product_id"\`
			BillingCycle   string \`json:"billing_cycle"\`
			Status         string \`json:"status"\`
			ExpiresAt      string \`json:"expires_at"\`
			MaxActivations int    \`json:"max_activations"\`
			Activations    int    \`json:"activations"\`
		} \`json:"license"\` // only these 7 fields (v3.0.6) — never the key, owner or locks
		Grace    bool     \`json:"grace"\`
		Warnings []string \`json:"warnings"\`
	}
	json.NewDecoder(resp.Body).Decode(&data)
	fmt.Println(data.Valid, data.Detail, data.Grace, data.Warnings)
	if data.License != nil {
		fmt.Println(data.License.Product, data.License.Status, data.License.ExpiresAt)
	}
}`,
        ruby: `require "net/http"
require "json"

# License checks are PUBLIC (v3.0) — no API key, no JWT.
uri = URI("${BASE}/api/licenses/validate")
res = Net::HTTP.post(uri, JSON.generate({
  "key" => "LIC-XXXX-XXXX-XXXX",
  "domain" => "example.com",        # optional; checked against the license locks
  "ip" => "203.0.113.10",           # optional; informational only — the IP lock uses your connection IP, not this field (v3.0.6)
  "install_path" => "/var/www/html",  # optional; checked against the license locks
}), "Content-Type" => "application/json")
data = JSON.parse(res.body)
# data["license"] holds only 7 fields (v3.0.6): product, product_id,
# billing_cycle, status, expires_at, max_activations, activations.
# It never contains the key, the owner email or the lock lists.
if data["valid"]
  lic = data["license"]
  puts "valid: #{lic["product"]} (#{lic["status"]}), expires #{lic["expires_at"]}"
  puts "grace warnings: #{data["warnings"]}" if data["grace"]
else
  puts "invalid: #{data["detail"]}" # expired, wrong domain, blocked: blacklisted, ...
end`,
        java: `import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

public class ValidateLicense {
    public static void main(String[] args) throws Exception {
        // License checks are PUBLIC (v3.0) — no API key, no JWT.
        // "ip" is optional and informational only — the IP lock uses
        // your connection IP, not this field (v3.0.6).
        String body = "{\\"key\\": \\"LIC-XXXX-XXXX-XXXX\\", \\"domain\\": \\"example.com\\", \\"ip\\": \\"203.0.113.10\\", \\"install_path\\": \\"/var/www/html\\"}";
        HttpRequest req = HttpRequest.newBuilder()
            .uri(URI.create("${BASE}/api/licenses/validate"))
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(body))
            .build();
        String res = HttpClient.newHttpClient()
            .send(req, HttpResponse.BodyHandlers.ofString()).body();
        // {"valid": true, "detail": "License is valid", "license": {"product": "CloudPanel Pro", "product_id": 1, "billing_cycle": "annual", "status": "active", "expires_at": "2027-11-26T00:00:00Z", "max_activations": 10, "activations": 3}, "grace": false, "warnings": []}
        // {"valid": false, "detail": "License has expired" | "blocked: blacklisted" | ..., "license": {...same 7 fields...} | null, "grace": false, "warnings": []}
        // "license" holds only 7 fields (v3.0.6) — never the key, the owner email or the lock lists.
        System.out.println(res);
    }
}`,
        csharp: `using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;

// License checks are PUBLIC (v3.0) — no API key, no JWT.
var client = new HttpClient();
var body = new StringContent(
    JsonSerializer.Serialize(new
    {
        key = "LIC-XXXX-XXXX-XXXX",
        domain = "example.com",        // optional; checked against the license locks
        ip = "203.0.113.10",           // optional; informational only — the IP lock uses your connection IP, not this field (v3.0.6)
        install_path = "/var/www/html",  // optional; checked against the license locks
    }),
    Encoding.UTF8, "application/json");
var res = await client.PostAsync("${BASE}/api/licenses/validate", body);
var data = JsonDocument.Parse(await res.Content.ReadAsStringAsync()).RootElement;
if (data.GetProperty("valid").GetBoolean())
{
    // "license" holds only 7 fields (v3.0.6): product, product_id,
    // billing_cycle, status, expires_at, max_activations, activations —
    // never the key, the owner email or the lock lists.
    var lic = data.GetProperty("license");
    System.Console.WriteLine("valid: " + lic.GetProperty("product").GetString() + " / " + lic.GetProperty("status").GetString() + ", expires " + lic.GetProperty("expires_at").GetString());
    if (data.GetProperty("grace").GetBoolean())
        System.Console.WriteLine("grace warnings: " + data.GetProperty("warnings"));
}
else
{
    // expired, wrong domain, blocked: blacklisted, ...
    System.Console.WriteLine("invalid: " + data.GetProperty("detail").GetString());
}`,
    },
    renew: {
        curl: `curl -X POST ${BASE}/api/licenses/1/renew \\
  -H "Authorization: Bearer <JWT>" \\
  -H "Content-Type: application/json" \\
  -d '{}'
# Renews by the license's own billing cycle (no body needed).
# {"extend_days": 30} overrides the cycle. Lifetime licenses return 400.`,
        python: `import requests

resp = requests.post(
    f"${BASE}/api/licenses/1/renew",
    headers={"Authorization": f"Bearer {token}"},
    json={},  # empty: renews by the license's own billing cycle
    # json={"extend_days": 30},  # overrides the cycle
    timeout=15,
)
resp.raise_for_status()
print(resp.json()["expires_at"])`,
        javascript: `const res = await fetch("${BASE}/api/licenses/1/renew", {
  method: "POST",
  headers: {
    "Authorization": \`Bearer \${token}\`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({}), // empty: renews by the license's own billing cycle
  // body: JSON.stringify({extend_days: 30}), // overrides the cycle
});
if (!res.ok) throw new Error(\`Renew failed: \${res.status}\`);
const data = await res.json();
console.log(data.expires_at);`,
        php: `<?php
$ch = curl_init('${BASE}/api/licenses/1/renew');
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => [
        'Content-Type: application/json',
        'Authorization: Bearer ' . $token,
    ],
    CURLOPT_POSTFIELDS => '{}', // empty: renews by the license's own billing cycle
    // CURLOPT_POSTFIELDS => json_encode(['extend_days' => 30]), // overrides the cycle
]);
$data = json_decode(curl_exec($ch), true);
curl_close($ch);
echo $data['expires_at'] ?? '';`,
        go: `package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
)

func main() {
	req, _ := http.NewRequest("POST", "${BASE}/api/licenses/1/renew",
		bytes.NewReader([]byte("{}"))) // empty: renews by the license's own billing cycle
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		panic(err)
	}
	defer resp.Body.Close()
	var data struct {
		ExpiresAt string \`json:"expires_at"\`
	}
	json.NewDecoder(resp.Body).Decode(&data)
	fmt.Println(data.ExpiresAt)
}`,
    },
    checkAccess: {
        curl: `curl ${BASE}/api/api-keys/check-access \\
  -H "api-key: lmp_..."
# Success (200): {"access_rights": ["get_license_info", "renew_license"]}
# Failures: 403 invalid/expired/consumed key or wrong IP/domain/directory,
# 429 daily request limit exceeded.`,
        python: `import requests

resp = requests.get(
    "${BASE}/api/api-keys/check-access",
    headers={"api-key": "lmp_..."},  # the header is "api-key", not X-API-Key
    timeout=15,
)
if resp.status_code == 200:
    print(resp.json()["access_rights"])
elif resp.status_code == 429:
    print("daily request limit exceeded")
else:
    print("invalid key:", resp.status_code)`,
        javascript: `const res = await fetch("${BASE}/api/api-keys/check-access", {
  headers: {"api-key": "lmp_..."}, // the header is "api-key", not X-API-Key
});
if (res.ok) {
  const data = await res.json();
  console.log(data.access_rights);
} else if (res.status === 429) {
  console.log("daily request limit exceeded");
} else {
  console.log("invalid key:", res.status);
}`,
        php: `<?php
$ch = curl_init('${BASE}/api/api-keys/check-access');
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => ['api-key: lmp_...'], // the header is "api-key", not X-API-Key
]);
curl_exec($ch);
$status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);
if ($status === 200) {
    echo 'key is valid';
} elseif ($status === 429) {
    echo 'daily request limit exceeded';
} else {
    echo 'invalid key: ' . $status;
}`,
        go: `package main

import (
	"encoding/json"
	"fmt"
	"net/http"
)

func main() {
	req, _ := http.NewRequest("GET", "${BASE}/api/api-keys/check-access", nil)
	req.Header.Set("api-key", "lmp_...") // the header is "api-key", not X-API-Key
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		panic(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode == 200 {
		var data struct {
			AccessRights []string \`json:"access_rights"\`
		}
		json.NewDecoder(resp.Body).Decode(&data)
		fmt.Println(data.AccessRights)
	} else {
		fmt.Println("invalid key:", resp.StatusCode)
	}
}`,
    },
};

// Webhook payload (v3.0.9): the flat shape the backend actually sends
// (services/webhooks.py license_payload) — event, license key, product
// slug, owner email, expiry; "reason" only on failure events. The old
// nested {"license": {...full record...}, "product": {...}, "sent_at"}
// shape never existed server-side. The event name also travels in the
// X-LMP-Event header, and the HMAC signature in X-LMP-Signature (see
// the verify tab).
const WEBHOOK_PAYLOAD = `{
  "event": "license.expiring",
  "license_key": "LIC-XXXX-XXXX-XXXX",
  "product_slug": "cloudpanel-pro",
  "owner_email": "buyer@example.com",
  "expires_at": "2026-12-01T00:00:00Z"
}`;

// Webhook verification: HMAC-SHA256 over the RAW request body with the
// product's webhook_secret; the hex digest travels in X-LMP-Signature.
// Compare in constant time and never trust the parsed JSON first.
const WEBHOOK_VERIFY = {
    python: `# pip install flask
import hashlib, hmac
from flask import Flask, request, abort

app = Flask(__name__)
WEBHOOK_SECRET = "paste the product's webhook_secret here"

@app.post("/lmp-webhook")
def lmp_webhook():
    raw = request.get_data()  # raw bytes, exactly as sent
    expected = hmac.new(WEBHOOK_SECRET.encode(), raw, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, request.headers.get("X-LMP-Signature", "")):
        abort(401)
    event = request.get_json()
    # event["event"] is e.g. "license.expiring"; event["license_key"] ...
    return {"ok": True}`,
    php: `<?php
// Receiving endpoint: verify the HMAC-SHA256 signature over the raw body.
$secret = 'paste the product\\'s webhook_secret here';
$payload = file_get_contents('php://input'); // raw body, exactly as sent
$expected = hash_hmac('sha256', $payload, $secret);
if (!hash_equals($expected, $_SERVER['HTTP_X_LMP_SIGNATURE'] ?? '')) {
    http_response_code(401);
    exit('bad signature');
}
$event = json_decode($payload, true);
// $event['event'] is e.g. "license.expiring"; $event['license_key'] ...
http_response_code(200);
echo json_encode(['ok' => true]);`,
    javascript: `// node webhook-receiver.js — no dependencies.
const crypto = require("node:crypto");
const http = require("node:http");

const WEBHOOK_SECRET = "paste the product's webhook_secret here";

http.createServer((req, res) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const raw = Buffer.concat(chunks); // raw bytes, exactly as sent
    const expected = crypto.createHmac("sha256", WEBHOOK_SECRET).update(raw).digest("hex");
    const header = req.headers["x-lmp-signature"] || "";
    const ok = header.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(header), Buffer.from(expected));
    if (!ok) { res.writeHead(401); res.end("bad signature"); return; }
    const event = JSON.parse(raw.toString("utf8"));
    // event.event is e.g. "license.expiring"; event.license_key ...
    res.writeHead(200, {"Content-Type": "application/json"});
    res.end(JSON.stringify({ok: true}));
  });
}).listen(3000);`,
    go: `package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
)

const webhookSecret = "paste the product's webhook_secret here"

func main() {
	http.HandleFunc("/lmp-webhook", func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body) // raw bytes, exactly as sent
		mac := hmac.New(sha256.New, []byte(webhookSecret))
		mac.Write(raw)
		expected := hex.EncodeToString(mac.Sum(nil))
		if !hmac.Equal([]byte(r.Header.Get("X-LMP-Signature")), []byte(expected)) {
			http.Error(w, "bad signature", http.StatusUnauthorized)
			return
		}
		var event map[string]any
		json.Unmarshal(raw, &event)
		// event["event"] is e.g. "license.expiring"; event["license_key"] ...
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(\`{"ok": true}\`))
	})
	http.ListenAndServe(":3000", nil)
}`,
    ruby: `# gem install webrick (stdlib in older Rubies)
require "webrick"
require "json"
require "openssl"

WEBHOOK_SECRET = "paste the product's webhook_secret here"

server = WEBrick::HTTPServer.new(Port: 3000)
server.mount_proc "/lmp-webhook" do |req, res|
  raw = req.body # raw bytes, exactly as sent
  expected = OpenSSL::HMAC.hexdigest("SHA256", WEBHOOK_SECRET, raw)
  sig = req["X-LMP-Signature"].to_s
  ok = sig.bytesize == expected.bytesize &&
    OpenSSL.fixed_length_secure_compare(expected, sig)
  unless ok
    res.status = 401
    res.body = "bad signature"
    next
  end
  event = JSON.parse(raw)
  # event["event"] is e.g. "license.expiring"; event["license_key"] ...
  res["Content-Type"] = "application/json"
  res.body = '{"ok": true}'
end
trap("INT") { server.shutdown }
server.start`,
    java: `import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

// JDK built-in server (Java 17+); verify the HMAC-SHA256 signature
// over the raw body before trusting the parsed JSON.
public class WebhookReceiver {
    public static void main(String[] args) throws Exception {
        HttpServer server = HttpServer.create(new InetSocketAddress(3000), 0);
        server.createContext("/lmp-webhook", ex -> {
            try {
                byte[] raw = ex.getRequestBody().readAllBytes(); // raw bytes, exactly as sent
                Mac mac = Mac.getInstance("HmacSHA256");
                mac.init(new SecretKeySpec("paste the product's webhook_secret here".getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
                String expected = HexFormat.of().formatHex(mac.doFinal(raw));
                String sig = ex.getRequestHeaders().getFirst("X-LMP-Signature");
                boolean ok = sig != null && MessageDigest.isEqual(
                    expected.getBytes(StandardCharsets.UTF_8),
                    sig.getBytes(StandardCharsets.UTF_8));
                if (!ok) {
                    ex.sendResponseHeaders(401, 0);
                    ex.getResponseBody().close();
                    return;
                }
                // event JSON: {"event": "license.expiring", "license_key": "LIC-...", ...}
                byte[] out = "{\\"ok\\": true}".getBytes(StandardCharsets.UTF_8);
                ex.getResponseHeaders().set("Content-Type", "application/json");
                ex.sendResponseHeaders(200, out.length);
                ex.getResponseBody().write(out);
                ex.getResponseBody().close();
            } catch (Exception e) {
                ex.sendResponseHeaders(500, 0);
                ex.getResponseBody().close();
            }
        });
        server.start();
    }
}`,
    csharp: `// Minimal API (.NET 6+). Verify the HMAC-SHA256 signature over the
// raw body before trusting the parsed JSON.
using System.Security.Cryptography;
using System.Text;

var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();
const string webhookSecret = "paste the product's webhook_secret here";

app.MapPost("/lmp-webhook", async (HttpRequest req) =>
{
    using var ms = new MemoryStream();
    await req.Body.CopyToAsync(ms);
    var raw = ms.ToArray(); // raw bytes, exactly as sent
    var expected = Convert.ToHexString(
        HMACSHA256.HashData(Encoding.UTF8.GetBytes(webhookSecret), raw))
        .ToLowerInvariant();
    var sig = req.Headers["X-LMP-Signature"].ToString();
    var ok = sig.Length == expected.Length &&
        CryptographicOperations.FixedTimeEquals(
            Encoding.UTF8.GetBytes(expected), Encoding.UTF8.GetBytes(sig));
    if (!ok) return Results.Unauthorized();
    // event JSON: {"event": "license.expiring", "license_key": "LIC-...", ...}
    return Results.Ok(new { ok = true });
});

app.Run("http://localhost:3000");`,
};

const MODULE_AUTH_CURL = `# Module key — every module request sends X-API-Key (not a JWT):
curl ${BASE}/api/products \\
  -H "X-API-Key: lmp_..."

# Test connection:
curl ${BASE}/api/system/info \\
  -H "X-API-Key: lmp_..."
# => {"version": "3.0.10", "lastUpdated": "2026-11-27"}

# Exception: license checks (POST /api/licenses/validate) are PUBLIC —
# they send NO key at all (see the Guides tab: "Connect a product").

# Failures: 401 unknown/expired/revoked key or bad signature,
# 403 key lacks the scope for this endpoint.`;

const MODULE_AUTH_SIGN = `<?php
// Signed requests: HMAC-SHA256 over
// METHOD + "\\n" + PATH (URL path only, no query) + "\\n"
//   + TIMESTAMP + "\\n" + SHA256(raw request body).hexdigest()
$timestamp = (string) time();
$body = json_encode($data); // '' for GET requests
$message = "POST\\n/api/licenses\\n" . $timestamp . "\\n" . hash('sha256', $body);
$signature = hash_hmac('sha256', $message, hash('sha256', $api_key, true));
// Headers: X-API-Key, X-LMP-Timestamp: $timestamp, X-LMP-Signature: $signature
// The server rejects timestamps older than 5 minutes (and replays) with 401.`;

const ENDPOINTS = [
  ["POST", "/api/auth/login", "docs.ep.authLogin"],
  ["POST", "/api/auth/register", "docs.ep.authRegister"],
  ["POST", "/api/auth/verify-2fa", "docs.ep.authVerify2fa"],
  ["GET", "/api/auth/2fa/status", "docs.ep.twoFaStatus"],
  ["POST", "/api/auth/2fa/setup", "docs.ep.twoFaSetup"],
  ["POST", "/api/auth/2fa/verify", "docs.ep.twoFaVerify"],
  ["POST", "/api/auth/2fa/disable", "docs.ep.twoFaDisable"],
  ["GET", "/api/captcha/config", "docs.ep.captchaPublicConfig"],
  ["POST", "/api/captcha/challenge", "docs.ep.captchaChallenge"],
  ["GET", "/api/products", "docs.ep.productsList"],
  ["POST", "/api/products", "docs.ep.productsCreate"],
  ["GET", "/api/products/{id}", "docs.ep.productsGet"],
  ["PUT", "/api/products/{id}", "docs.ep.productsUpdate"],
  ["DELETE", "/api/products/{id}", "docs.ep.productsDelete"],
  ["POST", "/api/products/{id}/test-webhook", "docs.ep.productsTestWebhook"],
  ["GET", "/api/product-groups", "docs.ep.productGroupsList"],
  ["POST", "/api/product-groups", "docs.ep.productGroupsCreate"],
  ["GET", "/api/blacklist?type=", "docs.ep.blacklistList"],
  ["GET", "/api/notifications", "docs.ep.notificationsList"],
  ["POST", "/api/notifications/{id}/read", "docs.ep.notificationsRead"],
  ["GET", "/api/news", "docs.ep.newsList"],
  ["GET", "/api/downloads", "docs.ep.downloadsList"],
  ["GET", "/api/downloads/{module_id}", "docs.ep.downloadsGet"],
  ["GET", "/api/downloads/versions", "docs.ep.downloadsVersions"],
  ["GET", "/api/licenses?filter=&status=&search=", "docs.ep.licensesList"],
  ["POST", "/api/licenses", "docs.ep.licensesCreate"],
  ["GET", "/api/licenses/{id}", "docs.ep.licensesGet"],
  ["PUT", "/api/licenses/{id}", "docs.ep.licensesUpdate"],
  ["DELETE", "/api/licenses/{id}", "docs.ep.licensesDelete"],
  ["POST", "/api/licenses/{id}/renew", "docs.ep.licensesRenew"],
  ["POST", "/api/licenses/{id}/renew?billing_cycle=", "docs.ep.licenseRenewCycle"],
  ["POST", "/api/licenses/{id}/reissue", "docs.ep.licenseReissue"],
  ["GET", "/api/licenses/{id}/activations", "docs.ep.licenseActivations"],
  ["POST", "/api/licenses/validate", "docs.ep.licensesValidate"],
  ["GET", "/api/api-keys", "docs.ep.apiKeysList"],
  ["POST", "/api/api-keys", "docs.ep.apiKeysCreate"],
  ["GET", "/api/api-keys/check-access", "docs.ep.apiKeysCheckAccess"],
  ["POST", "/api/api-keys/{id}/rotate", "docs.ep.apiKeysRotate"],
  ["GET", "/api/users/me", "docs.ep.usersMe"],
  ["GET", "/api/users", "docs.ep.usersList"],
  ["POST", "/api/users", "docs.ep.usersCreate"],
  ["PUT", "/api/users/{id}", "docs.ep.usersUpdate"],
  ["DELETE", "/api/users/{id}", "docs.ep.usersDelete"],
  ["GET", "/api/roles", "docs.ep.rolesList"],
  ["POST", "/api/roles", "docs.ep.rolesCreate"],
  ["GET", "/api/roles/permissions", "docs.ep.rolesPermissions"],
  ["PUT", "/api/roles/{id}", "docs.ep.rolesUpdate"],
  ["DELETE", "/api/roles/{id}", "docs.ep.rolesDelete"],
  ["GET", "/api/settings", "docs.ep.settingsList"],
  ["PUT", "/api/settings/{key}", "docs.ep.settingsUpdate"],
  ["GET", "/api/settings/notification-texts", "docs.ep.notifTextsGet"],
  ["PUT", "/api/settings/notification-texts", "docs.ep.notifTextsPut"],
  ["GET", "/api/settings/notification-channels", "docs.ep.notifChannelsGet"],
  ["PUT", "/api/settings/notification-channels", "docs.ep.notifChannelsPut"],
  ["GET", "/api/settings/notification-patterns", "docs.ep.notifPatternsGet"],
  ["PUT", "/api/settings/notification-patterns", "docs.ep.notifPatternsPut"],
  ["GET", "/api/settings/captcha-config", "docs.ep.captchaConfigGet"],
  ["PUT", "/api/settings/captcha-config", "docs.ep.captchaConfigPut"],
  ["GET", "/api/sms/balance", "docs.ep.smsBalance"],
  ["POST", "/api/sms/test", "docs.ep.smsTest"],
  ["GET", "/api/system/info", "docs.ep.systemInfo"],
  ["GET", "/api/system/check-updates", "docs.ep.systemCheckUpdates"],
  ["GET", "/api/system/update-check", "docs.ep.updateCheck"],
  ["POST", "/api/system/update", "docs.ep.updateApply"],
  ["POST", "/api/system/check-expiring?days=7", "docs.ep.systemCheckExpiring"],
  ["GET", "/api/webhooks/deliveries?product_id=&limit=50", "docs.ep.webhooksDeliveries"],
  ["GET", "/api/languages", "docs.ep.languagesList"],
  ["GET", "/api/languages/{code}", "docs.ep.languagesGet"],
  ["PUT", "/api/languages/{code}", "docs.ep.languagesUpdate"],
  ["DELETE", "/api/languages/{code}", "docs.ep.languagesDelete"],
  ["GET", "/api/dashboard/summary", "docs.ep.dashboardSummary"],
  ["GET", "/api/dashboard/license-trend?days=14", "docs.ep.dashboardTrend"],
  ["GET", "/api/audit-logs?skip=&limit=&entity=&actor=", "docs.ep.auditLogs"],
  ["GET", "/api/search", "docs.ep.search"],
];

function ApiDocs() {
  const {t} = useLanguage();
  const [tab, setTab] = useState("auth");
  const [sampleLang, setSampleLang] = useState("curl");
  const [sampleOp, setSampleOp] = useState("login");
  const [verifyLang, setVerifyLang] = useState("python");
  // Zero-scroll splits (v3.0): each tab shows one mini-view at a time so
  // the stacked sections + code blocks never push the page.
  const [authView, setAuthView] = useState("auth");
  const [webhooksView, setWebhooksView] = useState("payload");
  const [guidesView, setGuidesView] = useState("connect");
  const [lockingView, setLockingView] = useState("billing");
  const [connectView, setConnectView] = useState("check");
  const [guideLang, setGuideLang] = useState("curl");
  // Endpoint table: paginated (responsive page size, same pattern as the
  // list pages) so the 48-row table never forces a scroll. The size is
  // HEIGHT-aware too: at a short viewport (≤900px, i.e. every phone and
  // most laptop windows) fewer rows fit, so the page shows 6 (3 on a
  // narrow screen) and the pager does the rest.
  const [isNarrow, setIsNarrow] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const onChange = (e) => setIsNarrow(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  const [isShort, setIsShort] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-height: 900px)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(max-height: 900px)");
    const onChange = (e) => setIsShort(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  const pageSize = isNarrow ? 3 : isShort ? 6 : 12;
  const [epPage, setEpPage] = useState(1);
  const epPages = Math.max(1, Math.ceil(ENDPOINTS.length / pageSize));
  const safeEpPage = Math.min(epPage, epPages);
  const epRows = ENDPOINTS.slice((safeEpPage - 1) * pageSize, safeEpPage * pageSize);

  const sampleCode = SAMPLES[sampleOp][sampleLang];
  // The webhook receiver has no cURL form: if the guide language is
  // cURL, the webhook view falls back to Python.
  const webhookGuideLang = WEBHOOK_VERIFY[guideLang] ? guideLang : "python";
  const opNameKey = {login: "docs.sampleLogin", create: "docs.curlCreate", validate: "docs.curlValidate", renew: "docs.curlRenew", checkAccess: "docs.sampleCheckAccess"}[sampleOp];

  return (
    <div className="docs-container page-enter">
      <h1>{t("docs.title")}</h1>
      <p className="docs-subtitle">{t("docs.subtitle")}</p>
      <p className="docs-template-note">{t("docs.templateNote")}</p>

      <TabDropdown
        ariaLabel={t("docs.title")}
        value={tab}
        onChange={setTab}
        options={TABS.map((id) => ({value: id, label: t(`docs.tabs.${id}`), icon: DOC_TAB_ICONS[id]}))}
      />

      {tab === "auth" && (
        <div className="docs-tabpanel">
                    <TabDropdown
            ariaLabel={t("docs.tabs.auth")}
            value={authView}
            onChange={setAuthView}
            options={AUTH_VIEWS.map((v) => ({value: v, label: t(`docs.${v}`)}))}
          />
          {authView === "auth" && (
          <section className="docs-section">
            <h2>{t("docs.auth")}</h2>
            <p>{t("docs.authText")}</p>
            <DocsSample text={`POST /api/auth/login
{"email": "admin@example.com", "password": "..."}
=> {"access_token": "<JWT>", "token_type": "bearer"}

# Then send on every admin-panel call:
Authorization: Bearer <JWT>`} />
          </section>
          )}
          {authView === "apiKeys" && (
          <section className="docs-section">
            <h2>{t("docs.apiKeys")}</h2>
            <p>
              {t("docs.apiKeysText1")}{" "}
              <code>api-key</code>
            </p>
            <DocsSample text={`GET /api/api-keys/check-access
api-key: lmp_...

# Success (200) — the key is valid and one use was recorded:
{"access_rights": ["get_license_info", "renew_license"]}

# Failures:
#  403  Invalid API Key / API Key has expired / Single-use API Key already used
#  403  API Key is restricted to another IP / domain / directory
#  429  Daily request limit exceeded`} />
            <p>{t("docs.apiKeysText2")}</p>
          </section>
          )}
          {authView === "moduleAuth" && (
          <section className="docs-section">
            <h2>{t("docs.moduleAuth")}</h2>
            <p>{t("docs.moduleAuthText1")}</p>
            <p>{t("docs.moduleAuthText2")}</p>
            <p>{t("docs.moduleAuthText3")}</p>
            <DocsSample text={MODULE_AUTH_CURL} label={t("docs.langs.curl")} />
          </section>
          )}
          {authView === "moduleSigning" && (
          <section className="docs-section">
            <h2>{t("docs.moduleAuthSigningTitle")}</h2>
            <DocsSample text={MODULE_AUTH_SIGN} />
            <p>{t("docs.moduleAuthRotation")}</p>
            <p>{t("docs.moduleAuthDropdown")}</p>
            <p>{t("docs.moduleAuthTest")}</p>
          </section>
          )}
        </div>
      )}

      {tab === "endpoints" && (
        <div className="docs-tabpanel">
        <section className="docs-section">
          <h2>{t("docs.endpoints")}</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>{t("docs.method")}</th><th>{t("docs.path")}</th><th>{t("docs.purpose")}</th></tr>
              </thead>
              <tbody>
                {epRows.map(([method, path, purpose]) => (
                  <tr key={method + path}>
                    <td><span className="badge badge-accent">{method}</span></td>
                    <td className="docs-path">{path}</td>
                    <td>{t(purpose)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="docs-pager">
            <button type="button" disabled={safeEpPage <= 1} onClick={() => setEpPage(safeEpPage - 1)}>{t("common.back")}</button>
            <span>{safeEpPage} / {epPages}</span>
            <button type="button" disabled={safeEpPage >= epPages} onClick={() => setEpPage(safeEpPage + 1)}>{t("common.next")}</button>
          </div>
        </section>
        </div>
      )}

      {tab === "samples" && (
        <div className="docs-tabpanel">
        <section className="docs-section">
          <h2>{t("docs.samplesTitle")}</h2>
                    <TabDropdown
            ariaLabel={t("docs.samplesTitle")}
            value={sampleLang}
            onChange={setSampleLang}
            options={SAMPLE_LANGS.map((lang) => ({value: lang, label: t(`docs.langs.${lang}`)}))}
          />
                    <TabDropdown
            ariaLabel={t("docs.samplesTitle")}
            value={sampleOp}
            onChange={setSampleOp}
            options={SAMPLE_OPS.map((op) => ({value: op, label: t({login: "docs.sampleLogin", create: "docs.curlCreate", validate: "docs.curlValidate", renew: "docs.curlRenew", checkAccess: "docs.sampleCheckAccess"}[op])}))}
          />
          <h3>{t(opNameKey)}</h3>
          <p>{t(`docs.sampleOps.${sampleOp}`)}</p>
          <DocsSample text={sampleCode} label={t(`docs.langs.${sampleLang}`)} />
        </section>
        </div>
      )}

      {tab === "webhooks" && (
        <div className="docs-tabpanel">
                    <TabDropdown
            ariaLabel={t("docs.webhooks")}
            value={webhooksView}
            onChange={setWebhooksView}
            options={WEBHOOK_VIEWS.map((v) => ({value: v, label: t(`docs.webhookView.${v}`)}))}
          />
          {webhooksView === "payload" && (
          <section className="docs-section">
            <h2>{t("docs.webhooks")}</h2>
            <p>{t("docs.webhooksText")}</p>
            <DocsSample text={WEBHOOK_PAYLOAD} label="JSON" />
          </section>
          )}
          {webhooksView === "verify" && (
          <section className="docs-section">
            <h3>{t("docs.verifyTitle")}</h3>
            <p>{t("docs.verifyHint")}</p>
                        <TabDropdown
              ariaLabel={t("docs.verifyTitle")}
              value={verifyLang}
              onChange={setVerifyLang}
              options={VERIFY_LANGS.map((lang) => ({value: lang, label: t(`docs.langs.${lang}`)}))}
            />
            <DocsSample text={WEBHOOK_VERIFY[verifyLang]} label={t(`docs.langs.${verifyLang}`)} />
          </section>
          )}
          {webhooksView === "cron" && (
          <section className="docs-section">
            <h3>{t("docs.webhookView.cron")}</h3>
            <p>{t("docs.webhooksCronText")}</p>
            <DocsSample text={`curl -X POST "${BASE}/api/system/check-expiring?days=7" \\
  -H "Authorization: Bearer <JWT>"
# => {"expiring_notified": 2, "expired_notified": 1}`} label={t("docs.langs.curl")} />
          </section>
          )}
        </div>
      )}

      {tab === "guides" && (
        <div className="docs-tabpanel">
                    <TabDropdown
            ariaLabel={t("docs.tabs.guides")}
            value={guidesView}
            onChange={setGuidesView}
            options={GUIDES_VIEWS.map((v) => ({value: v, label: t(`docs.guideView.${v}`)}))}
          />
          {guidesView === "connect" && (
          <section className="docs-section">
            <h2>{t("docs.connectTitle")}</h2>
            <p>{t("docs.connectIntro")}</p>
                        <TabDropdown
              ariaLabel={t("docs.connectTitle")}
              value={connectView}
              onChange={setConnectView}
              options={CONNECT_VIEWS.map((v) => ({value: v, label: t(`docs.connectView.${v}`)}))}
            />
            {connectView === "check" && (
              <>
                <h3>{t("docs.connectCheckTitle")}</h3>
                <p>{t("docs.connectCheckText")}</p>
                                <TabDropdown
                  ariaLabel={t("docs.connectCheckTitle")}
                  value={guideLang}
                  onChange={setGuideLang}
                  options={GUIDE_LANGS.map((lang) => ({value: lang, label: t(`docs.langs.${lang}`)}))}
                />
                <DocsSample text={SAMPLES.validate[guideLang]} label={t(`docs.langs.${guideLang}`)} />
              </>
            )}
            {connectView === "response" && (
              <>
                <h3>{t("docs.connectResponseTitle")}</h3>
                <p>{t("docs.connectResponseText")}</p>
                <DocsSample text={`{"valid": true, "detail": "License is valid",
 "license": {"product": "CloudPanel Pro", "product_id": 1,
             "billing_cycle": "annual", "status": "active",
             "expires_at": "2027-11-26T00:00:00Z",
             "max_activations": 5, "activations": 1},
 "grace": false, "warnings": []}

// "license" holds only these 7 fields (v3.0.6) — never the key,
// the owner email or the lock lists.
{"valid": false, "detail": "License has expired",
 "license": {"product": "CloudPanel Pro", "product_id": 1,
             "billing_cycle": "annual", "status": "expired",
             "expires_at": "2025-11-26T00:00:00Z",
             "max_activations": 5, "activations": 1},
 "grace": false, "warnings": []}

{"valid": false, "detail": "blocked: blacklisted", "license": null,
 "grace": false, "warnings": []}

// Lenient mode: a lock mismatch still validates, but flagged:
{"valid": true, "detail": "License is valid (grace)",
 "license": {"product": "CloudPanel Pro", "product_id": 1,
             "billing_cycle": "annual", "status": "active",
             "expires_at": "2027-11-26T00:00:00Z",
             "max_activations": 5, "activations": 1},
 "grace": true, "warnings": ["domain mismatch (grace)"]}`} label="JSON" />
              </>
            )}
            {connectView === "webhook" && (
              <>
                <h3>{t("docs.connectWebhookTitle")}</h3>
                <p>{t("docs.connectWebhookText")}</p>
                                <TabDropdown
                  ariaLabel={t("docs.connectWebhookTitle")}
                  value={webhookGuideLang}
                  onChange={setGuideLang}
                  options={GUIDE_LANGS.filter((lang) => WEBHOOK_VERIFY[lang]).map((lang) => ({value: lang, label: t(`docs.langs.${lang}`)}))}
                />
                <DocsSample text={WEBHOOK_VERIFY[webhookGuideLang]} label={t(`docs.langs.${webhookGuideLang}`)} />
              </>
            )}
            <p>{t("docs.connectNote")}</p>
          </section>
          )}
          {guidesView === "locking" && (
          <section className="docs-section">
            <h2>{t("docs.locking")}</h2>
                        <TabDropdown
              ariaLabel={t("docs.locking")}
              value={lockingView}
              onChange={setLockingView}
              options={LOCKING_VIEWS.map((v) => ({value: v, label: t(`docs.lockingView.${v}`)}))}
            />
            {lockingView === "billing" && <p>{t("docs.lockingText1")}</p>}
            {lockingView === "locks" && <p>{t("docs.lockingText2")}</p>}
          </section>
          )}
          {guidesView === "billing" && (
          <section className="docs-section">
            <h2>{t("docs.billingSyncTitle")}</h2>
            <p>{t("docs.billingSyncText")}</p>
            <DocsSample text={`POST /api/licenses/1/renew?billing_cycle=annual
# Switches the license to a new cycle and extends expiry by it.
# A valid cycle missing from the product is added automatically.
# Unknown cycles are rejected with 422; lifetime renewals return 400.`} />
          </section>
          )}
          {guidesView === "modules" && (
          <section className="docs-section">
            <h2>{t("docs.modulesTitle")}</h2>
            <p>
              {t("docs.modulesPointer")}{" "}
              <Link to="/downloads">{t("nav.downloads")}</Link>
            </p>
          </section>
          )}
        </div>
      )}
    </div>
  );
}

export default ApiDocs;
