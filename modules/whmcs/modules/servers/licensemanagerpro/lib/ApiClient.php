<?php
/**
 * License Manager Pro — WHMCS server module API client.
 *
 * Model layer: the ONLY place that talks HTTP to License Manager Pro.
 * No other file in this module makes HTTP calls.
 *
 * Authentication is a single module-scoped API key (X-API-Key header).
 * There is no username, no login call and no stored admin credential of
 * any kind. The key is created in the License Manager Pro panel
 * (API Keys page, module-key toggle, 30/90/180/365-day expiry) and
 * pasted once into the product's module settings.
 *
 * Optional signed requests: when enabled, every request also carries
 * X-LMP-Timestamp (unix seconds) + X-LMP-Signature, where
 *   signature = HMAC-SHA256(key = raw bytes of SHA256(secret), message)
 *   message   = METHOD + "\n" + PATH (URL path only, no query) + "\n"
 *             + TIMESTAMP + "\n" + SHA256(raw request body).hexdigest()
 * The server rejects timestamps older than 5 minutes and bad signatures
 * with 401 (constant-time compare).
 *
 * TLS verification is ALWAYS on (CURLOPT_SSL_VERIFYPEER /
 * CURLOPT_SSL_VERIFYHOST are never disabled). A 401/403 fails CLOSED:
 * the call returns null, $lastError explains the rejection, and the
 * caller must not mint, change or report a license for that request.
 *
 * Requires PHP with the cURL extension. No other dependencies.
 */

if (!defined('WHMCS')) {
    die('This file cannot be accessed directly');
}

class LMP_ApiClient
{
    /** @var string Base URL of the License Manager Pro API, e.g. https://license.example.com/api */
    private $baseUrl;
    /** @var string Module-scoped API key (the secret, never logged) */
    private $apiKey;
    /** @var bool Whether to HMAC-sign every request */
    private $signedRequests;
    /** @var string Last error message, for the module to return to WHMCS */
    public $lastError = '';
    /** @var int HTTP status of the last call (0 when no HTTP call was made) */
    public $lastHttpCode = 0;

    /** Server-side replay window for signed requests (5 minutes). */
    const SIGNATURE_MAX_AGE_SECONDS = 300;

    public function __construct($baseUrl, $apiKey, $signedRequests = false)
    {
        $normalized = rtrim(trim((string) $baseUrl), '/');
        if ($normalized !== '' && substr($normalized, -4) !== '/api') {
            $normalized .= '/api';
        }
        $this->baseUrl = $normalized;
        $this->apiKey = trim((string) $apiKey);
        $this->signedRequests = (bool) $signedRequests;
    }

    /**
     * True when an API URL and an API key are both configured.
     */
    public function isConfigured()
    {
        return $this->baseUrl !== '' && $this->apiKey !== '';
    }

    /**
     * The normalized API base URL (used only to scope the product-list
     * cache to one backend).
     */
    public function getBaseUrl()
    {
        return $this->baseUrl;
    }

    /**
     * A SHA-256 fingerprint of the API key (used only to scope the
     * product-list cache to one key). The key itself is never exposed.
     */
    public function getApiKeyFingerprint()
    {
        return hash('sha256', $this->apiKey);
    }

    /**
     * GET /system/info — used by TestConnection. Returns the info array
     * (with 'version') or null on failure (see $lastError).
     */
    public function getSystemInfo()
    {
        return $this->get('/system/info');
    }

    /**
     * GET /products — the full product list (up to 100, the backend's
     * page size). Returns the decoded array or null on failure.
     */
    public function listProducts()
    {
        return $this->get('/products?limit=100');
    }

    public function get($path)
    {
        return $this->request('GET', $path);
    }

    public function post($path, $data = array())
    {
        return $this->request('POST', $path, $data);
    }

    public function put($path, $data = array())
    {
        return $this->request('PUT', $path, $data);
    }

    public function delete($path)
    {
        return $this->request('DELETE', $path);
    }

    /**
     * HMAC signature for signed requests.
     * message = METHOD + "\n" + PATH (URL path only, no query) + "\n"
     *         + TIMESTAMP + "\n" + SHA256(raw request body).hexdigest()
     * HMAC key = raw bytes of SHA256(secret).
     */
    public function sign($method, $url, $timestamp, $rawBody)
    {
        $path = (string) parse_url($url, PHP_URL_PATH);
        $bodyHash = hash('sha256', $rawBody);
        $message = strtoupper($method) . "\n" . $path . "\n" . $timestamp . "\n" . $bodyHash;
        $hmacKey = hash('sha256', $this->apiKey, true);
        return hash_hmac('sha256', $message, $hmacKey);
    }

    /**
     * One HTTP call. Returns the decoded JSON body (array) on HTTP 2xx,
     * null on failure (see $this->lastError / $this->lastHttpCode).
     * A 401/403 always fails closed with a clear message.
     */
    private function request($method, $path, $data = null)
    {
        $this->lastError = '';
        $this->lastHttpCode = 0;
        if (!$this->isConfigured()) {
            $this->lastError = 'License Manager Pro is not configured yet: '
                . 'set the API URL and the module API key in the product\'s module settings.';
            return null;
        }
        $url = $this->baseUrl . $path;
        $rawBody = ($data !== null) ? (string) json_encode($data) : '';
        $headers = array('Content-Type: application/json', 'Accept: application/json');
        $headers[] = 'X-API-Key: ' . $this->apiKey;
        if ($this->signedRequests) {
            $timestamp = (string) time();
            $headers[] = 'X-LMP-Timestamp: ' . $timestamp;
            $headers[] = 'X-LMP-Signature: ' . $this->sign($method, $url, $timestamp, $rawBody);
        }
        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 15);
        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
        // TLS verification is never disabled: a module that talks to a
        // licensing backend must not accept a forged certificate.
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
        curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 2);
        if ($rawBody !== '') {
            curl_setopt($ch, CURLOPT_POSTFIELDS, $rawBody);
        }
        $raw = curl_exec($ch);
        $httpCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);
        $this->lastHttpCode = $httpCode;

        if ($raw === false || $curlError !== '') {
            $this->lastError = 'Could not reach License Manager Pro: ' . $curlError;
            return null;
        }
        $decoded = json_decode($raw, true);
        if ($httpCode === 401 || $httpCode === 403) {
            // Fail closed: the key is wrong, expired, revoked, missing
            // the needed scope, or the signature was rejected. Nothing
            // was created or changed on the backend for this call.
            if (function_exists('logModuleCall')) {
                logModuleCall('licensemanagerpro', __FUNCTION__, $method . ' ' . $path, '', 'HTTP ' . $httpCode . ' — request rejected, failing closed', '');
            }
            $this->lastError = 'License Manager Pro rejected the request (HTTP ' . $httpCode . '). '
                . 'Check the module API key, its expiry date, and whether signed requests are required for this key. '
                . 'No license was created or changed.';
            return null;
        }
        if ($httpCode < 200 || $httpCode >= 300) {
            $detail = '';
            if (is_array($decoded) && isset($decoded['detail'])) {
                $detail = is_string($decoded['detail']) ? $decoded['detail'] : json_encode($decoded['detail']);
            }
            $this->lastError = 'License Manager Pro returned HTTP ' . $httpCode
                . ($detail !== '' ? ': ' . $detail : '');
            return null;
        }
        return is_array($decoded) ? $decoded : array();
    }
}
