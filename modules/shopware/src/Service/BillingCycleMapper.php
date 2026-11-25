<?php

declare(strict_types=1);

namespace Lmp\LicenseManager\Service;

/**
 * Maps a platform billing-cycle value to one of the six License Manager
 * Pro cycles. Only a value that maps to a known cycle is ever sent to
 * the backend; anything else returns null and the caller omits the
 * cycle from the request.
 */
class BillingCycleMapper
{
    public const CYCLE_MONTHLY = 'monthly';
    public const CYCLE_QUARTERLY = 'quarterly';
    public const CYCLE_SEMIANNUAL = 'semiannual';
    public const CYCLE_ANNUAL = 'annual';
    public const CYCLE_BIENNIAL = 'biennial';
    public const CYCLE_LIFETIME = 'lifetime';

    /** @var string[] */
    public const KNOWN_CYCLES = [
        self::CYCLE_MONTHLY,
        self::CYCLE_QUARTERLY,
        self::CYCLE_SEMIANNUAL,
        self::CYCLE_ANNUAL,
        self::CYCLE_BIENNIAL,
        self::CYCLE_LIFETIME,
    ];

    /** @var array<string, string> Lower-cased aliases to LMP cycles. */
    private const ALIASES = [
        'month' => self::CYCLE_MONTHLY,
        '1 month' => self::CYCLE_MONTHLY,
        '1-month' => self::CYCLE_MONTHLY,
        'monthly' => self::CYCLE_MONTHLY,
        'quarter' => self::CYCLE_QUARTERLY,
        '3 months' => self::CYCLE_QUARTERLY,
        '3-months' => self::CYCLE_QUARTERLY,
        'quarterly' => self::CYCLE_QUARTERLY,
        '6 months' => self::CYCLE_SEMIANNUAL,
        '6-months' => self::CYCLE_SEMIANNUAL,
        'half-year' => self::CYCLE_SEMIANNUAL,
        'half-yearly' => self::CYCLE_SEMIANNUAL,
        'semiannual' => self::CYCLE_SEMIANNUAL,
        'semi-annual' => self::CYCLE_SEMIANNUAL,
        'year' => self::CYCLE_ANNUAL,
        '1 year' => self::CYCLE_ANNUAL,
        '1-year' => self::CYCLE_ANNUAL,
        'yearly' => self::CYCLE_ANNUAL,
        'annual' => self::CYCLE_ANNUAL,
        '2 years' => self::CYCLE_BIENNIAL,
        '2-years' => self::CYCLE_BIENNIAL,
        'biennial' => self::CYCLE_BIENNIAL,
        'lifetime' => self::CYCLE_LIFETIME,
        'once' => self::CYCLE_LIFETIME,
        'one-time' => self::CYCLE_LIFETIME,
        'perpetual' => self::CYCLE_LIFETIME,
    ];

    public static function map(?string $value): ?string
    {
        if ($value === null) {
            return null;
        }
        $normalised = strtolower(trim($value));
        if ($normalised === '') {
            return null;
        }
        if (\in_array($normalised, self::KNOWN_CYCLES, true)) {
            return $normalised;
        }

        return self::ALIASES[$normalised] ?? null;
    }
}
