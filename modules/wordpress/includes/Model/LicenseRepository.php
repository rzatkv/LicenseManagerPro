<?php
/**
 * License Manager Pro — WordPress (without WooCommerce).
 *
 * Model layer: thin data layer over ApiClient. Owns the billing-cycle
 * mapping (only the six License Manager Pro cycles are ever sent) and
 * resolves a product slug to a product id before creating a license.
 */

declare(strict_types=1);

namespace LicenseManagerPro\WordPress\Model;

if (!defined('ABSPATH')) {
    exit;
}

final class LicenseRepository
{
    /** License statuses the backend accepts on update. */
    public const LICENSE_STATUSES = array('active', 'inactive', 'revoked');

    private ApiClient $api;

    public function __construct(ApiClient $api)
    {
        $this->api = $api;
    }

    /**
     * Map a platform cycle to a License Manager Pro cycle.
     * WordPress has no native subscriptions, so the cycle comes from the
     * admin-chosen mapping (or a shortcode attribute). Anything that is
     * not one of the six known cycles maps to null and is omitted from
     * the request instead of being sent.
     */
    public static function mapCycle(?string $cycle): ?string
    {
        $normalized = $cycle !== null ? strtolower(trim($cycle)) : '';
        return in_array($normalized, ApiClient::BILLING_CYCLES, true) ? $normalized : null;
    }

    public function listProducts(): array|\WP_Error
    {
        return $this->api->listProducts();
    }

    public function findProductBySlug(string $slug): array|\WP_Error
    {
        return $this->api->findProductBySlug($slug);
    }

    public function licensesForEmail(string $email): array|\WP_Error
    {
        return $this->api->listLicensesByEmail($email);
    }

    public function getLicense(int $license_id): array|\WP_Error
    {
        return $this->api->getLicense($license_id);
    }

    /**
     * Create a license for a product slug + owner email. The slug is
     * resolved to a product id first; the cycle is mapped (unknown
     * cycles are omitted, letting the backend fall back to the
     * product's default). Returns the license array, or a WP_Error.
     */
    public function createLicenseForSlug(
        string $slug,
        string $owner_email,
        ?string $cycle = null
    ): array|\WP_Error {
        $product = $this->api->findProductBySlug($slug);
        if (is_wp_error($product)) {
            return $product;
        }
        if (!isset($product['id'])) {
            return new \WP_Error(
                'lmp_product',
                sprintf('License Manager Pro product "%s" has no id.', $slug)
            );
        }
        return $this->api->createLicense(
            (int) $product['id'],
            self::mapCycle($cycle),
            $owner_email
        );
    }

    public function updateLicenseStatus(int $license_id, string $status): array|\WP_Error
    {
        $normalized = strtolower(trim($status));
        if (!in_array($normalized, self::LICENSE_STATUSES, true)) {
            return new \WP_Error(
                'lmp_status',
                sprintf('Unknown license status "%s".', $status)
            );
        }
        return $this->api->updateLicenseStatus($license_id, $normalized);
    }

    public function revokeLicense(int $license_id): array|\WP_Error
    {
        return $this->api->revokeLicense($license_id);
    }

    public function renewLicense(int $license_id, ?string $cycle = null): array|\WP_Error
    {
        return $this->api->renewLicense($license_id, self::mapCycle($cycle));
    }

    public function validateLicense(
        string $license_key,
        ?string $domain = null,
        ?string $ip = null,
        ?string $install_path = null
    ): array|\WP_Error {
        return $this->api->validateLicense($license_key, $domain, $ip, $install_path);
    }
}
