<?php
/**
 * License Manager Pro — license data layer.
 *
 * A plain value object plus a small repository that talks to the
 * License Manager Pro API through LmpApiClient. No license data is
 * stored locally in PrestaShop; the backend is the source of truth.
 */

declare(strict_types=1);

if (!defined('_PS_VERSION_')) {
    exit;
}

class LmpLicense
{
    public const STATUS_ACTIVE = 'active';
    public const STATUS_SUSPENDED = 'suspended';
    public const STATUS_REVOKED = 'revoked';
    public const STATUS_EXPIRED = 'expired';

    public const VALID_STATUSES = [
        self::STATUS_ACTIVE,
        self::STATUS_SUSPENDED,
        self::STATUS_REVOKED,
        self::STATUS_EXPIRED,
    ];

    public function __construct(
        public readonly int $id,
        public readonly string $licenseKey,
        public readonly string $status,
        public readonly ?string $productName,
        public readonly ?string $ownerEmail,
        public readonly ?string $billingCycle,
        public readonly ?string $expiresAt,
        public readonly ?string $createdAt
    ) {
    }

    public static function fromArray(array $data): self
    {
        $productName = null;
        if (isset($data['product']) && is_array($data['product'])) {
            $productName = isset($data['product']['name']) ? (string) $data['product']['name'] : null;
        } elseif (isset($data['product_name'])) {
            $productName = (string) $data['product_name'];
        }

        return new self(
            (int) ($data['id'] ?? 0),
            (string) ($data['license_key'] ?? $data['key'] ?? ''),
            (string) ($data['status'] ?? ''),
            $productName,
            isset($data['owner_email']) ? (string) $data['owner_email'] : null,
            isset($data['billing_cycle']) ? (string) $data['billing_cycle'] : null,
            isset($data['expires_at']) ? (string) $data['expires_at'] : null,
            isset($data['created_at']) ? (string) $data['created_at'] : null
        );
    }

    public function isActive(): bool
    {
        return $this->status === self::STATUS_ACTIVE;
    }

    /**
     * All licenses owned by one customer email, newest first.
     *
     * @return LmpLicense[]
     */
    public static function findByEmail(LmpApiClient $client, string $email): array
    {
        $result = $client->listLicensesByEmail($email);
        if (!$result['ok'] || !is_array($result['data'])) {
            return [];
        }

        $licenses = [];
        foreach ($result['data'] as $row) {
            if (is_array($row)) {
                $licenses[] = self::fromArray($row);
            }
        }

        return $licenses;
    }

    public static function findById(LmpApiClient $client, int $licenseId): ?self
    {
        $result = $client->getLicense($licenseId);
        if (!$result['ok'] || !is_array($result['data'])) {
            return null;
        }

        return self::fromArray($result['data']);
    }

    /**
     * Mint a license. Returns the new license, or null on any failure
     * (including 401/403 — the caller must not retry silently).
     */
    public static function create(
        LmpApiClient $client,
        ?int $productId,
        ?string $productSlug,
        string $ownerEmail,
        ?string $billingCycle = null
    ): ?self {
        $result = $client->createLicense($productId, $productSlug, $ownerEmail, $billingCycle);
        if (!$result['ok'] || !is_array($result['data'])) {
            return null;
        }

        return self::fromArray($result['data']);
    }

    public static function renew(LmpApiClient $client, int $licenseId, ?string $billingCycle = null): ?self
    {
        $result = $client->renewLicense($licenseId, $billingCycle);
        if (!$result['ok'] || !is_array($result['data'])) {
            return null;
        }

        return self::fromArray($result['data']);
    }

    public static function revoke(LmpApiClient $client, int $licenseId): bool
    {
        return $client->revokeLicense($licenseId)['ok'];
    }

    public static function setStatus(LmpApiClient $client, int $licenseId, string $status): bool
    {
        if (!in_array($status, self::VALID_STATUSES, true)) {
            return false;
        }

        return $client->setLicenseStatus($licenseId, $status)['ok'];
    }
}
