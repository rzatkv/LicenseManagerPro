<?php
/**
 * License Manager Pro — WordPress admin settings view.
 *
 * Variables provided by AdminController::renderSettingsPage():
 *   $settings   array  Saved settings (api_url, api_key, signed_requests, product_map).
 *   $map        array  post/page id => array('slug', 'cycle').
 *   $pages      array  Published posts and pages available for mapping.
 *   $products   array  License Manager Pro products (slug + name), empty when unreachable.
 *   $cycles     array  The six License Manager Pro billing cycles.
 *   $test_nonce string Nonce for the connection test.
 *   $mint_nonce string Nonce for admin license minting.
 *   $version    string Plugin version.
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
    .lmp-pill{display:none;padding:4px 12px;border-radius:999px;font-size:12px;font-weight:600;line-height:1.6;vertical-align:middle;}
    .lmp-pill.lmp-busy{display:inline-block;background:#e5e7eb;color:#374151;}
    .lmp-pill.lmp-ok{display:inline-block;background:#dcfce7;color:#166534;}
    .lmp-pill.lmp-err{display:inline-block;background:#fee2e2;color:#991b1b;}
    .lmp-mint-key{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;background:#f3f4f6;border:1px solid #e5e7eb;border-radius:8px;padding:6px 10px;word-break:break-all;}
    </style>
    <div class="lmp-header">
        <svg width="40" height="40" viewBox="0 0 64 64" role="img" aria-label="License Manager Pro" style="flex:none;display:block;"><defs><linearGradient id="lmpg-wp" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#C1165E"/><stop offset="0.45" stop-color="#E56B8F"/><stop offset="0.75" stop-color="#6D5DF6"/><stop offset="1" stop-color="#7B6CFF"/></linearGradient></defs><rect x="2" y="2" width="60" height="60" rx="16" fill="url(#lmpg-wp)"/><g fill="none" stroke="#FFFFFF" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="24" cy="24" r="8.5"/><path d="M30.5 30.5 L46 46"/><path d="M38 38 L43 33"/><path d="M42.5 42.5 L47.5 37.5"/></g></svg>
        <div>
            <h1><?php esc_html_e('License Manager Pro', 'licensemanagerpro-wordpress'); ?></h1>
            <p><?php esc_html_e('Connect WordPress to License Manager Pro with a scoped module API key. Map posts and pages to products, and mint licenses for your users.', 'licensemanagerpro-wordpress'); ?></p>
        </div>
        <span class="lmp-version">v<?php echo esc_html($version); ?></span>
    </div>

    <form method="post" action="options.php">
        <?php settings_fields(\LicenseManagerPro\WordPress\Controller\AdminController::SETTINGS_GROUP); ?>
        <div class="lmp-card">
            <h2><?php esc_html_e('Connection', 'licensemanagerpro-wordpress'); ?></h2>
            <table class="form-table">
                <tr>
                    <th scope="row"><label for="lmp_api_url"><?php esc_html_e('API URL', 'licensemanagerpro-wordpress'); ?></label></th>
                    <td><input type="url" id="lmp_api_url" name="lmp_wp_settings[api_url]" value="<?php echo esc_attr($settings['api_url']); ?>" class="regular-text" placeholder="https://license.example.com" />
                    <p class="description"><?php esc_html_e('Base URL of your License Manager Pro installation, without a trailing slash. "/api" is added automatically when missing.', 'licensemanagerpro-wordpress'); ?></p></td>
                </tr>
                <tr>
                    <th scope="row"><label for="lmp_api_key"><?php esc_html_e('Module API key', 'licensemanagerpro-wordpress'); ?></label></th>
                    <td><input type="password" id="lmp_api_key" name="lmp_wp_settings[api_key]" value="<?php echo esc_attr($settings['api_key']); ?>" class="regular-text" autocomplete="off" />
                    <p class="description"><?php esc_html_e('Create a module-scoped API key in the License Manager Pro panel (API Keys → module scope, licenses + product read only) and paste it here. It is shown once when created — keep a copy. No admin email or password is used.', 'licensemanagerpro-wordpress'); ?></p></td>
                </tr>
                <tr>
                    <th scope="row"><?php esc_html_e('Signed requests', 'licensemanagerpro-wordpress'); ?></th>
                    <td><label><input type="checkbox" name="lmp_wp_settings[signed_requests]" value="1" <?php checked(!empty($settings['signed_requests'])); ?> /> <?php esc_html_e('Send HMAC-signed requests (X-LMP-Timestamp + X-LMP-Signature)', 'licensemanagerpro-wordpress'); ?></label>
                    <p class="description"><?php esc_html_e('Turn this on only when the module key requires signed requests in License Manager Pro. The signature covers the method, URL path, timestamp and body hash; timestamps older than 5 minutes are rejected by the server.', 'licensemanagerpro-wordpress'); ?></p></td>
                </tr>
            </table>
        </div>

        <div class="lmp-card">
            <h2><?php esc_html_e('Product mapping', 'licensemanagerpro-wordpress'); ?></h2>
            <?php if (empty($products)) : ?>
                <p class="description"><?php esc_html_e('License Manager Pro products could not be loaded — check the connection above, then save and reload. You can still type a product slug by hand.', 'licensemanagerpro-wordpress'); ?></p>
            <?php else : ?>
                <p class="description"><?php esc_html_e('Map each post or page to a License Manager Pro product slug and billing cycle. The suggestions come from your License Manager Pro products; you can also type a slug by hand.', 'licensemanagerpro-wordpress'); ?></p>
            <?php endif; ?>
            <datalist id="lmp-products">
                <?php foreach ($products as $product) : ?>
                    <option value="<?php echo esc_attr($product['slug']); ?>"><?php echo esc_html($product['name']); ?></option>
                <?php endforeach; ?>
            </datalist>
            <table class="widefat striped">
                <thead><tr>
                    <th><?php esc_html_e('Post / page', 'licensemanagerpro-wordpress'); ?></th>
                    <th><?php esc_html_e('License Manager Pro product slug', 'licensemanagerpro-wordpress'); ?></th>
                    <th><?php esc_html_e('Billing cycle', 'licensemanagerpro-wordpress'); ?></th>
                </tr></thead>
                <tbody>
                <?php foreach ($pages as $page) : ?>
                    <?php
                    $post_id = (int) $page->ID;
                    $row = isset($map[$post_id]) ? $map[$post_id] : array('slug' => '', 'cycle' => 'annual');
                    ?>
                    <tr>
                        <td><?php echo esc_html(get_the_title($post_id)); ?> <small>(#<?php echo esc_html($post_id); ?>)</small></td>
                        <td><input type="text" list="lmp-products" name="lmp_wp_settings[product_map][<?php echo esc_attr($post_id); ?>][slug]" value="<?php echo esc_attr($row['slug']); ?>" placeholder="my-product" /></td>
                        <td><select name="lmp_wp_settings[product_map][<?php echo esc_attr($post_id); ?>][cycle]">
                            <?php foreach ($cycles as $cycle) : ?>
                                <option value="<?php echo esc_attr($cycle); ?>" <?php selected($row['cycle'], $cycle); ?>><?php echo esc_html(ucfirst($cycle)); ?></option>
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
        <h2><?php esc_html_e('Connection test', 'licensemanagerpro-wordpress'); ?></h2>
        <p><button type="button" class="button button-primary" id="lmp-test-connection"><?php esc_html_e('Test connection', 'licensemanagerpro-wordpress'); ?></button>
        <span id="lmp-test-result" class="lmp-pill"></span></p>
    </div>

    <div class="lmp-card">
        <h2><?php esc_html_e('Mint a license', 'licensemanagerpro-wordpress'); ?></h2>
        <p class="description"><?php esc_html_e('Create a license for a customer email using a mapped product. The mapped billing cycle is sent with the request.', 'licensemanagerpro-wordpress'); ?></p>
        <p>
            <input type="email" id="lmp-mint-email" class="regular-text" placeholder="customer@example.com" />
            <select id="lmp-mint-post">
                <?php foreach ($map as $post_id => $row) : ?>
                    <option value="<?php echo esc_attr($post_id); ?>"><?php echo esc_html(get_the_title((int) $post_id)); ?> — <?php echo esc_html($row['slug']); ?> (<?php echo esc_html($row['cycle']); ?>)</option>
                <?php endforeach; ?>
            </select>
            <button type="button" class="button button-primary" id="lmp-mint-button"><?php esc_html_e('Mint license', 'licensemanagerpro-wordpress'); ?></button>
        </p>
        <p id="lmp-mint-result" style="display:none;"></p>
    </div>

    <script>
    (function () {
        var ajaxUrl = <?php echo wp_json_encode(admin_url('admin-ajax.php')); ?>;
        function postAction(action, nonce, extra, done) {
            var body = 'action=' + encodeURIComponent(action) + '&_wpnonce=' + encodeURIComponent(nonce);
            Object.keys(extra).forEach(function (k) { body += '&' + encodeURIComponent(k) + '=' + encodeURIComponent(extra[k]); });
            fetch(ajaxUrl, {method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'}, body: body})
                .then(function (r) { return r.json(); })
                .then(done)
                .catch(function (e) { done({success: false, data: e.message}); });
        }
        var testBtn = document.getElementById('lmp-test-connection');
        if (testBtn) {
            testBtn.addEventListener('click', function () {
                var out = document.getElementById('lmp-test-result');
                out.className = 'lmp-pill lmp-busy';
                out.textContent = <?php echo wp_json_encode(__('Checking...', 'licensemanagerpro-wordpress')); ?>;
                postAction('lmp_wp_test_connection', <?php echo wp_json_encode($test_nonce); ?>, {}, function (d) {
                    out.className = 'lmp-pill ' + (d.success ? 'lmp-ok' : 'lmp-err');
                    out.textContent = d.success ? d.data : (<?php echo wp_json_encode(__('Failed: ', 'licensemanagerpro-wordpress')); ?> + (d.data || 'unknown error'));
                });
            });
        }
        var mintBtn = document.getElementById('lmp-mint-button');
        if (mintBtn) {
            mintBtn.addEventListener('click', function () {
                var out = document.getElementById('lmp-mint-result');
                var email = document.getElementById('lmp-mint-email').value;
                var postId = document.getElementById('lmp-mint-post').value;
                out.style.display = 'block';
                out.textContent = <?php echo wp_json_encode(__('Minting...', 'licensemanagerpro-wordpress')); ?>;
                postAction('lmp_wp_mint_license', <?php echo wp_json_encode($mint_nonce); ?>, {email: email, post_id: postId}, function (d) {
                    if (d.success) {
                        out.innerHTML = <?php echo wp_json_encode(__('License created for ', 'licensemanagerpro-wordpress')); ?> + '<span class="lmp-mint-key"></span>';
                        out.querySelector('.lmp-mint-key').textContent = d.data.key || '';
                    } else {
                        out.textContent = <?php echo wp_json_encode(__('Failed: ', 'licensemanagerpro-wordpress')); ?> + (d.data || 'unknown error');
                    }
                });
            });
        }
    })();
    </script>
</div>
