<?php
/**
 * License Manager Pro — billing-cycle vocabulary and mapping.
 *
 * License Manager Pro knows exactly six billing cycles. Magento has no
 * native billing-cycle concept for a simple product, so cycles arrive
 * from the product mapping (or the optional lmp_billing_cycle product
 * attribute) in one of the spellings below. Anything that does not map
 * to a known cycle returns null and the caller omits the cycle, so the
 * backend never receives an invalid value.
 */

declare(strict_types=1);

namespace Lmp\LicenseManager\Model;

class BillingCycle
{
    public const MONTHLY = 'monthly';
    public const QUARTERLY = 'quarterly';
    public const SEMIANNUAL = 'semiannual';
    public const ANNUAL = 'annual';
    public const BIENNIAL = 'biennial';
    public const LIFETIME = 'lifetime';

    /** @var string[] */
    public const ALL = [
        self::MONTHLY,
        self::QUARTERLY,
        self::SEMIANNUAL,
        self::ANNUAL,
        self::BIENNIAL,
        self::LIFETIME,
    ];

    /**
     * Map of accepted spellings (lower-cased, trimmed) to LMP cycles.
     *
     * @var array<string, string>
     */
    private const ALIASES = [
        'monthly' => self::MONTHLY,
        'month' => self::MONTHLY,
        '1 month' => self::MONTHLY,
        'quarterly' => self::QUARTERLY,
        'quarter' => self::QUARTERLY,
        '3 months' => self::QUARTERLY,
        'semiannual' => self::SEMIANNUAL,
        'semi-annual' => self::SEMIANNUAL,
        'half-yearly' => self::SEMIANNUAL,
        '6 months' => self::SEMIANNUAL,
        'annual' => self::ANNUAL,
        'yearly' => self::ANNUAL,
        'year' => self::ANNUAL,
        '12 months' => self::ANNUAL,
        'biennial' => self::BIENNIAL,
        '2 years' => self::BIENNIAL,
        '24 months' => self::BIENNIAL,
        'lifetime' => self::LIFETIME,
        'one-time' => self::LIFETIME,
        'onetime' => self::LIFETIME,
        'perpetual' => self::LIFETIME,
    ];

    public static function isValid(?string $cycle): bool
    {
        return $cycle !== null && in_array($cycle, self::ALL, true);
    }

    /**
     * Normalize any accepted spelling to an LMP cycle, or null when the
     * value has no known equivalent. Never throws.
     */
    public static function normalize(mixed $value): ?string
    {
        if (!is_string($value)) {
            return null;
        }
        $key = strtolower(trim($value));

        return self::ALIASES[$key] ?? null;
    }
}
