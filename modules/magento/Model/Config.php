<?php
/**
 * License Manager Pro — configuration reader.
 *
 * Reads the module settings from Magento scope config. The API key is
 * stored encrypted (Magento\Config\Model\Config\Backend\Encrypted) and
 * is decrypted here only in memory, never written to logs.
 */

declare(strict_types=1);

namespace Lmp\LicenseManager\Model;

use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Framework\Encryption\EncryptorInterface;
use Magento\Store\Model\ScopeInterface;

class Config
{
    public const XML_PATH_API_URL = 'lmp_licensemanager/general/api_url';
    public const XML_PATH_API_KEY = 'lmp_licensemanager/general/api_key';
    public const XML_PATH_SIGNED_REQUESTS = 'lmp_licensemanager/general/signed_requests';
    public const XML_PATH_PRODUCT_MAPPING = 'lmp_licensemanager/mapping/product_mapping';

    public const DEFAULT_API_URL = '';

    private ScopeConfigInterface $scopeConfig;
    private EncryptorInterface $encryptor;

    public function __construct(
        ScopeConfigInterface $scopeConfig,
        EncryptorInterface $encryptor
    ) {
        $this->scopeConfig = $scopeConfig;
        $this->encryptor = $encryptor;
    }

    public function getApiUrl(?int $storeId = null): string
    {
        $url = (string) $this->scopeConfig->getValue(
            self::XML_PATH_API_URL,
            ScopeInterface::SCOPE_STORE,
            $storeId
        );

        return rtrim(trim($url), '/');
    }

    public function getApiKey(?int $storeId = null): string
    {
        $encrypted = (string) $this->scopeConfig->getValue(
            self::XML_PATH_API_KEY,
            ScopeInterface::SCOPE_STORE,
            $storeId
        );

        if ($encrypted === '') {
            return '';
        }

        return $this->encryptor->decrypt($encrypted);
    }

    public function isSignedRequestsEnabled(?int $storeId = null): bool
    {
        return $this->scopeConfig->isSetFlag(
            self::XML_PATH_SIGNED_REQUESTS,
            ScopeInterface::SCOPE_STORE,
            $storeId
        );
    }

    public function isConfigured(?int $storeId = null): bool
    {
        return $this->getApiUrl($storeId) !== '' && $this->getApiKey($storeId) !== '';
    }

    /**
     * Product mapping from the JSON-lines config field.
     *
     * @return array<string, array{slug: string, billing_cycle: string|null}>
     *   Keyed by Magento SKU; values carry the LMP product slug and an
     *   optional billing cycle. Malformed lines are skipped.
     */
    public function getProductMapping(?int $storeId = null): array
    {
        $raw = (string) $this->scopeConfig->getValue(
            self::XML_PATH_PRODUCT_MAPPING,
            ScopeInterface::SCOPE_STORE,
            $storeId
        );

        $mapping = [];
        foreach (explode("\n", $raw) as $line) {
            $line = trim($line);
            if ($line === '') {
                continue;
            }
            $decoded = json_decode($line, true);
            if (!is_array($decoded) || empty($decoded['sku']) || empty($decoded['slug'])) {
                continue;
            }
            $cycle = BillingCycle::normalize($decoded['billing_cycle'] ?? null);
            $mapping[(string) $decoded['sku']] = [
                'slug' => (string) $decoded['slug'],
                'billing_cycle' => $cycle,
            ];
        }

        return $mapping;
    }
}
