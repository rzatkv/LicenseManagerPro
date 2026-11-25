<?php
/**
 * License Manager Pro — WordPress "My Licenses" view.
 *
 * Variables provided by FrontendController::renderShortcode():
 *   $licenses      array  Licenses owned by the logged-in user (or empty on error).
 *   $mapped        array  Mapped products: post_id, title, slug, cycle.
 *   $notice        string|null Notice to show above the list.
 *   $notice_is_error bool  Whether $notice is an error.
 *   $mint_nonce    string Nonce for the mint form.
 *   $fixed_product string LMP slug fixed by the shortcode attribute, or ''.
 *   $fixed_cycle   string|null LMP cycle fixed by the shortcode attribute.
 *   $email         string Logged-in user's email.
 */

if (!defined('ABSPATH')) {
    exit;
}

function lmp_wp_status_class(string $status): string
{
    switch (strtolower($status)) {
        case 'active':
            return 'lmp-status-active';
        case 'revoked':
            return 'lmp-status-revoked';
        case 'expired':
            return 'lmp-status-expired';
        default:
            return 'lmp-status-inactive';
    }
}

function lmp_wp_format_expiry(array $license): string
{
    if (!empty($license['expires_at'])) {
        $timestamp = strtotime((string) $license['expires_at']);
        if ($timestamp !== false) {
            return date_i18n(get_option('date_format'), $timestamp);
        }
        return (string) $license['expires_at'];
    }
    if (isset($license['expires_in_days'])) {
        return sprintf(
            /* translators: %d: number of days. */
            _n('%d day left', '%d days left', (int) $license['expires_in_days'], 'licensemanagerpro-wordpress'),
            (int) $license['expires_in_days']
        );
    }
    return __('No expiry', 'licensemanagerpro-wordpress');
}
?>
<div class="lmp-my-licenses">
    <style>
    .lmp-my-licenses{max-width:960px;margin:0 auto;}
    .lmp-my-header{display:flex;align-items:center;gap:14px;padding:20px 24px;border-radius:16px;background:linear-gradient(135deg,#C1165E,#6D5DF6);color:#fff;}
    .lmp-my-header h2{color:#fff;margin:0;font-size:22px;line-height:1.3;}
    .lmp-my-header p{color:rgba(255,255,255,.85);margin:4px 0 0;font-size:13px;}
    .lmp-notice{border-radius:12px;padding:12px 16px;margin-top:16px;font-size:14px;}
    .lmp-notice-info{background:#eef2ff;border:1px solid #c7d2fe;color:#3730a3;}
    .lmp-notice-ok{background:#dcfce7;border:1px solid #86efac;color:#166534;}
    .lmp-notice-err{background:#fee2e2;border:1px solid #fca5a5;color:#991b1b;}
    .lmp-mint-card{background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:20px 24px;margin-top:16px;box-shadow:0 1px 2px rgba(0,0,0,.04);}
    .lmp-mint-card h3{margin:0 0 4px;font-size:16px;}
    .lmp-mint-card p{color:#6b7280;margin:0 0 12px;font-size:14px;}
    .lmp-mint-row{display:flex;flex-wrap:wrap;gap:10px;align-items:center;}
    .lmp-mint-row select{flex:1 1 220px;padding:8px 10px;border:1px solid #d1d5db;border-radius:10px;font-size:14px;}
    .lmp-btn{flex:none;padding:9px 18px;border:0;border-radius:999px;background:linear-gradient(135deg,#C1165E,#6D5DF6);color:#fff;font-size:14px;font-weight:600;cursor:pointer;}
    .lmp-btn:hover{opacity:.92;}
    .lmp-license-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px;margin-top:16px;}
    .lmp-license-card{background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:20px;box-shadow:0 1px 2px rgba(0,0,0,.04);}
    .lmp-license-card h3{margin:0 0 10px;font-size:16px;}
    .lmp-license-meta{color:#6b7280;font-size:13px;margin:0 0 12px;line-height:1.7;}
    .lmp-key-row{display:flex;gap:8px;align-items:center;}
    .lmp-key-chip{flex:1;min-width:0;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:13px;background:#f3f4f6;border:1px solid #e5e7eb;border-radius:8px;padding:7px 10px;overflow-wrap:anywhere;}
    .lmp-copy-btn{flex:none;padding:7px 12px;border:1px solid #d1d5db;border-radius:8px;background:#fff;font-size:13px;cursor:pointer;}
    .lmp-copy-btn:hover{background:#f9fafb;}
    .lmp-pill{display:inline-block;padding:3px 12px;border-radius:999px;font-size:12px;font-weight:600;line-height:1.6;}
    .lmp-status-active{background:#dcfce7;color:#166534;}
    .lmp-status-inactive{background:#e5e7eb;color:#374151;}
    .lmp-status-revoked{background:#fee2e2;color:#991b1b;}
    .lmp-status-expired{background:#fef3c7;color:#92400e;}
    .lmp-empty{background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:28px;text-align:center;color:#6b7280;margin-top:16px;}
    </style>

    <div class="lmp-my-header">
        <svg width="40" height="40" viewBox="0 0 64 64" role="img" aria-label="License Manager Pro" style="flex:none;display:block;"><defs><linearGradient id="lmpg-wp-front" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#C1165E"/><stop offset="0.45" stop-color="#E56B8F"/><stop offset="0.75" stop-color="#6D5DF6"/><stop offset="1" stop-color="#7B6CFF"/></linearGradient></defs><rect x="2" y="2" width="60" height="60" rx="16" fill="url(#lmpg-wp-front)"/><g fill="none" stroke="#FFFFFF" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="24" cy="24" r="8.5"/><path d="M30.5 30.5 L46 46"/><path d="M38 38 L43 33"/><path d="M42.5 42.5 L47.5 37.5"/></g></svg>
        <div>
            <h2><?php esc_html_e('My Licenses', 'licensemanagerpro-wordpress'); ?></h2>
            <p><?php echo esc_html($email); ?></p>
        </div>
    </div>

    <?php if ($notice !== null) : ?>
        <div class="lmp-notice <?php echo $notice_is_error ? 'lmp-notice-err' : 'lmp-notice-ok'; ?>"><?php echo esc_html($notice); ?></div>
    <?php endif; ?>

    <?php if ($fixed_product !== '' || !empty($mapped)) : ?>
        <div class="lmp-mint-card">
            <h3><?php esc_html_e('Get a license', 'licensemanagerpro-wordpress'); ?></h3>
            <p><?php esc_html_e('Create a license for your account. It appears in the list below right away.', 'licensemanagerpro-wordpress'); ?></p>
            <form method="post" action="">
                <?php wp_nonce_field(\LicenseManagerPro\WordPress\Controller\FrontendController::NONCE_MINT, 'lmp_wp_mint_nonce'); ?>
                <?php if ($fixed_product === '') : ?>
                    <div class="lmp-mint-row">
                        <select name="lmp_wp_post_id" required>
                            <?php foreach ($mapped as $item) : ?>
                                <option value="<?php echo esc_attr($item['post_id']); ?>"><?php echo esc_html($item['title']); ?> — <?php echo esc_html($item['slug']); ?> (<?php echo esc_html($item['cycle']); ?>)</option>
                            <?php endforeach; ?>
                        </select>
                        <button type="submit" class="lmp-btn"><?php esc_html_e('Get a license', 'licensemanagerpro-wordpress'); ?></button>
                    </div>
                <?php else : ?>
                    <div class="lmp-mint-row">
                        <span><?php echo esc_html($fixed_product); ?><?php echo $fixed_cycle !== null ? ' (' . esc_html($fixed_cycle) . ')' : ''; ?></span>
                        <button type="submit" class="lmp-btn"><?php esc_html_e('Get a license', 'licensemanagerpro-wordpress'); ?></button>
                    </div>
                <?php endif; ?>
            </form>
        </div>
    <?php endif; ?>

    <?php if (empty($licenses)) : ?>
        <div class="lmp-empty"><?php esc_html_e('You do not have any licenses yet.', 'licensemanagerpro-wordpress'); ?></div>
    <?php else : ?>
        <div class="lmp-license-grid">
            <?php foreach ($licenses as $license) : ?>
                <?php
                $status = isset($license['status']) ? (string) $license['status'] : 'unknown';
                $key = isset($license['key']) ? (string) $license['key'] : '';
                $product_name = isset($license['product']) ? (string) $license['product'] : __('License', 'licensemanagerpro-wordpress');
                $cycle = isset($license['billing_cycle']) ? (string) $license['billing_cycle'] : '';
                ?>
                <div class="lmp-license-card">
                    <h3><?php echo esc_html($product_name); ?>
                        <span class="lmp-pill <?php echo esc_attr(lmp_wp_status_class($status)); ?>"><?php echo esc_html(ucfirst($status)); ?></span>
                    </h3>
                    <p class="lmp-license-meta">
                        <?php if ($cycle !== '') : ?>
                            <?php esc_html_e('Billing cycle:', 'licensemanagerpro-wordpress'); ?> <?php echo esc_html(ucfirst($cycle)); ?><br />
                        <?php endif; ?>
                        <?php esc_html_e('Expires:', 'licensemanagerpro-wordpress'); ?> <?php echo esc_html(lmp_wp_format_expiry($license)); ?>
                    </p>
                    <div class="lmp-key-row">
                        <code class="lmp-key-chip"><?php echo esc_html($key); ?></code>
                        <button type="button" class="lmp-copy-btn" data-lmp-key="<?php echo esc_attr($key); ?>"><?php esc_html_e('Copy', 'licensemanagerpro-wordpress'); ?></button>
                    </div>
                </div>
            <?php endforeach; ?>
        </div>
    <?php endif; ?>

    <script>
    (function () {
        document.querySelectorAll('.lmp-copy-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var key = btn.getAttribute('data-lmp-key') || '';
                var done = function () { btn.textContent = <?php echo wp_json_encode(__('Copied', 'licensemanagerpro-wordpress')); ?>; };
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(key).then(done, function () { fallbackCopy(key, done); });
                } else {
                    fallbackCopy(key, done);
                }
            });
        });
        function fallbackCopy(text, done) {
            var ta = document.createElement('textarea');
            ta.value = text;
            document.body.appendChild(ta);
            ta.select();
            try { document.execCommand('copy'); done(); } catch (e) { /* copy unavailable */ }
            document.body.removeChild(ta);
        }
    })();
    </script>
</div>
