<?php
/**
 * License Manager Pro — PrestaShop API client.
 *
 * Talks to the License Manager Pro REST API using a single scoped module
 * API key. No admin email or password is ever used. TLS verification is
 * always on. Authentication failures (401/403) fail closed: the caller
 * gets an error result and no license is minted.
 */

declare(strict_types=1);

if (!defined('_PS_VERSION_')) {
    exit;
}

class LmpApiClient
{
    public const HEADER_API_KEY = 'X-API-Key';
    public const HEADER_TIMESTAMP = 'X-LMP-Timestamp';
    public const HEADER_SIGNATURE = 'X-LMP-Signature';

    public const SIGNATURE_MAX_AGE_SECONDS = 300;
    public const REQUEST_TIMEOUT_SECONDS = 15;

    public const HTTP_OK = 200;
    public const HTTP_CREATED = 201;
    public const HTTP_UNAUTHORIZED = 401;
    public const HTTP_FORBIDDEN = 403;

    /** License Manager Pro billing cycles. */
    public const VALID_BILLING_CYCLES = [
        'monthly',
        'quarterly',
        'semiannual',
        'annual',
        'biennial',
        'lifetime',
    ];

    public const DEFAULT_BILLING_CYCLE = 'annual';

    private string $baseUrl;
    private string $apiKey;
    private bool $signedRequests;

    public function __construct(string $baseUrl, string $apiKey, bool $signedRequests)
    {
        $this->baseUrl = rtrim($baseUrl, '/');
        $this->apiKey = $apiKey;
        $this->signedRequests = $signedRequests;
    }

    public static function fromConfiguration(): self
    {
        return new self(
            (string) Configuration::get('LMP_API_URL'),
            (string) Configuration::get('LMP_API_KEY'),
            (bool) Configuration::get('LMP_SIGNED_REQUESTS')
        );
    }

    public function isConfigured(): bool
    {
        return $this->baseUrl !== '' && $this->apiKey !== '';
    }

    /**
     * Test the connection against GET /system/info.
     *
     * @return array{ok: bool, status: int, error: string, data: mixed}
     */
    public function testConnection(): array
    {
        return $this->request('GET', '/system/info');
    }

    /**
     * @return array{ok: bool, status: int, error: string, data: mixed}
     */
    public function listProducts(): array
    {
        return $this->request('GET', '/products');
    }

    /**
     * @return array{ok: bool, status: int, error: string, data: mixed}
     */
    public function findProductBySlug(string $slug): array
    {
        $result = $this->request('GET', '/products', ['slug' => $slug]);
        if (!$result['ok']) {
            return $result;
        }
        $products = $result['data'];
        if (!is_array($products) || count($products) !== 1) {
            return [
                'ok' => false,
                'status' => 0,
                'error' => 'License Manager Pro product "' . $slug . '" was not found.',
                'data' => null,
            ];
        }

        return ['ok' => true, 'status' => $result['status'], 'error' => '', 'data' => $products[0]];
    }

    /**
     * Create a license. $billingCycle must be a known LMP cycle or null,
     * in which case it is omitted and the backend applies its default.
     *
     * @return array{ok: bool, status: int, error: string, data: mixed}
     */
    public function createLicense(
        ?int $productId,
        ?string $productSlug,
        string $ownerEmail,
        ?string $billingCycle = null,
        ?string $licenseKey = null
    ): array {
        $payload = ['owner_email' => $ownerEmail];
        if ($productId !== null) {
            $payload['product_id'] = $productId;
        }
        if ($productSlug !== null) {
            $payload['product_slug'] = $productSlug;
        }
        if ($billingCycle !== null && in_array($billingCycle, self::VALID_BILLING_CYCLES, true)) {
            $payload['billing_cycle'] = $billingCycle;
        }
        if ($licenseKey !== null && $licenseKey !== '') {
            $payload['license_key'] = $licenseKey;
        }

        return $this->request('POST', '/licenses', [], $payload);
    }

    /**
     * @return array{ok: bool, status: int, error: string, data: mixed}
     */
    public function listLicensesByEmail(string $email): array
    {
        return $this->request('GET', '/licenses', ['search' => $email]);
    }

    /**
     * @return array{ok: bool, status: int, error: string, data: mixed}
     */
    public function getLicense(int $licenseId): array
    {
        return $this->request('GET', '/licenses/' . $licenseId);
    }

    /**
     * @return array{ok: bool, status: int, error: string, data: mixed}
     */
    public function setLicenseStatus(int $licenseId, string $status): array
    {
        return $this->request('PUT', '/licenses/' . $licenseId, [], ['status' => $status]);
    }

    /**
     * @return array{ok: bool, status: int, error: string, data: mixed}
     */
    public function revokeLicense(int $licenseId): array
    {
        return $this->request('DELETE', '/licenses/' . $licenseId);
    }

    /**
     * @return array{ok: bool, status: int, error: string, data: mixed}
     */
    public function renewLicense(int $licenseId, ?string $billingCycle = null): array
    {
        $payload = [];
        if ($billingCycle !== null && in_array($billingCycle, self::VALID_BILLING_CYCLES, true)) {
            $payload['billing_cycle'] = $billingCycle;
        }

        return $this->request('POST', '/licenses/' . $licenseId . '/renew', [], $payload);
    }

    /**
     * @return array{ok: bool, status: int, error: string, data: mixed}
     */
    public function validateLicense(
        string $licenseKey,
        ?string $domain = null,
        ?string $ip = null,
        ?string $installPath = null
    ): array {
        $payload = ['license_key' => $licenseKey];
        if ($domain !== null && $domain !== '') {
            $payload['domain'] = $domain;
        }
        if ($ip !== null && $ip !== '') {
            $payload['ip'] = $ip;
        }
        if ($installPath !== null && $installPath !== '') {
            $payload['install_path'] = $installPath;
        }

        return $this->request('POST', '/licenses/validate', [], $payload);
    }

    /**
     * One HTTP call. Returns a result array; on any failure 'ok' is false
     * and 'error' explains it. 401/403 are reported as authentication
     * failures so callers can fail closed.
     *
     * @param array<string, string> $query
     * @param array<string, mixed>|null $data
     *
     * @return array{ok: bool, status: int, error: string, data: mixed}
     */
    private function request(string $method, string $path, array $query = [], ?array $data = null): array
    {
        if (!$this->isConfigured()) {
            return [
                'ok' => false,
                'status' => 0,
                'error' => 'License Manager Pro is not configured: set the API URL and API key.',
                'data' => null,
            ];
        }

        $body = $data !== null ? (string) json_encode($data) : '';
        $url = $this->baseUrl . '/api' . $path;
        if ($query !== []) {
            $url .= '?' . http_build_query($query);
        }

        $headers = ['Content-Type: application/json', 'Accept: application/json'];
        foreach ($this->buildAuthHeaders($method, $path, $body) as $name => $value) {
            $headers[] = $name . ': ' . $value;
        }

        $curl = curl_init($url);
        if ($curl === false) {
            return ['ok' => false, 'status' => 0, 'error' => 'Could not initialise the HTTP client.', 'data' => null];
        }
        curl_setopt($curl, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($curl, CURLOPT_TIMEOUT, self::REQUEST_TIMEOUT_SECONDS);
        curl_setopt($curl, CURLOPT_CUSTOMREQUEST, $method);
        curl_setopt($curl, CURLOPT_HTTPHEADER, $headers);
        // TLS verification must never be disabled.
        curl_setopt($curl, CURLOPT_SSL_VERIFYPEER, true);
        curl_setopt($curl, CURLOPT_SSL_VERIFYHOST, 2);
        if ($body !== '') {
            curl_setopt($curl, CURLOPT_POSTFIELDS, $body);
        }

        $rawResponse = curl_exec($curl);
        $curlError = curl_error($curl);
        $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
        curl_close($curl);

        if ($rawResponse === false) {
            return [
                'ok' => false,
                'status' => 0,
                'error' => 'Connection to License Manager Pro failed: ' . $curlError,
                'data' => null,
            ];
        }

        $decoded = json_decode((string) $rawResponse, true);

        if ($status === self::HTTP_UNAUTHORIZED || $status === self::HTTP_FORBIDDEN) {
            return [
                'ok' => false,
                'status' => $status,
                'error' => 'Authentication failed (HTTP ' . $status
                    . '): the module API key was rejected. No license was created.',
                'data' => null,
            ];
        }

        if ($status < self::HTTP_OK || $status >= 300) {
            $detail = '';
            if (is_array($decoded) && isset($decoded['detail'])) {
                $detail = is_string($decoded['detail']) ? $decoded['detail'] : (string) json_encode($decoded['detail']);
            }
            $message = 'License Manager Pro returned HTTP ' . $status;
            if ($detail !== '') {
                $message .= ': ' . $detail;
            }

            return ['ok' => false, 'status' => $status, 'error' => $message, 'data' => null];
        }

        return ['ok' => true, 'status' => $status, 'error' => '', 'data' => $decoded];
    }

    /**
     * Build the auth headers. When signed requests are enabled, adds
     * X-LMP-Timestamp and X-LMP-Signature:
     *   signature = hex(HMAC-SHA256(key = raw SHA256(secret),
     *     METHOD + "\n" + PATH + "\n" + TIMESTAMP + "\n" + hex(SHA256(body))))
     * PATH is the URL path only, without any query string.
     *
     * @return array<string, string>
     */
    private function buildAuthHeaders(string $method, string $path, string $body): array
    {
        $headers = [self::HEADER_API_KEY => $this->apiKey];
        if (!$this->signedRequests) {
            return $headers;
        }

        $timestamp = (string) time();
        $message = $method . "\n" . '/api' . $path . "\n" . $timestamp . "\n" . hash('sha256', $body);
        $signingKey = hash('sha256', $this->apiKey, true);
        $headers[self::HEADER_TIMESTAMP] = $timestamp;
        $headers[self::HEADER_SIGNATURE] = hash_hmac('sha256', $message, $signingKey);

        return $headers;
    }
}
