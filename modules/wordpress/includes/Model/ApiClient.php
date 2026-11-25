<?php
/**
 * License Manager Pro — WordPress (without WooCommerce).
 *
 * Model layer: HTTP client for the License Manager Pro API.
 *
 * Authentication is a single scoped module API key (X-API-Key header).
 * No username/password is ever stored or sent. TLS verification is
 * always on. Requests that the backend rejects with 401/403 fail
 * closed: no license is created or changed and a WP_Error is returned.
 */

declare(strict_types=1);

namespace LicenseManagerPro\WordPress\Model;

if (!defined('ABSPATH')) {
    exit;
}

final class ApiClient
{
    /** The six billing cycles License Manager Pro understands. */
    public const BILLING_CYCLES = array(
        'monthly',
        'quarterly',
        'semiannual',
        'annual',
        'biennial',
        'lifetime',
    );

    public const DEFAULT_TIMEOUT_SECONDS = 15;

    /** Server-side replay window for signed requests (5 minutes). */
    public const SIGNATURE_MAX_AGE_SECONDS = 300;

    private const HEADER_API_KEY = 'X-API-Key';
    private const HEADER_TIMESTAMP = 'X-LMP-Timestamp';
    private const HEADER_SIGNATURE = 'X-LMP-Signature';

    private string $base_url;
    private string $api_key;
    private bool $signed_requests;

    public function __construct(string $base_url, string $api_key, bool $signed_requests)
    {
        $normalized = rtrim(trim($base_url), '/');
        if ($normalized !== '' && !str_ends_with($normalized, '/api')) {
            $normalized .= '/api';
        }
        $this->base_url = $normalized;
        $this->api_key = trim($api_key);
        $this->signed_requests = $signed_requests;
    }

    public function isConfigured(): bool
    {
        return $this->base_url !== '' && $this->api_key !== '';
    }

    public function getSystemInfo(): array|\WP_Error
    {
        return $this->request('GET', '/system/info');
    }

    public function listProducts(?string $slug = null): array|\WP_Error
    {
        $path = '/products';
        if ($slug !== null && $slug !== '') {
            $path .= '?slug=' . rawurlencode($slug);
        }
        return $this->request('GET', $path);
    }

    public function findProductBySlug(string $slug): array|\WP_Error
    {
        $list = $this->listProducts($slug);
        if (is_wp_error($list)) {
            return $list;
        }
        if (is_array($list) && count($list) === 1) {
            return $list[0];
        }
        return new \WP_Error(
            'lmp_product',
            sprintf('License Manager Pro product "%s" was not found.', $slug)
        );
    }

    public function listLicensesByEmail(string $email): array|\WP_Error
    {
        return $this->request('GET', '/licenses?search=' . rawurlencode($email));
    }

    public function getLicense(int $license_id): array|\WP_Error
    {
        return $this->request('GET', '/licenses/' . $license_id);
    }

    public function createLicense(
        int $product_id,
        ?string $billing_cycle,
        string $owner_email,
        ?string $license_key = null
    ): array|\WP_Error {
        $body = array(
            'product_id' => $product_id,
            'owner_email' => $owner_email,
        );
        if ($billing_cycle !== null && $billing_cycle !== '') {
            $body['billing_cycle'] = $billing_cycle;
        }
        if ($license_key !== null && $license_key !== '') {
            $body['key'] = $license_key;
        }
        return $this->request('POST', '/licenses', $body);
    }

    public function updateLicenseStatus(int $license_id, string $status): array|\WP_Error
    {
        return $this->request('PUT', '/licenses/' . $license_id, array('status' => $status));
    }

    public function revokeLicense(int $license_id): array|\WP_Error
    {
        return $this->request('DELETE', '/licenses/' . $license_id);
    }

    public function renewLicense(int $license_id, ?string $billing_cycle = null): array|\WP_Error
    {
        $path = '/licenses/' . $license_id . '/renew';
        if ($billing_cycle !== null && $billing_cycle !== '') {
            $path .= '?billing_cycle=' . rawurlencode($billing_cycle);
        }
        return $this->request('POST', $path);
    }

    public function validateLicense(
        string $license_key,
        ?string $domain = null,
        ?string $ip = null,
        ?string $install_path = null
    ): array|\WP_Error {
        $body = array('key' => $license_key);
        if ($domain !== null && $domain !== '') {
            $body['domain'] = $domain;
        }
        if ($ip !== null && $ip !== '') {
            $body['ip'] = $ip;
        }
        if ($install_path !== null && $install_path !== '') {
            $body['install_path'] = $install_path;
        }
        return $this->request('POST', '/licenses/validate', $body);
    }

    /**
     * One HTTP call. Returns the decoded body array on HTTP 2xx, or a
     * WP_Error otherwise. A 401/403 always fails closed with a clear
     * message and is written to the PHP error log; nothing is created
     * or changed on the backend in that case.
     */
    private function request(string $method, string $path, ?array $data = null): array|\WP_Error
    {
        if (!$this->isConfigured()) {
            return new \WP_Error(
                'lmp_not_configured',
                'License Manager Pro is not configured yet. Add the API URL and module API key in Settings → License Manager Pro.'
            );
        }

        $url = $this->base_url . $path;
        $raw_body = $data !== null ? (string) wp_json_encode($data) : '';
        $headers = array(
            'Content-Type' => 'application/json',
            'Accept' => 'application/json',
            self::HEADER_API_KEY => $this->api_key,
        );
        if ($this->signed_requests) {
            $timestamp = (string) time();
            $headers[self::HEADER_TIMESTAMP] = $timestamp;
            $headers[self::HEADER_SIGNATURE] = $this->sign($method, $url, $timestamp, $raw_body);
        }

        $args = array(
            'method' => $method,
            'headers' => $headers,
            'timeout' => self::DEFAULT_TIMEOUT_SECONDS,
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
        $decoded = json_decode((string) wp_remote_retrieve_body($response), true);

        if ($code === 401 || $code === 403) {
            error_log(
                'License Manager Pro: API request rejected (HTTP ' . $code . '). No license was created or changed.'
            );
            return new \WP_Error(
                'lmp_auth',
                'License Manager Pro rejected the request (HTTP ' . $code
                . '). Check the module API key, its expiry date, and whether signed requests are required for this key.'
            );
        }
        if ($code < 200 || $code >= 300) {
            $detail = '';
            if (is_array($decoded) && isset($decoded['detail'])) {
                $detail = is_string($decoded['detail'])
                    ? $decoded['detail']
                    : (string) wp_json_encode($decoded['detail']);
            }
            return new \WP_Error(
                'lmp_http_' . $code,
                'License Manager Pro returned HTTP ' . $code . ($detail !== '' ? ': ' . $detail : '.')
            );
        }

        return is_array($decoded) ? $decoded : array();
    }

    /**
     * HMAC signature for signed requests.
     * message = METHOD + "\n" + PATH (URL path only, no query) + "\n"
     *         + TIMESTAMP + "\n" + SHA256(raw request body).hexdigest()
     * HMAC key = raw bytes of SHA256(secret).
     */
    private function sign(string $method, string $url, string $timestamp, string $raw_body): string
    {
        $path = (string) parse_url($url, PHP_URL_PATH);
        $body_hash = hash('sha256', $raw_body);
        $message = strtoupper($method) . "\n" . $path . "\n" . $timestamp . "\n" . $body_hash;
        $hmac_key = hash('sha256', $this->api_key, true);
        return hash_hmac('sha256', $message, $hmac_key);
    }
}
