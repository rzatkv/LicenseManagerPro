<?php
/**
 * License Manager Pro — shared branding for admin and site views.
 *
 * One source for the wordmark, gradient header, status pills and the
 * inline SVG key mark. All CSS is inline in the page (no external
 * assets, no web fonts, no CDN). Dynamic values are escaped here, so
 * templates can echo the helpers directly.
 */

declare(strict_types=1);

namespace Licensemanagerpro\Component\Licensemanagerpro\Administrator\Helper;

final class Branding
{
    public const GRADIENT = 'linear-gradient(135deg, #C1165E 0%, #6D5DF6 100%)';

    private const PILL_CLASSES = [
        'active' => 'lmp-pill lmp-pill--active',
        'inactive' => 'lmp-pill lmp-pill--inactive',
        'revoked' => 'lmp-pill lmp-pill--revoked',
        'expired' => 'lmp-pill lmp-pill--expired',
    ];

    /** Inline SVG key mark (currentColor, scales with the header). */
    public static function keyIcon(string $size = '28'): string
    {
        return '<svg class="lmp-key-icon" width="' . $size . '" height="' . $size . '" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M14.5 3a5.5 5.5 0 0 0-5.39 6.61L3 15.72V21h5.28l1.47-1.47v-2h2l1.06-1.06v-2h2l1.58-1.58A5.5 5.5 0 1 0 14.5 3Zm1 4.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z"/></svg>';
    }

    /** Branded page header: gradient band, key mark, title, subtitle. */
    public static function header(string $title, string $subtitle = ''): string
    {
        $html = '<div class="lmp-header"><span class="lmp-header__mark">' . self::keyIcon() . '</span>'
            . '<span class="lmp-header__text"><span class="lmp-header__title">'
            . htmlspecialchars($title, ENT_QUOTES, 'UTF-8')
            . '</span>';
        if ($subtitle !== '') {
            $html .= '<span class="lmp-header__subtitle">' . htmlspecialchars($subtitle, ENT_QUOTES, 'UTF-8') . '</span>';
        }
        return $html . '</span></div>';
    }

    /** Status pill for a license status (unknown statuses get a neutral pill). */
    public static function statusPill(string $status): string
    {
        $class = self::PILL_CLASSES[$status] ?? 'lmp-pill';
        return '<span class="' . $class . '">' . htmlspecialchars(ucfirst($status), ENT_QUOTES, 'UTF-8') . '</span>';
    }

    /** The full inline stylesheet used by every admin and site view. */
    public static function style(): string
    {
        return <<<'CSS'
<style>
.lmp-wrap { font-family: -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; color: #1e2433; max-width: 1100px; margin: 0 auto; }
.lmp-header { display: flex; align-items: center; gap: 14px; padding: 18px 22px; border-radius: 16px; background: linear-gradient(135deg, #C1165E 0%, #6D5DF6 100%); color: #fff; box-shadow: 0 8px 24px rgba(109, 93, 246, .28); margin-bottom: 20px; }
.lmp-header__mark { display: flex; align-items: center; justify-content: center; width: 44px; height: 44px; flex: 0 0 44px; border-radius: 12px; background: rgba(255, 255, 255, .18); }
.lmp-header__text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.lmp-header__title { font-size: 20px; font-weight: 700; letter-spacing: .2px; white-space: nowrap; }
.lmp-header__subtitle { font-size: 13px; opacity: .85; }
.lmp-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; margin-bottom: 20px; }
.lmp-card { background: #fff; border: 1px solid #e6e8f0; border-radius: 16px; padding: 18px 20px; box-shadow: 0 2px 10px rgba(30, 36, 51, .05); }
.lmp-card h3 { margin: 0 0 12px; font-size: 15px; font-weight: 700; color: #1e2433; }
.lmp-card p { margin: 0 0 8px; font-size: 13px; line-height: 1.55; color: #4a5165; }
.lmp-card p:last-child { margin-bottom: 0; }
.lmp-label { display: block; font-size: 12px; font-weight: 600; color: #4a5165; margin: 10px 0 4px; }
.lmp-label:first-child { margin-top: 0; }
.lmp-input, .lmp-select { width: 100%; box-sizing: border-box; padding: 9px 11px; border: 1px solid #d4d7e3; border-radius: 10px; font-size: 14px; background: #fff; color: #1e2433; }
.lmp-input:focus, .lmp-select:focus { outline: 2px solid #6D5DF6; outline-offset: 1px; border-color: #6D5DF6; }
.lmp-btn { display: inline-block; padding: 9px 16px; border: 0; border-radius: 10px; font-size: 13px; font-weight: 700; cursor: pointer; background: linear-gradient(135deg, #C1165E 0%, #6D5DF6 100%); color: #fff; text-decoration: none; }
.lmp-btn:hover { filter: brightness(1.08); }
.lmp-btn--ghost { background: #eef0f7; color: #1e2433; }
.lmp-btn--danger { background: #c0392b; }
.lmp-btn--small { padding: 5px 10px; font-size: 12px; border-radius: 8px; }
.lmp-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
.lmp-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.lmp-table th, .lmp-table td { text-align: left; padding: 9px 10px; border-bottom: 1px solid #eef0f7; vertical-align: middle; }
.lmp-table th { font-size: 11px; text-transform: uppercase; letter-spacing: .5px; color: #6b7280; }
.lmp-table tr:last-child td { border-bottom: 0; }
.lmp-key { font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace; font-size: 12px; word-break: break-all; background: #f4f5fb; border: 1px solid #e6e8f0; border-radius: 8px; padding: 4px 8px; }
.lmp-pill { display: inline-block; padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 700; background: #eef0f7; color: #4a5165; white-space: nowrap; }
.lmp-pill--active { background: #e3f7ec; color: #137a3f; }
.lmp-pill--inactive { background: #fff4d6; color: #8a6100; }
.lmp-pill--revoked { background: #fde8e8; color: #b42318; }
.lmp-pill--expired { background: #fde8e8; color: #b42318; }
.lmp-status-ok { color: #137a3f; font-weight: 700; }
.lmp-status-bad { color: #b42318; font-weight: 700; }
.lmp-inline-form { display: inline; }
.lmp-muted { color: #6b7280; font-size: 12px; }
.lmp-license-card { margin-bottom: 14px; }
.lmp-license-card__head { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; }
.lmp-license-card__product { font-size: 16px; font-weight: 700; }
.lmp-license-card__meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 8px 16px; font-size: 13px; color: #4a5165; }
.lmp-license-card__meta b { display: block; font-size: 11px; text-transform: uppercase; letter-spacing: .5px; color: #6b7280; font-weight: 600; }
.lmp-key-row { display: flex; gap: 8px; align-items: center; margin-top: 12px; flex-wrap: wrap; }
.lmp-key-row .lmp-key { flex: 1 1 auto; }
@media (max-width: 640px) { .lmp-header__title { font-size: 17px; } .lmp-table { display: block; overflow-x: auto; } }
</style>
CSS;
    }
}
