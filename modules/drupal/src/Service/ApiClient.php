<?php

namespace Drupal\licensemanagerpro\Service;

use GuzzleHttp\Exception\GuzzleException;
use GuzzleHttp\ClientInterface;
use Psr\Log\LoggerInterface;
use Drupal\Core\Logger\LoggerChannelFactoryInterface;

/**
 * HTTP client for the License Manager Pro REST API.
 *
 * Authentication is a single scoped module API key sent as X-API-Key.
 * No admin email or password is ever used. TLS verification is always
 * on. Any 401/403 fails closed: the call returns NULL, the error is
 * logged, and no license is minted or changed.
 *
 * Optional HMAC signing (when the signed-requests setting is on):
 *   X-LMP-Timestamp: unix seconds
 *   X-LMP-Signature: hex(HMAC-SHA256(key = raw bytes of SHA256(secret),
 *     message = METHOD + "\n" + PATH + "\n" + TIMESTAMP + "\n" +
 *     SHA256(raw request body).hexdigest()))
 * PATH is the URL path only, no query string. The server rejects
 * timestamps older than 5 minutes.
 */
final class ApiClient {

  public const HEADER_API_KEY = 'X-API-Key';
  public const HEADER_TIMESTAMP = 'X-LMP-Timestamp';
  public const HEADER_SIGNATURE = 'X-LMP-Signature';

  public const REQUEST_TIMEOUT_SECONDS = 15;
  public const PRODUCT_LIST_LIMIT = 100;
  public const LICENSE_LIST_LIMIT = 100;

  private ?string $lastError = NULL;
  private LoggerInterface $logger;

  public function __construct(
    private ClientInterface $httpClient,
    private ConfigService $config,
    LoggerChannelFactoryInterface $loggerFactory,
  ) {
    $this->logger = $loggerFactory->get('licensemanagerpro');
  }

  public function getLastError(): ?string {
    return $this->lastError;
  }

  public function get(string $path, array $query = [], array $overrides = []): ?array {
    return $this->request('GET', $path, NULL, $query, $overrides);
  }

  public function post(string $path, array $data = [], array $query = [], array $overrides = [], bool $public = false): ?array {
    return $this->request('POST', $path, $data, $query, $overrides, $public);
  }

  public function put(string $path, array $data = [], array $query = [], array $overrides = []): ?array {
    return $this->request('PUT', $path, $data, $query, $overrides);
  }

  public function delete(string $path, array $query = [], array $overrides = []): ?array {
    return $this->request('DELETE', $path, NULL, $query, $overrides);
  }

  /**
   * Check the backend is reachable and authenticated.
   *
   * @return array{ok: bool, version: string|null, error: string|null}
   */
  public function testConnection(array $overrides = []): array {
    $info = $this->get('/system/info', [], $overrides);
    if ($info === NULL) {
      return [
        'ok' => FALSE,
        'version' => NULL,
        'error' => $this->lastError ?? 'Connection failed.',
      ];
    }
    return [
      'ok' => TRUE,
      'version' => isset($info['version']) ? (string) $info['version'] : NULL,
      'error' => NULL,
    ];
  }

  /**
   * All products, for the settings dropdown and the mint form.
   *
   * @return array<int, array<string, mixed>>|null
   */
  public function listProducts(array $overrides = []): ?array {
    $result = $this->get('/products', ['limit' => static::PRODUCT_LIST_LIMIT], $overrides);
    return is_array($result) ? array_values($result) : NULL;
  }

  /**
   * The single product with the given slug, or NULL when not found.
   */
  public function getProductBySlug(string $slug, array $overrides = []): ?array {
    $result = $this->get('/products', ['slug' => $slug], $overrides);
    if (!is_array($result)) {
      return NULL;
    }
    $products = array_values($result);
    if (count($products) !== 1) {
      $this->lastError = sprintf('License Manager Pro product "%s" was not found.', $slug);
      return NULL;
    }
    return $products[0];
  }

  /**
   * One HTTP call. Returns the decoded JSON body on HTTP 2xx, NULL on
   * any failure (see getLastError()). Never throws for HTTP errors.
   */
  /**
   * One HTTP call. $public = true marks a PUBLIC endpoint
   * (POST /licenses/validate): no X-API-Key header and no HMAC
   * signature are sent.
   */
  private function request(string $method, string $path, ?array $data, array $query, array $overrides, bool $public = false): ?array {
    $this->lastError = NULL;
    $api_url = $overrides['api_url'] ?? $this->config->getApiUrl();
    $api_key = $overrides['api_key'] ?? $this->config->getApiKey();
    $signed = $overrides['signed_requests'] ?? $this->config->isSignedRequests();
    $api_url = rtrim((string) $api_url, '/');
    if ($api_url === '' || $api_key === '') {
      $this->lastError = 'License Manager Pro is not configured: set the API URL and API key first.';
      return NULL;
    }

    $body = $data !== NULL ? (string) json_encode($data) : '';
    $url = $api_url . $path;
    if ($query !== []) {
      $url .= '?' . http_build_query($query);
    }
    $url_path = (string) parse_url($url, PHP_URL_PATH);

    $options = [
      'headers' => $this->buildHeaders($method, $url_path, $body, (string) $api_key, (bool) $signed, $public),
      'timeout' => static::REQUEST_TIMEOUT_SECONDS,
      'http_errors' => FALSE,
      // TLS verification is never disabled.
      'verify' => TRUE,
    ];
    if ($body !== '') {
      $options['body'] = $body;
    }

    try {
      $response = $this->httpClient->request($method, $url, $options);
    }
    catch (GuzzleException $e) {
      $this->lastError = 'Could not reach License Manager Pro: ' . $e->getMessage();
      $this->logger->error('License Manager Pro request failed: @message', ['@message' => $e->getMessage()]);
      return NULL;
    }

    $status = $response->getStatusCode();
    $decoded = json_decode((string) $response->getBody(), TRUE);
    if ($status < 200 || $status >= 300) {
      $detail = '';
      if (is_array($decoded) && isset($decoded['detail'])) {
        $detail = is_string($decoded['detail']) ? $decoded['detail'] : (string) json_encode($decoded['detail']);
      }
      if ($status === 401 || $status === 403) {
        $this->lastError = sprintf('License Manager Pro refused the request (HTTP %d)%s. No license was created or changed.', $status, $detail !== '' ? ': ' . $detail : '');
        $this->logger->error('License Manager Pro authentication failed (HTTP @status). Check the module API key.', ['@status' => $status]);
      }
      else {
        $this->lastError = sprintf('License Manager Pro returned HTTP %d%s.', $status, $detail !== '' ? ': ' . $detail : '');
      }
      return NULL;
    }
    return is_array($decoded) ? $decoded : [];
  }

  /**
   * @return array<string, string>
   */
  private function buildHeaders(string $method, string $path, string $body, string $api_key, bool $signed, bool $public = false): array {
    $headers = [
      'Content-Type' => 'application/json',
      'Accept' => 'application/json',
    ];
    if ($public) {
      // PUBLIC endpoint (POST /licenses/validate, v3.0): no API key,
      // no HMAC signature — the check is open to any server.
      return $headers;
    }
    $headers[static::HEADER_API_KEY] = $api_key;
    if ($signed) {
      $timestamp = (string) time();
      $headers[static::HEADER_TIMESTAMP] = $timestamp;
      $headers[static::HEADER_SIGNATURE] = $this->sign($method, $path, $timestamp, $body, $api_key);
    }
    return $headers;
  }

  /**
   * HMAC-SHA256 signature. The HMAC key is the raw bytes of the
   * SHA-256 of the secret — exactly what the backend derives from the
   * stored key hash.
   */
  private function sign(string $method, string $path, string $timestamp, string $body, string $secret): string {
    $hmac_key = hash('sha256', $secret, TRUE);
    $body_hash = hash('sha256', $body);
    $message = $method . "\n" . $path . "\n" . $timestamp . "\n" . $body_hash;
    return hash_hmac('sha256', $message, $hmac_key);
  }

}
