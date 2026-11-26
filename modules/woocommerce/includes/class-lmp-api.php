<?php
/**
 * License Manager Pro — WooCommerce API client.
 *
 * Model layer: the ONLY place that talks HTTP to License Manager Pro.
 * No other file in this plugin makes HTTP calls.
 *
 * Authentication is a single module-scoped API key (X-API-Key header).
 * There is no username, no login call, no cached JWT and no stored
 * admin credential of any kind. The key is created in the License
 * Manager Pro panel (API Keys page, module-key toggle, 30/90/180/365
 * -day expiry) and pasted once into the plugin settings.
 *
 * Optional signed requests: when enabled, every request also carries
 * X-LMP-Timestamp (unix seconds) + X-LMP-Signature, where
 *   signature = HMAC-SHA256(key = raw bytes of SHA256(secret), message)
 *   message   = METHOD + "\n" + PATH (URL path only, no query) + "\n"
 *             + TIMESTAMP + "\n" + SHA256(raw request body).hexdigest()
 * The server rejects timestamps older than 5 minutes and bad signatures
 * with 401 (constant-time compare).
 *
 * TLS verification is ALWAYS on ('sslverify' => true). A 401/403 fails
 * CLOSED: the call returns a WP_Error, and the caller must not mint,
 * change or report a license for that request.
 */

if (!defined('ABSPATH')) {
    exit;
}

class LMP_Api
{
    /** The six billing cycles License Manager Pro understands. */
    const BILLING_CYCLES = array(
        'monthly',
        'quarterly',
        'semiannual',
        'annual',
        'biennial',
        'lifetime',
    );

    const DEFAULT_TIMEOUT_SECONDS = 15;

    /** Server-side replay window for signed requests (5 minutes). */
    const SIGNATURE_MAX_AGE_SECONDS = 300;

    /** @var string */
    private $base_url;
    /** @var string Module-scoped API key (the secret, never logged) */
    private $api_key;
    /** @var bool Whether to HMAC-sign every request */
    private $signed_requests;

    public function __construct($base_url, $api_key, $signed_requests = false)
    {
        $normalized = rtrim(trim((string) $base_url), '/');
        if ($normalized !== '' && substr($normalized, -4) !== '/api') {
            $normalized .= '/api';
        }
        $this->base_url = $normalized;
        $this->api_key = trim((string) $api_key);
        $this->signed_requests = (bool) $signed_requests;
    }

    /**
     * True when an API URL and an API key are both configured.
     */
    public function is_configured()
    {
        return $this->base_url !== '' && $this->api_key !== '';
    }

    /**
     * GET /system/info — used by Test Connection. Returns the info
     * array (with 'version'), or a WP_Error.
     */
    public function get_system_info()
    {
        return $this->get('/system/info');
    }

    /**
     * GET /products — the full product list (up to 100, the backend's
     * page size). Returns the decoded array, or a WP_Error.
     */
    public function list_products()
    {
        return $this->get('/products?limit=100');
    }

    public function get($path)
    {
        return $this->request('GET', $path);
    }

    public function post($path, $data = array(), $public = false)
    {
        return $this->request('POST', $path, $data, $public);
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
    public function sign($method, $url, $timestamp, $raw_body)
    {
        $path = (string) parse_url($url, PHP_URL_PATH);
        $body_hash = hash('sha256', $raw_body);
        $message = strtoupper($method) . "\n" . $path . "\n" . $timestamp . "\n" . $body_hash;
        $hmac_key = hash('sha256', $this->api_key, true);
        return hash_hmac('sha256', $message, $hmac_key);
    }

    /**
     * One HTTP call. Returns the decoded body array on HTTP 2xx, or a
     * WP_Error with a readable message otherwise. A 401/403 always
     * fails closed with a clear message and is written to the PHP
     * error log; nothing is created or changed on the backend.
     *
     * $public = true marks a PUBLIC endpoint (POST /licenses/validate):
     * no X-API-Key header and no HMAC signature are sent — the license
     * check is open to any server, and the blacklist still applies
     * server-side. Every other endpoint sends the module key.
     */
    private function request($method, $path, $data = null, $public = false)
    {
        if (!$this->is_configured()) {
            return new WP_Error(
                'lmp_not_configured',
                'License Manager Pro is not configured yet. Add the API URL and module API key in WooCommerce → License Manager Pro.'
            );
        }

        $url = $this->base_url . $path;
        $raw_body = ($data !== null) ? (string) wp_json_encode($data) : '';
        $headers = array(
            'Content-Type' => 'application/json',
            'Accept' => 'application/json',
        );
        if (!$public) {
            $headers['X-API-Key'] = $this->api_key;
        }
        if ($this->signed_requests && !$public) {
            $timestamp = (string) time();
            $headers['X-LMP-Timestamp'] = $timestamp;
            $headers['X-LMP-Signature'] = $this->sign($method, $url, $timestamp, $raw_body);
        }

        $args = array(
            'method' => $method,
            'headers' => $headers,
            'timeout' => self::DEFAULT_TIMEOUT_SECONDS,
            // TLS verification is never disabled: a plugin that talks
            // to a licensing backend must not accept a forged cert.
            'sslverify' => true,
        );
        if ($raw_body !== '') {
            $args['body'] = $raw_body;
        }

        $response = wp_remote_request($url, $args);
        if (is_wp_error($response)) {
            return $response;
        }

        $code = (int) wp_remote_retrieve_response_code($response);
        $body = json_decode(wp_remote_retrieve_body($response), true);

        if ($code === 401 || $code === 403) {
            error_log(
                'License Manager Pro: API request rejected (HTTP ' . $code . '). No license was created or changed.'
            );
            return new WP_Error(
                'lmp_auth',
                'License Manager Pro rejected the request (HTTP ' . $code
                . '). Check the module API key, its expiry date, and whether signed requests are required for this key.'
            );
        }
        if ($code < 200 || $code >= 300) {
            $detail = '';
            if (is_array($body) && isset($body['detail'])) {
                $detail = is_string($body['detail']) ? $body['detail'] : wp_json_encode($body['detail']);
            }
            return new WP_Error(
                'lmp_http_' . $code,
                'License Manager Pro returned HTTP ' . $code . ($detail !== '' ? ': ' . $detail : '')
            );
        }
        return is_array($body) ? $body : array();
    }

    /**
     * Resolve a product slug to its License Manager Pro product id.
     * Returns the product array, or a WP_Error.
     */
    public function find_product_by_slug($slug)
    {
        $list = $this->get('/products?slug=' . rawurlencode($slug));
        if (is_wp_error($list)) {
            return $list;
        }
        if (is_array($list) && count($list) === 1) {
            return $list[0];
        }
        return new WP_Error('lmp_product', 'License Manager Pro product "' . $slug . '" was not found.');
    }

    /**
     * Create a license for a product id + billing cycle.
     * Returns the license array, or a WP_Error.
     */
    public function create_license($product_id, $billing_cycle, $owner_email = null)
    {
        return $this->post('/licenses', array(
            'product_id' => (int) $product_id,
            'billing_cycle' => $billing_cycle,
            'owner_email' => $owner_email,
        ));
    }

    /**
     * Validate a license key (optionally with the site domain).
     * PUBLIC endpoint (v3.0): POST /licenses/validate sends no API key
     * and no signature — the check is open to any server; the blacklist
     * still applies server-side. Returns
     * array('valid' => bool, 'detail' => string, 'license' => ...).
     */
    public function validate_license($key, $domain = null)
    {
        $body = array('key' => $key);
        if ($domain) {
            $body['domain'] = $domain;
        }
        return $this->post('/licenses/validate', $body, true);
    }
}
