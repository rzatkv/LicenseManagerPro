<?php

namespace Drupal\licensemanagerpro\Service;

use Drupal\Core\Config\ConfigFactoryInterface;

/**
 * Typed reader for the License Manager Pro settings.
 */
final class ConfigService {

  public const CONFIG_NAME = 'licensemanagerpro.settings';

  public const KEY_API_URL = 'api_url';
  public const KEY_API_KEY = 'api_key';
  public const KEY_SIGNED_REQUESTS = 'signed_requests';
  public const KEY_DEFAULT_BILLING_CYCLE = 'default_billing_cycle';
  public const KEY_PRODUCT_MAPPING = 'product_mapping';

  public function __construct(
    private ConfigFactoryInterface $configFactory,
  ) {}

  /**
   * Backend API base URL, e.g. https://license.example.com/api.
   */
  public function getApiUrl(): string {
    return (string) $this->configFactory->get(static::CONFIG_NAME)->get(static::KEY_API_URL);
  }

  /**
   * The single scoped module API key. Never logged, never rendered.
   */
  public function getApiKey(): string {
    return (string) $this->configFactory->get(static::CONFIG_NAME)->get(static::KEY_API_KEY);
  }

  /**
   * Whether requests must carry the HMAC signature headers.
   */
  public function isSignedRequests(): bool {
    return (bool) $this->configFactory->get(static::CONFIG_NAME)->get(static::KEY_SIGNED_REQUESTS);
  }

  /**
   * Default billing cycle sent when a mint form leaves it unset.
   */
  public function getDefaultBillingCycle(): string {
    $cycle = (string) $this->configFactory->get(static::CONFIG_NAME)->get(static::KEY_DEFAULT_BILLING_CYCLE);
    return BillingCycle::isValid($cycle) ? $cycle : BillingCycle::DEFAULT_CYCLE;
  }

  /**
   * Node type machine name => License Manager Pro product slug.
   *
   * @return array<string, string>
   */
  public function getProductMappings(): array {
    $mapping = $this->configFactory->get(static::CONFIG_NAME)->get(static::KEY_PRODUCT_MAPPING);
    if (!is_array($mapping)) {
      return [];
    }
    $clean = [];
    foreach ($mapping as $node_type => $slug) {
      $slug = trim((string) $slug);
      if ($slug !== '') {
        $clean[(string) $node_type] = $slug;
      }
    }
    return $clean;
  }

  /**
   * Product slug mapped to a node type, or NULL when unmapped.
   */
  public function getProductSlugForNodeType(string $node_type): ?string {
    return $this->getProductMappings()[$node_type] ?? NULL;
  }

}
