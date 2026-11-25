<?php
/**
 * License Manager Pro — API client.
 *
 * Authenticates with ONE scoped module API key (X-API-Key header).
 * No admin email or password is used anywhere. TLS verification is
 * always on and can never be disabled by configuration.
 *
 * Optional HMAC signing (when enabled in config):
 *   X-LMP-Timestamp: unix seconds
 *   X-LMP-Signature: hex(HMAC-SHA256(key = raw SHA256(secret), message))
 *   message = METHOD + "\n" + PATH + "\n" + TIMESTAMP + "\n" + hex(SHA256(body))
 * where PATH is the URL path only (no query) and body is the raw
 * request body bytes. The server rejects timestamps older than
 * 5 minutes.
 *
 * Fail-closed: any 401/403, network error or non-2xx response throws
 * ApiException and no license is minted. The API key is never logged.
 */

declare(strict_types=1);

namespace Lmp\LicenseManager\Model;

use Magento\Framework\Exception\LocalizedException;
use Magento\Framework\HTTP\Client\Curl;
use Psr\Log\LoggerInterface;

class ApiException extends LocalizedException
{
}

class ApiClient
{
    public const HEADER_API_KEY = 'X-API-Key';
    public const HEADER_TIMESTAMP = 'X-LMP-Timestamp';
    public const HEADER_SIGNATURE = 'X-LMP-Signature';

    public const SIGNATURE_MAX_AGE_SECONDS = 300;
    public const REQUEST_TIMEOUT_SECONDS = 15;

    private const API_BASE_SUFFIX = '/api';

    private Config $config;
    private Curl $curl;
    private LoggerInterface $logger;

    public function __construct(
        Config $config,
        Curl $curl,
        LoggerInterface $logger
    ) {
        $this->config = $config;
        $this->curl = $curl;
        $this->logger = $logger;
    }

    /**
     * GET /system/info — used by the Test Connection button.
     *
     * @return array<string, mixed>
     * @throws ApiException
     */
    public function getSystemInfo(): array
    {
        $result = $this->request('GET', '/system/info');

        return is_array($result) ? $result : [];
    }

    /**
     * GET /products?slug=<slug> — resolve an LMP product by slug.
     *
     * @return array<string, mixed>|null Null when the product does not exist.
     * @throws ApiException
     */
    public function findProductBySlug(string $slug): ?array
    {
        $result = $this->request('GET', '/products?slug=' . rawurlencode($slug));
        if (is_array($result) && isset($result[0]) && is_array($result[0])) {
            return $result[0];
        }
        if (is_array($result) && isset($result['id'])) {
            return $result;
        }

        return null;
    }

    /**
     * POST /licenses — mint a license. $billingCycle must already be a
     * valid LMP cycle or null (omitted when unknown).
     *
     * @return array<string, mixed> The created license (HTTP 201).
     * @throws ApiException
     */
    public function createLicense(
        string $productSlug,
        string $ownerEmail,
        ?string $billingCycle = null,
        ?string $licenseKey = null
    ): array {
        $payload = [
            'product_slug' => $productSlug,
            'owner_email' => $ownerEmail,
        ];
        if ($billingCycle !== null && BillingCycle::isValid($billingCycle)) {
            $payload['billing_cycle'] = $billingCycle;
        }
        if ($licenseKey !== null && $licenseKey !== '') {
            $payload['license_key'] = $licenseKey;
        }

        $result = $this->request('POST', '/licenses', $payload);

        return is_array($result) ? $result : [];
    }

    /**
     * GET /licenses?search=<email> — licenses owned by an email address.
     *
     * @return array<int, array<string, mixed>>
     * @throws ApiException
     */
    public function findLicensesByEmail(string $email): array
    {
        $result = $this->request('GET', '/licenses?search=' . rawurlencode($email));

        return is_array($result) ? array_values($result) : [];
    }

    /**
     * GET /licenses/{id}.
     *
     * @return array<string, mixed>
     * @throws ApiException
     */
    public function getLicense(int $licenseId): array
    {
        $result = $this->request('GET', '/licenses/' . $licenseId);

        return is_array($result) ? $result : [];
    }

    /**
     * PUT /licenses/{id} {status} — e.g. suspend / reactivate.
     *
     * @return array<string, mixed>
     * @throws ApiException
     */
    public function updateLicenseStatus(int $licenseId, string $status): array
    {
        $result = $this->request('PUT', '/licenses/' . $licenseId, ['status' => $status]);

        return is_array($result) ? $result : [];
    }

    /**
     * DELETE /licenses/{id} — revoke a license.
     *
     * @throws ApiException
     */
    public function revokeLicense(int $licenseId): void
    {
        $this->request('DELETE', '/licenses/' . $licenseId);
    }

    /**
     * POST /licenses/{id}/renew {billing_cycle?}.
     *
     * @return array<string, mixed>
     * @throws ApiException
     */
    public function renewLicense(int $licenseId, ?string $billingCycle = null): array
    {
        $payload = [];
        if ($billingCycle !== null && BillingCycle::isValid($billingCycle)) {
            $payload['billing_cycle'] = $billingCycle;
        }
        $result = $this->request('POST', '/licenses/' . $licenseId . '/renew', $payload);

        return is_array($result) ? $result : [];
    }

    /**
     * POST /licenses/validate — check a key against domain/IP/install path.
     *
     * @return array<string, mixed>
     * @throws ApiException
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
        $result = $this->request('POST', '/licenses/validate', $payload);

        return is_array($result) ? $result : [];
    }

    /**
     * One HTTP call. Returns the decoded JSON body on HTTP 2xx.
     * Throws ApiException on any failure — including 401/403, which
     * fail closed: the caller must not mint or grant anything.
     *
     * @param array<string, mixed> $data
     * @return mixed
     * @throws ApiException
     */
    private function request(string $method, string $path, array $data = []): mixed
    {
        $apiKey = $this->config->getApiKey();
        $baseUrl = $this->config->getApiUrl();
        if ($apiKey === '' || $baseUrl === '') {
            throw new ApiException(__('License Manager Pro is not configured: API URL and module API key are required.'));
        }

        $body = $data === [] && $method === 'GET' ? '' : (string) json_encode($data);
        $timestamp = (string) time();
        $headers = [
            'Content-Type' => 'application/json',
            'Accept' => 'application/json',
            self::HEADER_API_KEY => $apiKey,
        ];
        if ($this->config->isSignedRequestsEnabled()) {
            $headers[self::HEADER_TIMESTAMP] = $timestamp;
            $headers[self::HEADER_SIGNATURE] = $this->sign($method, $path, $timestamp, $body, $apiKey);
        }

        $url = $baseUrl . self::API_BASE_SUFFIX . $path;

        $this->curl->setOption(CURLOPT_SSL_VERIFYPEER, true);
        $this->curl->setOption(CURLOPT_SSL_VERIFYHOST, 2);
        $this->curl->setOption(CURLOPT_TIMEOUT, self::REQUEST_TIMEOUT_SECONDS);
        $this->curl->setHeaders($headers);

        try {
            if ($method === 'GET') {
                $this->curl->get($url);
            } elseif ($method === 'DELETE') {
                $this->curl->delete($url);
            } elseif ($method === 'PUT') {
                $this->curl->put($url, $body);
            } else {
                $this->curl->post($url, $body);
            }
        } catch (\Exception $e) {
            $this->logger->error('License Manager Pro request failed: ' . $e->getMessage());
            throw new ApiException(__('License Manager Pro request failed: could not reach the API.'));
        }

        $status = (int) $this->curl->getStatus();
        $rawBody = (string) $this->curl->getBody();
        $decoded = json_decode($rawBody, true);

        if ($status === 401 || $status === 403) {
            $this->logger->error('License Manager Pro request rejected with HTTP ' . $status . ' (invalid or revoked API key).');
            throw new ApiException(__('License Manager Pro rejected the request (HTTP %1). Check the module API key.', $status));
        }
        if ($status < 200 || $status >= 300) {
            $detail = '';
            if (is_array($decoded) && isset($decoded['detail'])) {
                $detail = is_string($decoded['detail']) ? $decoded['detail'] : (string) json_encode($decoded['detail']);
            }
            $this->logger->error('License Manager Pro returned HTTP ' . $status . ($detail !== '' ? ': ' . $detail : ''));
            throw new ApiException(__('License Manager Pro returned HTTP %1.', $status));
        }

        return $decoded;
    }

    /**
     * HMAC-SHA256 signature per the shared module spec.
     * Key = raw bytes of SHA256(secret); message = METHOD + "\n" + PATH
     * (path only, no query) + "\n" + TIMESTAMP + "\n" + hex(SHA256(body)).
     */
    private function sign(string $method, string $path, string $timestamp, string $body, string $secret): string
    {
        $pathOnly = strtok($path, '?') ?: $path;
        $message = strtoupper($method) . "\n" . $pathOnly . "\n" . $timestamp . "\n" . hash('sha256', $body);
        $key = hash('sha256', $secret, true);

        return hash_hmac('sha256', $message, $key);
    }
}
