<?php
/**
 * License Manager Pro — WHMCS server module billing-cycle mapping.
 *
 * Model layer: maps a WHMCS service billing cycle to one of the six
 * billing cycles License Manager Pro understands. No HTTP, no WHMCS
 * state — a pure function, so it can be unit-tested on its own.
 *
 * Triennially has no License Manager Pro equivalent: it maps to
 * 'biennial' (the longest non-lifetime cycle) rather than being
 * dropped, so a triennial service still gets a finite expiry instead
 * of silently falling back to the product default. 'Free Account' and
 * anything unrecognised return null, and the caller falls back to the
 * product's configured billing cycle.
 */

if (!defined('WHMCS')) {
    die('This file cannot be accessed directly');
}

class LMP_BillingCycle
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
     * Map a WHMCS billing cycle to a License Manager Pro cycle.
     * Returns null when there is no equivalent (Free Account, empty,
     * or an unknown value) — the caller then uses the configured
     * fallback cycle.
     */
    public static function map($whmcsCycle)
    {
        $map = array(
            'Monthly' => 'monthly',
            'Quarterly' => 'quarterly',
            'Semi-Annually' => 'semiannual',
            'Annually' => 'annual',
            'Biennially' => 'biennial',
            // No triennial cycle exists in License Manager Pro: the
            // closest cycle is biennial (2 years, the longest
            // non-lifetime cycle). Documented in README.md.
            'Triennially' => 'biennial',
            'One Time' => 'lifetime',
        );
        $key = trim((string) $whmcsCycle);
        return isset($map[$key]) ? $map[$key] : null;
    }

    /**
     * True when $cycle is one of the six License Manager Pro cycles.
     */
    public static function isValid($cycle)
    {
        return in_array($cycle, self::CYCLES, true);
    }
}
