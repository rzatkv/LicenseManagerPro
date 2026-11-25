<?php
/**
 * Plugin Name: License Manager Pro — WooCommerce
 * Plugin URI: https://github.com/rzatkv/LicenseManagerPro
 * Description: Creates a License Manager Pro license when a WooCommerce order completes, and shows the key to the customer in the order, the order email and My Account → Licenses.
 * Version: 1.0.0
 * Requires at least: 6.0
 * Requires PHP: 7.4
 * Author: License Manager Pro
 * License: MIT
 * Text Domain: licensemanagerpro
 * WC requires at least: 7.0
 * WC tested up to: 9.0
 */

if (!defined('ABSPATH')) {
    exit;
}

define('LMP_WC_VERSION', '1.0.0');
define('LMP_WC_PATH', plugin_dir_path(__FILE__));

require_once LMP_WC_PATH . 'includes/class-lmp-api.php';
require_once LMP_WC_PATH . 'includes/class-lmp-orders.php';
require_once LMP_WC_PATH . 'includes/class-lmp-account.php';

/**
 * Plugin settings (one WordPress option):
 *   api_url, api_user, api_password, product_map (wc_product_id => slug + cycle)
 */
function lmp_get_settings()
{
    $defaults = array(
        'api_url' => '',
        'api_user' => '',
        'api_password' => '',
        'product_map' => array(),
    );
    $saved = get_option('lmp_settings', array());
    return array_merge($defaults, is_array($saved) ? $saved : array());
}

function lmp_get_product_map()
{
    $settings = lmp_get_settings();
    return is_array($settings['product_map']) ? $settings['product_map'] : array();
}

function lmp_make_api()
{
    $settings = lmp_get_settings();
    return new LMP_Api($settings['api_url'], $settings['api_user'], $settings['api_password']);
}

add_action('plugins_loaded', 'lmp_wc_init');
function lmp_wc_init()
{
    if (!class_exists('WooCommerce')) {
        add_action('admin_notices', 'lmp_wc_missing_notice');
        return;
    }
    $api = lmp_make_api();
    $orders = new LMP_Orders($api);
    $orders->register_hooks();
    $account = new LMP_Account($api);
    $account->register_hooks();
}

function lmp_wc_missing_notice()
{
    echo '<div class="notice notice-error"><p>'
        . esc_html__('License Manager Pro for WooCommerce needs WooCommerce to be installed and active.', 'licensemanagerpro')
        . '</p></div>';
}

// Activation: flush rewrite rules so the My Account → Licenses endpoint works.
register_activation_hook(__FILE__, 'lmp_wc_activate');
function lmp_wc_activate()
{
    add_rewrite_endpoint('licenses', EP_ROOT | EP_PAGES);
    flush_rewrite_rules();
}
register_deactivation_hook(__FILE__, 'flush_rewrite_rules');

// ---------------------------------------------------------------- settings

add_action('admin_menu', 'lmp_wc_admin_menu');
function lmp_wc_admin_menu()
{
    add_submenu_page(
        'woocommerce',
        __('License Manager Pro', 'licensemanagerpro'),
        __('License Manager Pro', 'licensemanagerpro'),
        'manage_woocommerce',
        'licensemanagerpro',
        'lmp_wc_settings_page'
    );
}

add_action('admin_init', 'lmp_wc_register_settings');
function lmp_wc_register_settings()
{
    register_setting('lmp_settings_group', 'lmp_settings');
}

add_action('wp_ajax_lmp_test_connection', 'lmp_wc_ajax_test_connection');
function lmp_wc_ajax_test_connection()
{
    check_ajax_referer('lmp_test_connection');
    if (!current_user_can('manage_woocommerce')) {
        wp_send_json_error('Not allowed.');
    }
    $api = lmp_make_api();
    $token = $api->get_token();
    if (is_wp_error($token)) {
        wp_send_json_error($token->get_error_message());
    }
    $info = $api->get('/system/info');
    if (is_wp_error($info)) {
        wp_send_json_error($info->get_error_message());
    }
    wp_send_json_success('Connected to License Manager Pro version ' . (isset($info['version']) ? $info['version'] : 'unknown'));
}

function lmp_wc_settings_page()
{
    if (!current_user_can('manage_woocommerce')) {
        wp_die(esc_html__('You do not have permission to access this page.', 'licensemanagerpro'));
    }
    $settings = lmp_get_settings();
    $map = lmp_get_product_map();
    $products = wc_get_products(array('limit' => -1, 'status' => 'publish'));
    $cycles = array('monthly', 'quarterly', 'semiannual', 'annual', 'biennial', 'lifetime');
    ?>
    <div class="wrap">
        <h1><?php esc_html_e('License Manager Pro', 'licensemanagerpro'); ?></h1>
        <p><?php esc_html_e('Connect this store to License Manager Pro. When an order completes, one license is created for every mapped product and shown to the customer.', 'licensemanagerpro'); ?></p>
        <form method="post" action="options.php">
            <?php settings_fields('lmp_settings_group'); ?>
            <table class="form-table">
                <tr>
                    <th scope="row"><label for="lmp_api_url"><?php esc_html_e('API URL', 'licensemanagerpro'); ?></label></th>
                    <td><input type="url" id="lmp_api_url" name="lmp_settings[api_url]" value="<?php echo esc_attr($settings['api_url']); ?>" class="regular-text" placeholder="https://license.example.com/api" />
                    <p class="description"><?php esc_html_e('Base URL of your License Manager Pro API, without a trailing slash.', 'licensemanagerpro'); ?></p></td>
                </tr>
                <tr>
                    <th scope="row"><label for="lmp_api_user"><?php esc_html_e('Admin email', 'licensemanagerpro'); ?></label></th>
                    <td><input type="email" id="lmp_api_user" name="lmp_settings[api_user]" value="<?php echo esc_attr($settings['api_user']); ?>" class="regular-text" /></td>
                </tr>
                <tr>
                    <th scope="row"><label for="lmp_api_password"><?php esc_html_e('Admin password', 'licensemanagerpro'); ?></label></th>
                    <td><input type="password" id="lmp_api_password" name="lmp_settings[api_password]" value="<?php echo esc_attr($settings['api_password']); ?>" class="regular-text" />
                    <p class="description"><?php esc_html_e('An admin user in License Manager Pro. Used only to log in and get a JWT; the token is cached for 50 minutes.', 'licensemanagerpro'); ?></p></td>
                </tr>
            </table>
            <h2><?php esc_html_e('Product mapping', 'licensemanagerpro'); ?></h2>
            <p><?php esc_html_e('Map each WooCommerce product to a License Manager Pro product slug and billing cycle. Only mapped products get a license.', 'licensemanagerpro'); ?></p>
            <table class="widefat striped">
                <thead><tr>
                    <th><?php esc_html_e('WooCommerce product', 'licensemanagerpro'); ?></th>
                    <th><?php esc_html_e('License Manager Pro product slug', 'licensemanagerpro'); ?></th>
                    <th><?php esc_html_e('Billing cycle', 'licensemanagerpro'); ?></th>
                </tr></thead>
                <tbody>
                <?php foreach ($products as $product) : ?>
                    <?php $pid = (int) $product->get_id(); $row = isset($map[$pid]) ? $map[$pid] : array('slug' => '', 'cycle' => 'annual'); ?>
                    <tr>
                        <td><?php echo esc_html($product->get_name()); ?> <small>(#<?php echo esc_html($pid); ?>)</small></td>
                        <td><input type="text" name="lmp_settings[product_map][<?php echo esc_attr($pid); ?>][slug]" value="<?php echo esc_attr($row['slug']); ?>" placeholder="cloudpanel-pro" /></td>
                        <td><select name="lmp_settings[product_map][<?php echo esc_attr($pid); ?>][cycle]">
                            <?php foreach ($cycles as $cycle) : ?>
                                <option value="<?php echo esc_attr($cycle); ?>" <?php selected($row['cycle'], $cycle); ?>><?php echo esc_html($cycle); ?></option>
                            <?php endforeach; ?>
                        </select></td>
                    </tr>
                <?php endforeach; ?>
                </tbody>
            </table>
            <?php submit_button(); ?>
        </form>
        <h2><?php esc_html_e('Connection test', 'licensemanagerpro'); ?></h2>
        <p><button type="button" class="button" id="lmp-test-connection"><?php esc_html_e('Test connection', 'licensemanagerpro'); ?></button>
        <span id="lmp-test-result"></span></p>
        <script>
        document.getElementById('lmp-test-connection').addEventListener('click', function () {
            var out = document.getElementById('lmp-test-result');
            out.textContent = 'Checking...';
            fetch(ajaxurl, {method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'},
                body: 'action=lmp_test_connection&_wpnonce=<?php echo wp_create_nonce('lmp_test_connection'); ?>'})
                .then(function (r) { return r.json(); })
                .then(function (d) { out.textContent = d.success ? d.data : ('Failed: ' + (d.data || 'unknown error')); });
        });
        </script>
    </div>
    <?php
}
