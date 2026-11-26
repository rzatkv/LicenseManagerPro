<?php

declare(strict_types=1);

namespace Lmp\LicenseManager\Service;

use Psr\Log\LoggerInterface;

/**
 * Business operations against the License Manager Pro backend.
 *
 * Every method fails closed: on any API error it logs the failure and
 * returns null (or false for revoke), and no license is created.
 * The billing cycle is only ever sent when it maps to a known LMP
 * cycle (see BillingCycleMapper); otherwise it is omitted and the
 * backend applies the product default.
 */
class LicenseService
{
    private ApiClient $apiClient;
    private LoggerInterface $logger;

    public function __construct(ApiClient $apiClient, LoggerInterface $logger)
    {
        $this->apiClient = $apiClient;
        $this->logger = $logger;
    }

    public function getLastError(): string
    {
        return $this->apiClient->getLastError();
    }

    /**
     * Mint a license for a product slug.
     *
     * @return array<string, mixed>|null The created license on HTTP 201, null on failure.
     */
    public function createLicense(string $productSlug, string $ownerEmail, ?string $billingCycle = null): ?array
    {
        // The backend takes product_id, not a slug: resolve it first
        // (same pattern as the WHMCS / WooCommerce modules).
        $products = $this->getProductBySlug($productSlug);
        if (!\is_array($products) || \count($products) !== 1 || !isset($products[0]['id'])) {
            $this->logger->error('[LMP] License Manager Pro product "{slug}" was not found.', [
                'slug' => $productSlug,
            ]);

            return null;
        }
        $payload = [
            'product_id' => (int) $products[0]['id'],
            'owner_email' => $ownerEmail,
        ];
        $cycle = BillingCycleMapper::map($billingCycle);
        if ($cycle !== null) {
            $payload['billing_cycle'] = $cycle;
        }
        $license = $this->apiClient->post('/licenses', $payload);
        if ($license === null) {
            $this->logger->error('[LMP] Failed to mint license for product {slug} / {email}: {error}', [
                'slug' => $productSlug,
                'email' => $ownerEmail,
                'error' => $this->apiClient->getLastError(),
            ]);

            return null;
        }

        return $license;
    }

    /**
     * All licenses owned by an e-mail address.
     *
     * @return array<int, array<string, mixed>>
     */
    public function findLicensesByEmail(string $email): array
    {
        $result = $this->apiClient->get('/licenses?search=' . urlencode($email));
        if ($result === null) {
            $this->logger->error('[LMP] Failed to list licenses for {email}: {error}', [
                'email' => $email,
                'error' => $this->apiClient->getLastError(),
            ]);

            return [];
        }
        if (isset($result['items']) && \is_array($result['items'])) {
            return array_values($result['items']);
        }
        if (array_is_list($result)) {
            return $result;
        }

        return [];
    }

    /**
     * @return array<string, mixed>|null
     */
    public function getLicense(int $licenseId): ?array
    {
        return $this->apiClient->get('/licenses/' . $licenseId);
    }

    /**
     * @return array<string, mixed>|null
     */
    public function renewLicense(int $licenseId, ?string $billingCycle = null): ?array
    {
        // The backend takes the new cycle as a ?billing_cycle= query param
        // (same as the WHMCS module); a body field would be ignored.
        $path = '/licenses/' . $licenseId . '/renew';
        $cycle = BillingCycleMapper::map($billingCycle);
        if ($cycle !== null) {
            $path .= '?billing_cycle=' . urlencode($cycle);
        }

        return $this->apiClient->post($path, []);
    }

    public function revokeLicense(int $licenseId): bool
    {
        return $this->apiClient->delete('/licenses/' . $licenseId) !== null;
    }

    /**
     * @return array<string, mixed>|null Validation response, null on API failure.
     */
    /**
     * POST /licenses/validate — check a key against domain/IP/install path.
     * PUBLIC endpoint (v3.0): sends no API key and no HMAC signature —
     * the check is open to any server; the blacklist still applies
     * server-side.
     */
    public function validateLicense(string $licenseKey, ?string $domain = null, ?string $ip = null, ?string $installPath = null): ?array
    {
        $payload = ['key' => $licenseKey];
        if ($domain !== null && $domain !== '') {
            $payload['domain'] = $domain;
        }
        if ($ip !== null && $ip !== '') {
            $payload['ip'] = $ip;
        }
        if ($installPath !== null && $installPath !== '') {
            $payload['install_path'] = $installPath;
        }

        return $this->apiClient->post('/licenses/validate', $payload, true);
    }

    /**
     * @return list<array<string, mixed>>|null The raw product list for a slug.
     */
    public function getProductBySlug(string $slug): ?array
    {
        return $this->apiClient->get('/products?slug=' . urlencode($slug));
    }
}
