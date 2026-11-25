<?php

declare(strict_types=1);

namespace Lmp\LicenseManager\Service;

use Psr\Log\LoggerInterface;
use Symfony\Contracts\HttpClient\Exception\TransportExceptionInterface;
use Symfony\Contracts\HttpClient\HttpClientInterface;
use Symfony\Contracts\HttpClient\ResponseInterface;

/**
 * HTTP client for the License Manager Pro REST API.
 *
 * Authentication is a single scoped module API key (X-API-Key header).
 * No admin email or password is ever used. TLS verification is left at
 * the Symfony HttpClient default (verified) and is never disabled.
 *
 * Optional HMAC-signed requests (enabled by the "signed requests"
 * config toggle):
 *   X-LMP-Timestamp: unix seconds
 *   X-LMP-Signature: hex(HMAC-SHA256(key = raw SHA256(secret), message))
 *   message = METHOD + "\n" + PATH + "\n" + TIMESTAMP + "\n" + hex(SHA256(raw body))
 * where PATH is the URL path only (including the /api prefix, no query).
 * The server rejects timestamps older than 5 minutes.
 *
 * Every failure is fail-closed: the caller gets null (or an exception
 * from the typed helpers) and no license is minted on 401/403.
 */
class ApiClient
{
    public const API_PATH_PREFIX = '/api';
    public const HEADER_API_KEY = 'X-API-Key';
    public const HEADER_TIMESTAMP = 'X-LMP-Timestamp';
    public const HEADER_SIGNATURE = 'X-LMP-Signature';
    public const REQUEST_TIMEOUT_SECONDS = 15;
    public const SIGNATURE_MAX_AGE_SECONDS = 300;

    private HttpClientInterface $httpClient;
    private ConfigService $config;
    private LoggerInterface $logger;

    private string $lastError = '';

    public function __construct(HttpClientInterface $httpClient, ConfigService $config, LoggerInterface $logger)
    {
        $this->httpClient = $httpClient;
        $this->config = $config;
        $this->logger = $logger;
    }

    public function getLastError(): string
    {
        return $this->lastError;
    }

    /**
     * @return array<string, mixed>|null Decoded JSON on HTTP 2xx, null on any failure.
     */
    public function get(string $path): ?array
    {
        return $this->request('GET', $path);
    }

    /**
     * @param array<string, mixed> $payload
     * @return array<string, mixed>|null
     */
    public function post(string $path, array $payload = []): ?array
    {
        return $this->request('POST', $path, $payload);
    }

    /**
     * @param array<string, mixed> $payload
     * @return array<string, mixed>|null
     */
    public function put(string $path, array $payload = []): ?array
    {
        return $this->request('PUT', $path, $payload);
    }

    public function delete(string $path): ?array
    {
        return $this->request('DELETE', $path);
    }

    /**
     * Test connection: GET /system/info. Returns the decoded body on
     * success, null on failure (see getLastError()).
     *
     * @return array<string, mixed>|null
     */
    public function systemInfo(): ?array
    {
        return $this->get('/system/info');
    }

    /**
     * @param array<string, mixed>|null $payload
     * @return array<string, mixed>|null
     */
    private function request(string $method, string $path, ?array $payload = null): ?array
    {
        $this->lastError = '';
        if (!$this->config->isConfigured()) {
            $this->lastError = 'License Manager Pro is not configured: set the API URL and API key in the plugin settings.';
            $this->logger->error('[LMP] API call aborted: plugin not configured.');

            return null;
        }

        $apiPath = self::API_PATH_PREFIX . $path;
        $url = $this->config->getApiBaseUrl() . $apiPath;
        $body = $payload === null ? '' : (string) json_encode($payload);
        $headers = [
            'Accept' => 'application/json',
            'Content-Type' => 'application/json',
            self::HEADER_API_KEY => $this->config->getApiKey(),
        ];
        if ($this->config->isSignedRequestsEnabled()) {
            // The signed PATH is the URL path only — never the query string.
            $signPath = explode('?', $apiPath, 2)[0];
            $headers += $this->buildSignatureHeaders($method, $signPath, $body);
        }

        try {
            $response = $this->httpClient->request($method, $url, [
                'headers' => $headers,
                'body' => $body === '' ? null : $body,
                'timeout' => self::REQUEST_TIMEOUT_SECONDS,
            ]);
            $statusCode = $response->getStatusCode();
            $decoded = $this->decodeBody($response);
        } catch (TransportExceptionInterface $exception) {
            $this->lastError = 'Could not reach License Manager Pro: ' . $exception->getMessage();
            $this->logger->error('[LMP] Transport error calling {url}: {error}', ['url' => $url, 'error' => $exception->getMessage()]);

            return null;
        }

        if ($statusCode < 200 || $statusCode >= 300) {
            $detail = $this->extractDetail($decoded);
            if ($statusCode === 401 || $statusCode === 403) {
                $this->lastError = 'License Manager Pro rejected the API key (HTTP ' . $statusCode . '). No license was created. Check the key and its scope in the License Manager Pro panel.';
            } else {
                $this->lastError = 'License Manager Pro returned HTTP ' . $statusCode . ($detail !== '' ? ': ' . $detail : '');
            }
            $this->logger->error('[LMP] API error {method} {path}: HTTP {status} {detail}', [
                'method' => $method,
                'path' => $apiPath,
                'status' => $statusCode,
                'detail' => $detail,
            ]);

            return null;
        }

        return $decoded;
    }

    /**
     * @return array<string, string>
     */
    private function buildSignatureHeaders(string $method, string $path, string $body): array
    {
        $timestamp = (string) time();
        $secret = $this->config->getApiKey();
        $signingKey = hash('sha256', $secret, true);
        $bodyHash = hash('sha256', $body);
        $message = $method . "\n" . $path . "\n" . $timestamp . "\n" . $bodyHash;
        $signature = hash_hmac('sha256', $message, $signingKey);

        return [
            self::HEADER_TIMESTAMP => $timestamp,
            self::HEADER_SIGNATURE => $signature,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function decodeBody(ResponseInterface $response): array
    {
        $content = $response->getContent(false);
        if ($content === '') {
            return [];
        }
        $decoded = json_decode($content, true);

        return \is_array($decoded) ? $decoded : [];
    }

    /**
     * @param array<string, mixed> $decoded
     */
    private function extractDetail(array $decoded): string
    {
        if (!isset($decoded['detail'])) {
            return '';
        }
        $detail = $decoded['detail'];

        return \is_string($detail) ? $detail : (string) json_encode($detail);
    }
}
