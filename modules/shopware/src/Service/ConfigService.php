<?php

declare(strict_types=1);

namespace Lmp\LicenseManager\Service;

use Shopware\Core\System\SystemConfig\SystemConfigService;

/**
 * Reads the plugin configuration from Shopware SystemConfig.
 *
 * Config domain: LmpLicenseManager.config
 * Keys: apiUrl, apiKey, signedRequests, productMapping.
 */
class ConfigService
{
    public const CONFIG_DOMAIN = 'LmpLicenseManager.config';
    public const KEY_API_URL = 'apiUrl';
    public const KEY_API_KEY = 'apiKey';
    public const KEY_SIGNED_REQUESTS = 'signedRequests';
    public const KEY_PRODUCT_MAPPING = 'productMapping';

    private SystemConfigService $systemConfig;

    public function __construct(SystemConfigService $systemConfig)
    {
        $this->systemConfig = $systemConfig;
    }

    /**
     * Base URL of the License Manager Pro installation, without a trailing
     * slash and without the /api suffix (the client appends /api itself).
     */
    public function getApiBaseUrl(): string
    {
        $url = (string) $this->systemConfig->getString(self::CONFIG_DOMAIN . '.' . self::KEY_API_URL);
        $url = rtrim(trim($url), '/');
        if (str_ends_with($url, '/api')) {
            $url = substr($url, 0, -4);
        }

        return $url;
    }

    public function getApiKey(): string
    {
        return trim((string) $this->systemConfig->getString(self::CONFIG_DOMAIN . '.' . self::KEY_API_KEY));
    }

    public function isSignedRequestsEnabled(): bool
    {
        return (bool) $this->systemConfig->getBool(self::CONFIG_DOMAIN . '.' . self::KEY_SIGNED_REQUESTS);
    }

    public function isConfigured(): bool
    {
        return $this->getApiBaseUrl() !== '' && $this->getApiKey() !== '';
    }

    /**
     * Product mapping from the config textarea (JSON object):
     *   { "<shopware product id>": { "slug": "<lmp product slug>", "cycle": "<lmp cycle>" } }
     * Malformed entries are ignored; a missing or invalid document maps
     * nothing. The cycle value is normalised through BillingCycleMapper,
     * so an unknown cycle never reaches the backend.
     *
     * @return array<string, array{slug: string, cycle: string|null}>
     */
    public function getProductMapping(): array
    {
        $raw = trim((string) $this->systemConfig->getString(self::CONFIG_DOMAIN . '.' . self::KEY_PRODUCT_MAPPING));
        if ($raw === '') {
            return [];
        }
        $decoded = json_decode($raw, true);
        if (!\is_array($decoded)) {
            return [];
        }
        $mapping = [];
        foreach ($decoded as $productId => $entry) {
            if (!\is_string($productId) || !\is_array($entry)) {
                continue;
            }
            $slug = isset($entry['slug']) && \is_string($entry['slug']) ? trim($entry['slug']) : '';
            if ($slug === '') {
                continue;
            }
            $cycle = isset($entry['cycle']) && \is_string($entry['cycle'])
                ? BillingCycleMapper::map($entry['cycle'])
                : null;
            $mapping[$productId] = ['slug' => $slug, 'cycle' => $cycle];
        }

        return $mapping;
    }

    /**
     * @return array{slug: string, cycle: string|null}|null
     */
    public function getMappingForProduct(string $productId): ?array
    {
        $mapping = $this->getProductMapping();

        return $mapping[$productId] ?? null;
    }
}
