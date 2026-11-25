<?php
/**
 * License Manager Pro — license business logic.
 *
 * Thin service over ApiClient: minting, lookup, renewal and revocation
 * for one customer email. All failures surface as ApiException so the
 * caller can fail closed (no license is ever granted on an error).
 */

declare(strict_types=1);

namespace Lmp\LicenseManager\Model;

use Psr\Log\LoggerInterface;

class LicenseService
{
    private ApiClient $apiClient;
    private Config $config;
    private LoggerInterface $logger;

    public function __construct(
        ApiClient $apiClient,
        Config $config,
        LoggerInterface $logger
    ) {
        $this->apiClient = $apiClient;
        $this->config = $config;
        $this->logger = $logger;
    }

    /**
     * Mint a license for a mapped product slug.
     *
     * @return array<string, mixed> The created license (HTTP 201).
     * @throws ApiException
     */
    public function mint(
        string $productSlug,
        string $ownerEmail,
        ?string $billingCycle = null
    ): array {
        $cycle = BillingCycle::normalize($billingCycle);
        $product = $this->apiClient->findProductBySlug($productSlug);
        if ($product === null) {
            throw new ApiException(__('License Manager Pro product "%1" was not found.', $productSlug));
        }
        $license = $this->apiClient->createLicense($productSlug, $ownerEmail, $cycle);
        $this->logger->info(sprintf(
            'License Manager Pro minted license %s for %s (product %s, cycle %s).',
            (string) ($license['license_key'] ?? $license['id'] ?? '?'),
            $ownerEmail,
            $productSlug,
            $cycle ?? 'default'
        ));

        return $license;
    }

    /**
     * Mint a license for a Magento SKU using the configured mapping.
     * Returns null when the SKU is not mapped (not an error).
     *
     * @return array<string, mixed>|null
     * @throws ApiException
     */
    public function mintForSku(
        string $sku,
        string $ownerEmail,
        ?string $attributeCycle = null
    ): ?array {
        $mapping = $this->config->getProductMapping();
        if (!isset($mapping[$sku])) {
            return null;
        }
        $cycle = BillingCycle::normalize($attributeCycle) ?? $mapping[$sku]['billing_cycle'];

        return $this->mint($mapping[$sku]['slug'], $ownerEmail, $cycle);
    }

    /**
     * Licenses owned by a customer email, newest first when the API
     * provides a created date.
     *
     * @return array<int, array<string, mixed>>
     * @throws ApiException
     */
    public function getLicensesForEmail(string $email): array
    {
        $licenses = $this->apiClient->findLicensesByEmail($email);
        usort($licenses, static function (array $a, array $b): int {
            return strcmp((string) ($b['created_at'] ?? ''), (string) ($a['created_at'] ?? ''));
        });

        return $licenses;
    }

    /**
     * @return array<string, mixed>
     * @throws ApiException
     */
    public function renew(int $licenseId, ?string $billingCycle = null): array
    {
        return $this->apiClient->renewLicense($licenseId, BillingCycle::normalize($billingCycle));
    }

    /**
     * @throws ApiException
     */
    public function revoke(int $licenseId): void
    {
        $this->apiClient->revokeLicense($licenseId);
    }

    /**
     * @return array<string, mixed>
     * @throws ApiException
     */
    public function validate(
        string $licenseKey,
        ?string $domain = null,
        ?string $ip = null,
        ?string $installPath = null
    ): array {
        return $this->apiClient->validateLicense($licenseKey, $domain, $ip, $installPath);
    }
}
