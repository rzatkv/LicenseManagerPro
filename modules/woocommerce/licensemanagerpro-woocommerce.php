<?php
/**
 * Plugin Name: License Manager Pro — WooCommerce
 * Plugin URI: https://github.com/rzatkv/LicenseManagerPro
 * Description: Creates a License Manager Pro license when a WooCommerce order completes, and shows the key to the customer in the order, the order email and My Account → Licenses.
 * Version: 3.0.0
 * Requires at least: 6.0
 * Requires PHP: 7.4
 * Author: License Manager Pro
 * License: MIT
 * Text Domain: licensemanagerpro
 * WC requires at least: 7.0
 * WC tested up to: 9.0
 *
 * Bootstrap only: constants, class loading, settings accessors, and
 * hook registration. Layers:
 *   Model      includes/class-lmp-api.php          (HTTP + X-API-Key + HMAC signing)
 *              includes/class-lmp-cycle-mapper.php (subscription period -> LMP cycle)
 *   Controller includes/class-lmp-orders.php       (order-completed hook)
 *              includes/class-lmp-account.php      (My Account endpoint + deactivate)
 *              includes/class-lmp-admin.php        (settings page handlers, Test Connection)
 *   View       includes/views/admin-settings.php  (settings page)
 *              includes/views/my-licenses.php     (My Account → Licenses tab)
 *
 * Authentication is API-key-only: ONE module-scoped API key in the
 * plugin settings (WooCommerce → License Manager Pro). There is no
 * login call and no admin credential anywhere in this plugin.
 */

if (!defined('ABSPATH')) {
    exit;
}

define('LMP_WC_VERSION', '3.0.0');
define('LMP_WC_PATH', plugin_dir_path(__FILE__));

require_once LMP_WC_PATH . 'includes/class-lmp-api.php';
require_once LMP_WC_PATH . 'includes/class-lmp-cycle-mapper.php';
require_once LMP_WC_PATH . 'includes/class-lmp-admin.php';
require_once LMP_WC_PATH . 'includes/class-lmp-orders.php';
require_once LMP_WC_PATH . 'includes/class-lmp-account.php';

/**
 * Plugin settings (one WordPress option):
 *   api_url, api_key, signed_requests, product_map (wc_product_id => slug + cycle)
 */
function lmp_get_settings()
{
    $defaults = array(
        'api_url' => '',
        'api_key' => '',
        'signed_requests' => false,
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
    return new LMP_Api($settings['api_url'], $settings['api_key'], !empty($settings['signed_requests']));
}

add_action('plugins_loaded', 'lmp_wc_init');
function lmp_wc_init()
{
    if (!class_exists('WooCommerce')) {
        add_action('admin_notices', 'lmp_wc_missing_notice');
        return;
    }
    $api = lmp_make_api();
    $admin = new LMP_Admin($api);
    $admin->register_hooks();
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
