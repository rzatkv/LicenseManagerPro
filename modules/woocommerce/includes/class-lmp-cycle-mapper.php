<?php
/**
 * License Manager Pro — WooCommerce billing-cycle mapping.
 *
 * Model layer: pure functions that map billing periods to the six
 * billing cycles License Manager Pro understands. No HTTP, no
 * WordPress state — testable on its own.
 *
 * WooCommerce Subscriptions billing periods are day / week / month /
 * year ('quarter' is accepted defensively for other subscription
 * plugins). Only month / quarter / year have a License Manager Pro
 * equivalent; day / week (and anything else) return null, and the
 * caller falls back to the mapped cycle from the admin product
 * mapping.
 */

if (!defined('ABSPATH')) {
    exit;
}

class LMP_Cycle_Mapper
{
    /** The six billing cycles License Manager Pro understands. */
    const CYCLES = array(
        'monthly',
        'quarterly',
        'semiannual',
        'annual',
        'biennial',
        'lifetime',
    );

    /**
     * Map a subscription billing period to a License Manager Pro
     * cycle. Returns null when there is no equivalent.
     */
    public static function from_subscription_period($period)
    {
        $map = array(
            'month' => 'monthly',
            'quarter' => 'quarterly',
            'year' => 'annual',
        );
        $key = strtolower(trim((string) $period));
        return isset($map[$key]) ? $map[$key] : null;
    }

    /**
     * True when $cycle is one of the six License Manager Pro cycles.
     */
    public static function is_valid_cycle($cycle)
    {
        return in_array($cycle, self::CYCLES, true);
    }
}
