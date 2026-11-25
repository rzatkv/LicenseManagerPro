<?php
/**
 * License Manager Pro — WHMCS server module admin services tab.
 *
 * View layer: renders the branded license card shown on the admin
 * service page (AdminServicesTabFields). It receives plain data — a
 * license array and the resolved WHMCS billing cycle — and returns
 * HTML. It makes no HTTP calls and contains no business logic.
 *
 * Every dynamic value is escaped. The card uses inline CSS/SVG only
 * (magenta #C1165E -> violet #6D5DF6, key glyph), no external assets.
 */

if (!defined('WHMCS')) {
    die('This file cannot be accessed directly');
}

class LMP_AdminTabView
{
    /**
     * Render the license card for one license, or a plain "not found"
     * message when $license is null.
     */
    public static function render($license, $resolvedCycle, $apiUrl)
    {
        if ($license === null) {
            return 'No license found in License Manager Pro for this service.';
        }
        $key = isset($license['key']) ? (string) $license['key'] : '-';
        $status = isset($license['status']) ? (string) $license['status'] : '-';
        $product = isset($license['product']) ? (string) $license['product'] : '-';
        $cycle = isset($license['billing_cycle']) ? (string) $license['billing_cycle'] : '-';
        $owner = isset($license['owner_email']) ? (string) $license['owner_email'] : '-';
        $expires = (isset($license['expires_at']) && $license['expires_at'])
            ? (string) $license['expires_at']
            : 'Never (lifetime)';
        $activations = (isset($license['activations']) ? (int) $license['activations'] : 0)
            . ' / ' . (isset($license['max_activations']) ? (int) $license['max_activations'] : 1);
        // The WHMCS cycle that will be used for this service (mapped
        // service cycle, or the configured fallback): shown so the
        // admin can see which cycle Create/Renew/ChangePackage sends.
        $whmcsCycle = ($resolvedCycle !== null && $resolvedCycle !== '')
            ? (string) $resolvedCycle
            : '-';

        $keyEsc = self::esc($key);
        $productEsc = self::esc($product);
        $cycleEsc = self::esc($cycle);
        $whmcsCycleEsc = self::esc($whmcsCycle);
        $ownerEsc = self::esc($owner);
        $expiresEsc = self::esc($expires);
        $activationsEsc = self::esc($activations);
        $pill = self::statusPill($status);
        $mark = self::keyMark(22);
        $footerHtml = self::footer($apiUrl);

        // NOTE on WHMCS escaping: WHMCS renders AdminServicesTabFields
        // values as raw HTML in the service admin tab (it historically
        // does NOT escape them), which is what makes this branded card
        // possible. Every dynamic value is escaped above anyway, so API
        // data can never inject markup. If a future WHMCS version
        // starts escaping tab-field values, this card would show as
        // literal HTML text instead — the data would still be intact,
        // only the styling would be lost.
        $card = <<<HTML
<div style="max-width:640px;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;background:#ffffff;font-family:inherit;">
  <div style="display:flex;align-items:center;gap:8px;padding:10px 14px;background:linear-gradient(135deg,#C1165E,#6D5DF6);color:#ffffff;font-size:14px;font-weight:700;">
    {$mark}<span>LicenseManagerPro</span><span style="margin-left:auto;">{$pill}</span>
  </div>
  <div style="padding:14px 14px 6px;">
    <div style="font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#9ca3af;">License Key</div>
    <div style="display:flex;gap:8px;margin-top:6px;">
      <input type="text" readonly value="{$keyEsc}" onclick="this.select();" style="flex:1;min-width:0;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;color:#9d174d;background:#fdf2f8;border:1px solid #f9a8d4;border-radius:8px;padding:6px 10px;" />
      <button type="button" onclick="var i=this.previousElementSibling;i.focus();i.select();if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(i.value).catch(function(){document.execCommand('copy');});}else{document.execCommand('copy');}this.textContent='Copied!';" style="flex:none;cursor:pointer;border:1px solid #e5e7eb;background:#ffffff;color:#374151;border-radius:8px;padding:6px 12px;font-size:12px;font-weight:600;">Copy</button>
    </div>
  </div>
  <div style="padding:6px 14px 12px;">
    <div style="display:flex;justify-content:space-between;gap:12px;padding:7px 0;border-bottom:1px solid #f3f4f6;"><span style="color:#6b7280;font-size:13px;">Product</span><span style="color:#111827;font-size:13px;font-weight:500;text-align:right;">{$productEsc}</span></div>
    <div style="display:flex;justify-content:space-between;gap:12px;padding:7px 0;border-bottom:1px solid #f3f4f6;"><span style="color:#6b7280;font-size:13px;">Billing Cycle</span><span style="color:#111827;font-size:13px;font-weight:500;text-align:right;">{$cycleEsc}</span></div>
    <div style="display:flex;justify-content:space-between;gap:12px;padding:7px 0;border-bottom:1px solid #f3f4f6;"><span style="color:#6b7280;font-size:13px;">WHMCS Billing Cycle</span><span style="color:#111827;font-size:13px;font-weight:500;text-align:right;">{$whmcsCycleEsc}</span></div>
    <div style="display:flex;justify-content:space-between;gap:12px;padding:7px 0;border-bottom:1px solid #f3f4f6;"><span style="color:#6b7280;font-size:13px;">Owner Email</span><span style="color:#111827;font-size:13px;font-weight:500;text-align:right;">{$ownerEsc}</span></div>
    <div style="display:flex;justify-content:space-between;gap:12px;padding:7px 0;border-bottom:1px solid #f3f4f6;"><span style="color:#6b7280;font-size:13px;">Expires At</span><span style="color:#111827;font-size:13px;font-weight:500;text-align:right;">{$expiresEsc}</span></div>
    <div style="display:flex;justify-content:space-between;gap:12px;padding:7px 0;"><span style="color:#6b7280;font-size:13px;">Activations</span><span style="color:#111827;font-size:13px;font-weight:500;text-align:right;">{$activationsEsc}</span></div>
  </div>
{$footerHtml}</div>
HTML;
        return $card;
    }

    /**
     * Escape a value for safe output inside the admin tab HTML.
     */
    public static function esc($value)
    {
        return htmlspecialchars((string) $value, ENT_QUOTES, 'UTF-8');
    }

    /**
     * Colored status pill: green Active, amber Inactive, red
     * Revoked/Expired, grey anything else.
     */
    public static function statusPill($status)
    {
        $status = (string) $status;
        $lower = strtolower($status);
        if ($lower === 'active') {
            $bg = '#dcfce7'; $fg = '#166534';
        } elseif ($lower === 'inactive') {
            $bg = '#fef3c7'; $fg = '#92400e';
        } elseif ($lower === 'revoked' || $lower === 'expired') {
            $bg = '#fee2e2'; $fg = '#991b1b';
        } else {
            $bg = '#e5e7eb'; $fg = '#374151';
        }
        return '<span style="display:inline-block;padding:2px 10px;border-radius:999px;font-size:12px;font-weight:600;line-height:1.6;background:' . $bg . ';color:' . $fg . ';">' . self::esc(ucfirst($status)) . '</span>';
    }

    /**
     * Small inline key mark (simplified License Manager Pro logo: key
     * glyph on a magenta -> violet gradient tile). Inline SVG only,
     * no external assets.
     */
    public static function keyMark($size)
    {
        $size = (int) $size;
        return '<svg width="' . $size . '" height="' . $size . '" viewBox="0 0 64 64" role="img" aria-label="License Manager Pro" style="flex:none;display:block;">'
            . '<defs><linearGradient id="lmpg-whmcs" x1="0" y1="0" x2="1" y2="1">'
            . '<stop offset="0" stop-color="#C1165E"/><stop offset="0.45" stop-color="#E56B8F"/>'
            . '<stop offset="0.75" stop-color="#6D5DF6"/><stop offset="1" stop-color="#7B6CFF"/>'
            . '</linearGradient></defs>'
            . '<rect x="2" y="2" width="60" height="60" rx="16" fill="url(#lmpg-whmcs)"/>'
            . '<g fill="none" stroke="#FFFFFF" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round">'
            . '<circle cx="24" cy="24" r="8.5"/><path d="M30.5 30.5 L46 46"/>'
            . '<path d="M38 38 L43 33"/><path d="M42.5 42.5 L47.5 37.5"/></g></svg>';
    }

    /**
     * Footer: module version (read from version.json, never hardcoded)
     * and a link to the API Docs page of the configured API URL.
     */
    private static function footer($apiUrl)
    {
        $footer = '';
        $version = self::moduleVersion();
        if ($version !== null) {
            $footer .= '<span>Module v' . self::esc($version) . '</span>';
        }
        $docsUrl = self::docsUrl($apiUrl);
        if ($docsUrl !== null) {
            if ($footer !== '') {
                $footer .= '<span style="color:#d1d5db;"> &middot; </span>';
            }
            $footer .= '<a href="' . self::esc($docsUrl) . '" target="_blank" rel="noopener" style="color:#C1165E;font-weight:600;text-decoration:none;">API Docs</a>';
        }
        return ($footer !== '')
            ? '<div style="padding:10px 14px;border-top:1px solid #f3f4f6;font-size:12px;color:#6b7280;">' . $footer . '</div>'
            : '';
    }

    /**
     * Read the module version from modules/whmcs/version.json (three
     * levels above this file). Returns the version string, or null
     * when the file cannot be read — the footer then simply omits the
     * version instead of showing a hardcoded one that could drift.
     */
    public static function moduleVersion()
    {
        $file = __DIR__ . '/../../../version.json';
        if (!is_readable($file)) {
            return null;
        }
        $data = json_decode(file_get_contents($file), true);
        return (is_array($data) && isset($data['version']) && $data['version'] !== '')
            ? (string) $data['version']
            : null;
    }

    /**
     * Derive the API Docs URL from the configured API URL: strip a
     * trailing "/api" and append "/docs". Returns null when no usable
     * URL is configured.
     */
    private static function docsUrl($apiUrl)
    {
        $base = rtrim((string) $apiUrl, '/');
        $base = preg_replace('#/api$#', '', $base);
        return ($base === '' || $base === null) ? null : $base . '/docs';
    }
}
