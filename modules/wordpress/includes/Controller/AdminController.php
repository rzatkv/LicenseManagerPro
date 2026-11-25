<?php
/**
 * License Manager Pro — WordPress (without WooCommerce).
 *
 * Controller layer: admin settings page (Settings menu), product
 * mapping, connection test (AJAX) and admin license minting (AJAX).
 * All rendering lives in templates/admin-settings.php.
 */

declare(strict_types=1);

namespace LicenseManagerPro\WordPress\Controller;

use LicenseManagerPro\WordPress\Model\ApiClient;
use LicenseManagerPro\WordPress\Model\LicenseRepository;

if (!defined('ABSPATH')) {
    exit;
}

final class AdminController
{
    public const OPTION_NAME = 'lmp_wp_settings';
    public const SETTINGS_GROUP = 'lmp_wp_settings_group';
    public const PAGE_SLUG = 'licensemanagerpro-wordpress';
    public const AJAX_TEST_ACTION = 'lmp_wp_test_connection';
    public const AJAX_MINT_ACTION = 'lmp_wp_mint_license';
    public const NONCE_TEST = 'lmp_wp_test_connection';
    public const NONCE_MINT = 'lmp_wp_mint_license';
    public const PRODUCTS_TRANSIENT = 'lmp_wp_products';
    public const PRODUCTS_TRANSIENT_TTL = 10 * MINUTE_IN_SECONDS;

    private ApiClient $api;
    private LicenseRepository $repository;

    public function __construct(ApiClient $api, LicenseRepository $repository)
    {
        $this->api = $api;
        $this->repository = $repository;
    }

    public function registerHooks(): void
    {
        add_action('admin_menu', array($this, 'registerMenu'));
        add_action('admin_init', array($this, 'registerSettings'));
        add_action('wp_ajax_' . self::AJAX_TEST_ACTION, array($this, 'ajaxTestConnection'));
        add_action('wp_ajax_' . self::AJAX_MINT_ACTION, array($this, 'ajaxMintLicense'));
    }

    public static function getSettings(): array
    {
        $defaults = array(
            'api_url' => '',
            'api_key' => '',
            'signed_requests' => false,
            'product_map' => array(),
        );
        $saved = get_option(self::OPTION_NAME, array());
        return array_merge($defaults, is_array($saved) ? $saved : array());
    }

    /** Mapped post/page id => array('slug' => LMP slug, 'cycle' => LMP cycle). */
    public static function getProductMap(): array
    {
        $settings = self::getSettings();
        return is_array($settings['product_map']) ? $settings['product_map'] : array();
    }

    public static function makeClient(): ApiClient
    {
        $settings = self::getSettings();
        return new ApiClient(
            (string) $settings['api_url'],
            (string) $settings['api_key'],
            (bool) $settings['signed_requests']
        );
    }

    public static function makeRepository(): LicenseRepository
    {
        return new LicenseRepository(self::makeClient());
    }

    public function registerMenu(): void
    {
        add_options_page(
            __('License Manager Pro', 'licensemanagerpro-wordpress'),
            __('License Manager Pro', 'licensemanagerpro-wordpress'),
            'manage_options',
            self::PAGE_SLUG,
            array($this, 'renderSettingsPage')
        );
    }

    public function registerSettings(): void
    {
        register_setting(
            self::SETTINGS_GROUP,
            self::OPTION_NAME,
            array('sanitize_callback' => array($this, 'sanitizeSettings'))
        );
    }

    /**
     * Sanitize the settings form. Unknown billing cycles are replaced
     * with the default cycle; rows without a product slug are dropped.
     */
    public function sanitizeSettings($input): array
    {
        $input = is_array($input) ? $input : array();
        $output = array(
            'api_url' => '',
            'api_key' => '',
            'signed_requests' => false,
            'product_map' => array(),
        );
        if (isset($input['api_url'])) {
            $output['api_url'] = esc_url_raw(trim((string) $input['api_url']));
        }
        if (isset($input['api_key'])) {
            $output['api_key'] = sanitize_text_field((string) $input['api_key']);
        }
        $output['signed_requests'] = !empty($input['signed_requests']);
        if (isset($input['product_map']) && is_array($input['product_map'])) {
            foreach ($input['product_map'] as $post_id => $row) {
                if (!is_array($row)) {
                    continue;
                }
                $slug = isset($row['slug'])
                    ? strtolower(sanitize_text_field((string) $row['slug']))
                    : '';
                if ($slug === '') {
                    continue;
                }
                $cycle = LicenseRepository::mapCycle(
                    isset($row['cycle']) ? (string) $row['cycle'] : null
                ) ?? 'annual';
                $output['product_map'][(int) $post_id] = array(
                    'slug' => $slug,
                    'cycle' => $cycle,
                );
            }
        }
        delete_transient(self::PRODUCTS_TRANSIENT);
        return $output;
    }

    public function ajaxTestConnection(): void
    {
        check_ajax_referer(self::NONCE_TEST);
        if (!current_user_can('manage_options')) {
            wp_send_json_error(__('You do not have permission to do that.', 'licensemanagerpro-wordpress'));
        }
        $info = $this->api->getSystemInfo();
        if (is_wp_error($info)) {
            wp_send_json_error($info->get_error_message());
        }
        $version = isset($info['version']) ? (string) $info['version'] : 'unknown';
        wp_send_json_success(
            sprintf(
                /* translators: %s: License Manager Pro version string. */
                __('Connected to License Manager Pro version %s.', 'licensemanagerpro-wordpress'),
                $version
            )
        );
    }

    public function ajaxMintLicense(): void
    {
        check_ajax_referer(self::NONCE_MINT);
        if (!current_user_can('manage_options')) {
            wp_send_json_error(__('You do not have permission to do that.', 'licensemanagerpro-wordpress'));
        }
        $email = isset($_POST['email'])
            ? sanitize_email(wp_unslash((string) $_POST['email']))
            : '';
        $post_id = isset($_POST['post_id']) ? absint($_POST['post_id']) : 0;
        if ($email === '' || !is_email($email)) {
            wp_send_json_error(__('Enter a valid customer email address.', 'licensemanagerpro-wordpress'));
        }
        $map = self::getProductMap();
        if (!isset($map[$post_id])) {
            wp_send_json_error(__('That page is not mapped to a License Manager Pro product yet.', 'licensemanagerpro-wordpress'));
        }
        $license = $this->repository->createLicenseForSlug(
            (string) $map[$post_id]['slug'],
            $email,
            isset($map[$post_id]['cycle']) ? (string) $map[$post_id]['cycle'] : null
        );
        if (is_wp_error($license)) {
            wp_send_json_error($license->get_error_message());
        }
        wp_send_json_success(array(
            'key' => isset($license['key']) ? (string) $license['key'] : '',
            'product' => isset($license['product']) ? (string) $license['product'] : '',
        ));
    }

    /**
     * License Manager Pro products for the mapping dropdown, cached for
     * 10 minutes. Returns an empty list when the API is unreachable;
     * the template then falls back to a plain text field.
     */
    public function getProductsForMapping(): array
    {
        $cached = get_transient(self::PRODUCTS_TRANSIENT);
        if (is_array($cached)) {
            return $cached;
        }
        $result = $this->repository->listProducts();
        if (is_wp_error($result)) {
            return array();
        }
        $products = array();
        foreach ($result as $product) {
            if (is_array($product) && isset($product['slug'], $product['name'])) {
                $products[] = array(
                    'slug' => (string) $product['slug'],
                    'name' => (string) $product['name'],
                );
            }
        }
        set_transient(self::PRODUCTS_TRANSIENT, $products, self::PRODUCTS_TRANSIENT_TTL);
        return $products;
    }

    public function renderSettingsPage(): void
    {
        if (!current_user_can('manage_options')) {
            wp_die(esc_html__('You do not have permission to access this page.', 'licensemanagerpro-wordpress'));
        }
        $settings = self::getSettings();
        $map = self::getProductMap();
        $pages = get_posts(array(
            'post_type' => array('post', 'page'),
            'post_status' => 'publish',
            'numberposts' => 100,
            'orderby' => 'title',
            'order' => 'ASC',
        ));
        $products = $this->getProductsForMapping();
        $cycles = ApiClient::BILLING_CYCLES;
        $test_nonce = wp_create_nonce(self::NONCE_TEST);
        $mint_nonce = wp_create_nonce(self::NONCE_MINT);
        $version = defined('LMP_WP_VERSION') ? LMP_WP_VERSION : '';
        include LMP_WP_PATH . 'templates/admin-settings.php';
    }
}
