<?php
/**
 * License Manager Pro — billing-cycle mapping.
 *
 * License Manager Pro knows exactly six cycles. Joomla core has no
 * billing cycles of its own, so subscription extensions describe
 * periods in their own words ("1 year", "6 months", "forever", ...).
 * This mapper translates those period strings to a License Manager
 * Pro cycle. Anything without a known equivalent maps to null, and
 * the caller must omit the cycle from the request rather than guess.
 */

declare(strict_types=1);

namespace Licensemanagerpro\Component\Licensemanagerpro\Administrator\Model;

final class CycleMapper
{
    public const MONTHLY = 'monthly';
    public const QUARTERLY = 'quarterly';
    public const SEMIANNUAL = 'semiannual';
    public const ANNUAL = 'annual';
    public const BIENNIAL = 'biennial';
    public const LIFETIME = 'lifetime';

    /** The six cycles License Manager Pro accepts, in display order. */
    public const CYCLES = [
        self::MONTHLY,
        self::QUARTERLY,
        self::SEMIANNUAL,
        self::ANNUAL,
        self::BIENNIAL,
        self::LIFETIME,
    ];

    /** Normalised period string => License Manager Pro cycle. */
    private const MAP = [
        'monthly' => self::MONTHLY,
        'month' => self::MONTHLY,
        '1 month' => self::MONTHLY,
        '1 months' => self::MONTHLY,
        'quarterly' => self::QUARTERLY,
        'quarter' => self::QUARTERLY,
        '3 months' => self::QUARTERLY,
        'semiannual' => self::SEMIANNUAL,
        'semi-annually' => self::SEMIANNUAL,
        'semiannually' => self::SEMIANNUAL,
        '6 months' => self::SEMIANNUAL,
        'annual' => self::ANNUAL,
        'annually' => self::ANNUAL,
        'yearly' => self::ANNUAL,
        'year' => self::ANNUAL,
        '1 year' => self::ANNUAL,
        '12 months' => self::ANNUAL,
        'biennial' => self::BIENNIAL,
        'biennially' => self::BIENNIAL,
        '2 years' => self::BIENNIAL,
        '24 months' => self::BIENNIAL,
        'lifetime' => self::LIFETIME,
        'life-time' => self::LIFETIME,
        'one time' => self::LIFETIME,
        'one-time' => self::LIFETIME,
        'once' => self::LIFETIME,
        'forever' => self::LIFETIME,
        'never expires' => self::LIFETIME,
        'perpetual' => self::LIFETIME,
    ];

    /**
     * Map a period string to a License Manager Pro cycle, or null when
     * it has no known equivalent (caller must then omit the cycle).
     */
    public static function map(?string $value): ?string
    {
        if ($value === null) {
            return null;
        }
        $normalised = strtolower(trim($value));
        $normalised = (string) preg_replace('/\s+/', ' ', $normalised);
        return self::MAP[$normalised] ?? null;
    }

    public static function isKnownCycle(?string $value): bool
    {
        return $value !== null && in_array($value, self::CYCLES, true);
    }
}
