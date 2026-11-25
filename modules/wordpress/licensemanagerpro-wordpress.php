<?php
/**
 * Plugin Name: License Manager Pro — WordPress
 * Plugin URI: https://github.com/rzatkv/LicenseManagerPro
 * Description: Connects WordPress to License Manager Pro with a scoped module API key. Maps posts and pages to License Manager Pro products, lets logged-in users view and mint their licenses on a "My Licenses" page, and lets admins mint licenses from Settings. No WooCommerce required.
 * Version: 2.3.3
 * Requires at least: 6.0
 * Requires PHP: 8.0
 * Author: License Manager Pro
 * License: MIT
 * Text Domain: licensemanagerpro-wordpress
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

define('LMP_WP_VERSION', '2.3.3');
define('LMP_WP_PATH', plugin_dir_path(__FILE__));

require_once LMP_WP_PATH . 'includes/Model/ApiClient.php';
require_once LMP_WP_PATH . 'includes/Model/LicenseRepository.php';
require_once LMP_WP_PATH . 'includes/Controller/AdminController.php';
require_once LMP_WP_PATH . 'includes/Controller/FrontendController.php';

add_action('plugins_loaded', 'lmp_wp_init');
function lmp_wp_init(): void
{
    $api = \LicenseManagerPro\WordPress\Controller\AdminController::makeClient();
    $repository = new \LicenseManagerPro\WordPress\Model\LicenseRepository($api);

    $admin = new \LicenseManagerPro\WordPress\Controller\AdminController($api, $repository);
    $admin->registerHooks();

    $frontend = new \LicenseManagerPro\WordPress\Controller\FrontendController($repository);
    $frontend->registerHooks();
}

register_activation_hook(
    __FILE__,
    array('LicenseManagerPro\WordPress\Controller\FrontendController', 'activate')
);
register_deactivation_hook(
    __FILE__,
    array('LicenseManagerPro\WordPress\Controller\FrontendController', 'deactivate')
);
