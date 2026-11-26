<?php

namespace Drupal\licensemanagerpro\Service;

use Drupal\Core\Logger\LoggerChannelFactoryInterface;
use Psr\Log\LoggerInterface;

/**
 * License operations against the License Manager Pro API.
 *
 * Every method fails closed: on any API failure it returns NULL (or an
 * empty list / FALSE) and records the reason in getLastError(). No
 * license is ever minted, renewed or revoked without a confirmed 2xx
 * response from the backend.
 */
final class LicenseService {

  public const STATUS_ACTIVE = 'active';
  public const STATUS_INACTIVE = 'inactive';

  private ?string $lastError = NULL;
  private LoggerInterface $logger;

  public function __construct(
    private ApiClient $apiClient,
    private ConfigService $config,
    LoggerChannelFactoryInterface $loggerFactory,
  ) {
    $this->logger = $loggerFactory->get('licensemanagerpro');
  }

  public function getLastError(): ?string {
    return $this->lastError ?? $this->apiClient->getLastError();
  }

  /**
   * Mint a license for a user.
   *
   * The product slug is resolved to a product id first
   * (GET /products?slug=). The billing cycle is sent as-is when it is
   * one of the six known cycles; anything else is rejected here so the
   * backend never receives an invalid cycle. The backend adds a
   * missing cycle to the product automatically (cycle sync).
   *
   * @return array<string, mixed>|null The created license, or NULL.
   */
  public function mint(string $owner_email, string $product_slug, ?string $billing_cycle = NULL, ?string $license_key = NULL): ?array {
    $product = $this->apiClient->getProductBySlug($product_slug);
    if ($product === NULL || !isset($product['id'])) {
      $this->lastError = $this->apiClient->getLastError() ?? sprintf('License Manager Pro product "%s" was not found.', $product_slug);
      return NULL;
    }
    $cycle = $billing_cycle ?? $this->config->getDefaultBillingCycle();
    if (!BillingCycle::isValid($cycle)) {
      $this->lastError = sprintf('Unknown billing cycle "%s". Expected one of: %s.', $cycle, implode(', ', BillingCycle::ALL));
      return NULL;
    }
    $payload = [
      'product_id' => (int) $product['id'],
      'owner_email' => $owner_email,
      'billing_cycle' => $cycle,
    ];
    if ($license_key !== NULL && $license_key !== '') {
      // Backend field name for a caller-supplied key is "key".
      $payload['key'] = $license_key;
    }
    $license = $this->apiClient->post('/licenses', $payload);
    if ($license === NULL) {
      $this->logger->error('Failed to mint a license for @email (product @slug): @error', [
        '@email' => $owner_email,
        '@slug' => $product_slug,
        '@error' => (string) $this->getLastError(),
      ]);
    }
    return $license;
  }

  /**
   * Licenses owned by an email address.
   *
   * The backend search is broad, so results are filtered client-side
   * to an exact owner_email match — a user must never see another
   * user's licenses because the search matched a key or product name.
   *
   * @return array<int, array<string, mixed>>
   */
  public function findByEmail(string $email): array {
    $result = $this->apiClient->get('/licenses', [
      'search' => $email,
      'limit' => ApiClient::LICENSE_LIST_LIMIT,
    ]);
    if (!is_array($result)) {
      return [];
    }
    $owned = [];
    foreach (array_values($result) as $license) {
      if (is_array($license) && isset($license['owner_email']) && strcasecmp((string) $license['owner_email'], $email) === 0) {
        $owned[] = $license;
      }
    }
    return $owned;
  }

  /**
   * All licenses (admin list, capped at the list limit).
   *
   * @return array<int, array<string, mixed>>
   */
  public function listAll(): array {
    $result = $this->apiClient->get('/licenses', ['limit' => ApiClient::LICENSE_LIST_LIMIT]);
    return is_array($result) ? array_values($result) : [];
  }

  /**
   * @return array<string, mixed>|null
   */
  public function get(int $license_id): ?array {
    return $this->apiClient->get('/licenses/' . $license_id);
  }

  /**
   * Renew a license, optionally switching it to a new billing cycle.
   *
   * The cycle is sent both in the JSON body (the v2.3 module contract)
   * and as a ?billing_cycle= query parameter (what the current backend
   * revision reads); the backend ignores the duplicate. An unknown
   * cycle is rejected here and the license is left untouched.
   *
   * @return array<string, mixed>|null
   */
  public function renew(int $license_id, ?string $billing_cycle = NULL): ?array {
    $body = [];
    $query = [];
    if ($billing_cycle !== NULL) {
      if (!BillingCycle::isValid($billing_cycle)) {
        $this->lastError = sprintf('Unknown billing cycle "%s". Expected one of: %s.', $billing_cycle, implode(', ', BillingCycle::ALL));
        return NULL;
      }
      $body['billing_cycle'] = $billing_cycle;
      $query['billing_cycle'] = $billing_cycle;
    }
    return $this->apiClient->post('/licenses/' . $license_id . '/renew', $body, $query);
  }

  /**
   * Revoke (delete) a license.
   */
  public function revoke(int $license_id): bool {
    return $this->apiClient->delete('/licenses/' . $license_id) !== NULL;
  }

  /**
   * Suspend or reactivate a license.
   *
   * @return array<string, mixed>|null
   */
  public function setStatus(int $license_id, string $status): ?array {
    if ($status !== static::STATUS_ACTIVE && $status !== static::STATUS_INACTIVE) {
      $this->lastError = sprintf('Unknown license status "%s". Expected "active" or "inactive".', $status);
      return NULL;
    }
    return $this->apiClient->put('/licenses/' . $license_id, ['status' => $status]);
  }

  /**
   * Validate a license key, optionally with the site domain, IP or
   * install path the backend locks it to.
   *
   * PUBLIC endpoint (v3.0): POST /licenses/validate sends no API key
   * and no signature — the check is open to any server; the blacklist
   * still applies server-side.
   *
   * @return array<string, mixed>|null Decoded validate response, or NULL.
   */
  public function validate(string $license_key, ?string $domain = NULL, ?string $ip = NULL, ?string $install_path = NULL): ?array {
    $payload = ['key' => $license_key];
    if ($domain !== NULL && $domain !== '') {
      $payload['domain'] = $domain;
    }
    if ($ip !== NULL && $ip !== '') {
      $payload['ip'] = $ip;
    }
    if ($install_path !== NULL && $install_path !== '') {
      $payload['install_path'] = $install_path;
    }
    return $this->apiClient->post('/licenses/validate', $payload, [], [], true);
  }

}
