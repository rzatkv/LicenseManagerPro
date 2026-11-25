<?php
/**
 * License Manager Pro — WooCommerce admin settings page.
 *
 * View layer: renders the settings form. It receives plain data from
 * LMP_Admin::render_settings_page() and contains no business logic
 * and no HTTP calls. Inline CSS/SVG only (magenta #C1165E -> violet
 * #6D5DF6), no external assets.
 *
 * Variables in scope: $settings, $map, $products (WooCommerce
 * products), $lmp_products (License Manager Pro products for the
 * dropdowns, possibly empty), $lmp_error (why the list failed, or ''),
 * $api_configured, $cycles, $test_nonce, $version.
 *
 * Product mapping: each WooCommerce product gets a dropdown of live
 * License Manager Pro products (value = slug). When the list could
 * not be loaded, the row falls back to a plain text field for the
 * slug, with an inline error above the table — the page never breaks
 * and a previously saved slug is never wiped.
 */

if (!defined('ABSPATH')) {
    exit;
}
?>
<div class="wrap lmp-wrap">
    <style>
    .lmp-wrap{max-width:960px;}
    .lmp-header{display:flex;align-items:center;gap:14px;padding:20px 24px;border-radius:16px;background:linear-gradient(135deg,#C1165E,#6D5DF6);color:#fff;margin:12px 0 0;}
    .lmp-header h1{color:#fff;margin:0;font-size:22px;line-height:1.3;}
    .lmp-header p{color:rgba(255,255,255,.85);margin:4px 0 0;font-size:13px;}
    .lmp-version{margin-left:auto;flex:none;background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.35);color:#fff;border-radius:999px;padding:4px 12px;font-size:12px;font-weight:600;}
    .lmp-card{background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:20px 24px;margin-top:16px;box-shadow:0 1px 2px rgba(0,0,0,.04);}
    .lmp-card h2{margin-top:0;font-size:16px;}
    .lmp-card .description{color:#6b7280;}
    .lmp-notice{border:1px solid #f59e0b;background:#fffbeb;color:#92400e;border-radius:8px;padding:10px 14px;font-size:13px;margin:0 0 12px;}
    .lmp-pill{display:none;padding:4px 12px;border-radius:999px;font-size:12px;font-weight:600;line-height:1.6;vertical-align:middle;}
    .lmp-pill.lmp-busy{display:inline-block;background:#e5e7eb;color:#374151;}
    .lmp-pill.lmp-ok{display:inline-block;background:#dcfce7;color:#166534;}
    .lmp-pill.lmp-err{display:inline-block;background:#fee2e2;color:#991b1b;}
    </style>
    <div class="lmp-header">
        <svg width="40" height="40" viewBox="0 0 64 64" role="img" aria-label="License Manager Pro" style="flex:none;display:block;"><defs><linearGradient id="lmpg-wc" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#C1165E"/><stop offset="0.45" stop-color="#E56B8F"/><stop offset="0.75" stop-color="#6D5DF6"/><stop offset="1" stop-color="#7B6CFF"/></linearGradient></defs><rect x="2" y="2" width="60" height="60" rx="16" fill="url(#lmpg-wc)"/><g fill="none" stroke="#FFFFFF" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="24" cy="24" r="8.5"/><path d="M30.5 30.5 L46 46"/><path d="M38 38 L43 33"/><path d="M42.5 42.5 L47.5 37.5"/></g></svg>
        <div>
            <h1><?php esc_html_e('License Manager Pro', 'licensemanagerpro'); ?></h1>
            <p><?php esc_html_e('Connect this store to License Manager Pro. When an order completes, one license is created for every mapped product and shown to the customer.', 'licensemanagerpro'); ?></p>
        </div>
        <span class="lmp-version">v<?php echo esc_html($version); ?></span>
    </div>
    <form method="post" action="options.php">
        <?php settings_fields('lmp_settings_group'); ?>
        <div class="lmp-card">
        <h2><?php esc_html_e('Connection', 'licensemanagerpro'); ?></h2>
        <p class="description"><?php esc_html_e('One module-scoped API key connects this store — no admin login is used. Create the key in the License Manager Pro panel (API Keys page, module-key toggle), copy the secret once, and paste it here.', 'licensemanagerpro'); ?></p>
        <table class="form-table">
            <tr>
                <th scope="row"><label for="lmp_api_url"><?php esc_html_e('API URL', 'licensemanagerpro'); ?></label></th>
                <td><input type="url" id="lmp_api_url" name="lmp_settings[api_url]" value="<?php echo esc_attr($settings['api_url']); ?>" class="regular-text" placeholder="https://license.example.com/api" />
                <p class="description"><?php esc_html_e('Base URL of your License Manager Pro API, without a trailing slash.', 'licensemanagerpro'); ?></p></td>
            </tr>
            <tr>
                <th scope="row"><label for="lmp_api_key"><?php esc_html_e('API key', 'licensemanagerpro'); ?></label></th>
                <td><input type="password" id="lmp_api_key" name="lmp_settings[api_key]" value="<?php echo esc_attr($settings['api_key']); ?>" class="regular-text" autocomplete="off" />
                <p class="description"><?php esc_html_e('Module-scoped API key (30/90/180/365-day expiry, shown once when created). The key can only create/read/renew/revoke/validate licenses, read products, and read system info.', 'licensemanagerpro'); ?></p></td>
            </tr>
            <tr>
                <th scope="row"><?php esc_html_e('Signed requests', 'licensemanagerpro'); ?></th>
                <td><label><input type="checkbox" name="lmp_settings[signed_requests]" value="1" <?php checked(!empty($settings['signed_requests'])); ?> /> <?php esc_html_e('Sign requests (HMAC)', 'licensemanagerpro'); ?></label>
                <p class="description"><?php esc_html_e('Send X-LMP-Timestamp + X-LMP-Signature with every request. Only enable this when the API key was created with "require signed requests".', 'licensemanagerpro'); ?></p></td>
            </tr>
        </table>
        </div>
        <div class="lmp-card">
        <h2><?php esc_html_e('Product mapping', 'licensemanagerpro'); ?></h2>
        <p><?php esc_html_e('Map each WooCommerce product to a License Manager Pro product and billing cycle. Only mapped products get a license.', 'licensemanagerpro'); ?></p>
        <?php if (empty($lmp_products) && $api_configured) : ?>
            <p class="lmp-notice"><?php
                echo esc_html__('Could not load the product list from License Manager Pro: ', 'licensemanagerpro')
                    . esc_html($lmp_error !== '' ? $lmp_error : __('unknown error', 'licensemanagerpro'))
                    . ' ' . esc_html__('Type the product slug manually below, or fix the API URL / key and save to retry.', 'licensemanagerpro');
            ?></p>
        <?php elseif (empty($lmp_products)) : ?>
            <p class="lmp-notice"><?php esc_html_e('Save the API URL and API key above first — the product dropdowns will load from License Manager Pro when you reopen this page. Until then, type the product slug manually.', 'licensemanagerpro'); ?></p>
        <?php endif; ?>
        <table class="widefat striped">
            <thead><tr>
                <th><?php esc_html_e('WooCommerce product', 'licensemanagerpro'); ?></th>
                <th><?php esc_html_e('License Manager Pro product', 'licensemanagerpro'); ?></th>
                <th><?php esc_html_e('Billing cycle', 'licensemanagerpro'); ?></th>
            </tr></thead>
            <tbody>
            <?php foreach ($products as $product) : ?>
                <?php $pid = (int) $product->get_id(); $row = isset($map[$pid]) ? $map[$pid] : array('slug' => '', 'cycle' => 'annual'); ?>
                <tr>
                    <td><?php echo esc_html($product->get_name()); ?> <small>(#<?php echo esc_html($pid); ?>)</small></td>
                    <td>
                    <?php if (!empty($lmp_products)) : ?>
                        <select name="lmp_settings[product_map][<?php echo esc_attr($pid); ?>][slug]">
                            <option value=""><?php esc_html_e('— no license —', 'licensemanagerpro'); ?></option>
                            <?php
                            $saved_slug = isset($row['slug']) ? (string) $row['slug'] : '';
                            $saved_in_list = false;
                            foreach ($lmp_products as $lmp_product) {
                                if ($lmp_product['slug'] === $saved_slug) {
                                    $saved_in_list = true;
                                }
                                ?>
                                <option value="<?php echo esc_attr($lmp_product['slug']); ?>" <?php selected($saved_slug, $lmp_product['slug']); ?>><?php echo esc_html(LMP_Admin::product_option_label($lmp_product)); ?></option>
                            <?php } ?>
                            <?php if ($saved_slug !== '' && !$saved_in_list) : ?>
                                <option value="<?php echo esc_attr($saved_slug); ?>" selected><?php echo esc_html($saved_slug . ' ' . __('(saved value — not in the current product list)', 'licensemanagerpro')); ?></option>
                            <?php endif; ?>
                        </select>
                    <?php else : ?>
                        <input type="text" name="lmp_settings[product_map][<?php echo esc_attr($pid); ?>][slug]" value="<?php echo esc_attr($row['slug']); ?>" placeholder="cloudpanel-pro" />
                    <?php endif; ?>
                    </td>
                    <td><select name="lmp_settings[product_map][<?php echo esc_attr($pid); ?>][cycle]">
                        <?php foreach ($cycles as $cycle) : ?>
                            <option value="<?php echo esc_attr($cycle); ?>" <?php selected($row['cycle'], $cycle); ?>><?php echo esc_html($cycle); ?></option>
                        <?php endforeach; ?>
                    </select></td>
                </tr>
            <?php endforeach; ?>
            </tbody>
        </table>
        </div>
        <?php submit_button(); ?>
    </form>
    <div class="lmp-card">
    <h2><?php esc_html_e('Connection test', 'licensemanagerpro'); ?></h2>
    <p><button type="button" class="button button-primary" id="lmp-test-connection"><?php esc_html_e('Test connection', 'licensemanagerpro'); ?></button>
    <span id="lmp-test-result" class="lmp-pill"></span></p>
    <script>
    document.getElementById('lmp-test-connection').addEventListener('click', function () {
        var out = document.getElementById('lmp-test-result');
        out.className = 'lmp-pill lmp-busy';
        out.textContent = 'Checking...';
        fetch(ajaxurl, {method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'},
            body: 'action=lmp_test_connection&_wpnonce=<?php echo esc_js($test_nonce); ?>'})
            .then(function (r) { return r.json(); })
            .then(function (d) {
                out.className = 'lmp-pill ' + (d.success ? 'lmp-ok' : 'lmp-err');
                out.textContent = d.success ? d.data : ('Failed: ' + (d.data || 'unknown error'));
            })
            .catch(function (e) {
                out.className = 'lmp-pill lmp-err';
                out.textContent = 'Failed: ' + e.message;
            });
    });
    </script>
    </div>
</div>
