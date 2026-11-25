<?php

namespace Drupal\licensemanagerpro\Service;

/**
 * The six billing cycles License Manager Pro understands.
 *
 * Drupal has no native recurring-billing cycle, so the module never
 * invents one: it sends only a value from this list, chosen by the
 * administrator (settings default or mint form), and omits the cycle
 * whenever the source value cannot be mapped to one of these.
 */
final class BillingCycle {

  public const MONTHLY = 'monthly';
  public const QUARTERLY = 'quarterly';
  public const SEMIANNUAL = 'semiannual';
  public const ANNUAL = 'annual';
  public const BIENNIAL = 'biennial';
  public const LIFETIME = 'lifetime';

  public const DEFAULT_CYCLE = self::ANNUAL;

  /**
   * @return string[]
   */
  public const ALL = [
    self::MONTHLY,
    self::QUARTERLY,
    self::SEMIANNUAL,
    self::ANNUAL,
    self::BIENNIAL,
    self::LIFETIME,
  ];

  public static function isValid(?string $cycle): bool {
    return $cycle !== NULL && in_array($cycle, static::ALL, TRUE);
  }

  /**
   * @return array<string, string> Cycle value => human label.
   */
  public static function labels(): array {
    return [
      static::MONTHLY => 'Monthly',
      static::QUARTERLY => 'Quarterly',
      static::SEMIANNUAL => 'Semi-annual',
      static::ANNUAL => 'Annual',
      static::BIENNIAL => 'Biennial',
      static::LIFETIME => 'Lifetime',
    ];
  }

  /**
   * Map a platform cycle spelling to a License Manager Pro cycle.
   *
   * Returns NULL for anything without a known equivalent; callers must
   * omit the cycle in that case instead of sending a guess.
   */
  public static function mapPlatformCycle(string $cycle): ?string {
    $normalized = strtolower(trim(str_replace(['-', '_', ' '], '', $cycle)));
    $map = [
      'monthly' => static::MONTHLY,
      'month' => static::MONTHLY,
      'quarterly' => static::QUARTERLY,
      'quarter' => static::QUARTERLY,
      'semiannual' => static::SEMIANNUAL,
      'semiannually' => static::SEMIANNUAL,
      'halfyearly' => static::SEMIANNUAL,
      'annual' => static::ANNUAL,
      'annually' => static::ANNUAL,
      'yearly' => static::ANNUAL,
      'year' => static::ANNUAL,
      'biennial' => static::BIENNIAL,
      'biennially' => static::BIENNIAL,
      'lifetime' => static::LIFETIME,
      'onetime' => static::LIFETIME,
      'once' => static::LIFETIME,
    ];
    return $map[$normalized] ?? NULL;
  }

}
