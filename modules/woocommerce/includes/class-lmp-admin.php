<?php
/**
 * License Manager Pro — WooCommerce admin settings.
 *
 * Controller layer: the WooCommerce submenu page, settings
 * registration/sanitization, the Test Connection AJAX handler, and the
 * cached License Manager Pro product list that feeds the mapping
 * dropdowns. All rendering lives in views/admin-settings.php; this
 * class never echoes HTML.
 */

if (!defined('ABSPATH')) {
    exit;
}

class LMP_Admin
{
    const OPTION_NAME = 'lmp_settings';
    const SETTINGS_GROUP = 'lmp_settings_group';
    const PAGE_SLUG = 'licensemanagerpro';
    const AJAX_TEST_ACTION = 'lmp_test_connection';
    const NONCE_TEST = 'lmp_test_connection';
    const PRODUCTS_TRANSIENT = 'lmp_products';
    const PRODUCTS_TRANSIENT_TTL = 10 * MINUTE_IN_SECONDS;

    /** @var LMP_Api */
    private $api;

    public function __construct($api)
    {
        $this->api = $api;
    }

    public function register_hooks()
    {
        add_action('admin_menu', array($this, 'register_menu'));
        add_action('admin_init', array($this, 'register_settings'));
        add_action('wp_ajax_' . self::AJAX_TEST_ACTION, array($this, 'ajax_test_connection'));
    }

    public function register_menu()
    {
        add_submenu_page(
            'woocommerce',
            __('License Manager Pro', 'licensemanagerpro'),
            __('License Manager Pro', 'licensemanagerpro'),
            'manage_woocommerce',
            self::PAGE_SLUG,
            array($this, 'render_settings_page')
        );
    }

    public function register_settings()
    {
        register_setting(
            self::SETTINGS_GROUP,
            self::OPTION_NAME,
            array('sanitize_callback' => array($this, 'sanitize_settings'))
        );
    }

    /**
     * Sanitize the settings form. Unknown billing cycles are replaced
     * with the default cycle; rows without a product slug are dropped.
     * The product-list cache is cleared so the dropdowns refresh.
     */
    public function sanitize_settings($input)
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
            foreach ($input['product_map'] as $wc_product_id => $row) {
                if (!is_array($row)) {
                    continue;
                }
                $slug = isset($row['slug'])
                    ? strtolower(sanitize_text_field((string) $row['slug']))
                    : '';
                if ($slug === '') {
                    continue;
                }
                $cycle = isset($row['cycle']) ? (string) $row['cycle'] : 'annual';
                if (!LMP_Cycle_Mapper::is_valid_cycle($cycle)) {
                    $cycle = 'annual';
                }
                $output['product_map'][(int) $wc_product_id] = array(
                    'slug' => $slug,
                    'cycle' => $cycle,
                );
            }
        }
        delete_transient(self::PRODUCTS_TRANSIENT);
        return $output;
    }

    /**
     * Test Connection (AJAX): GET /system/info with the stored module
     * API key. Reports success with the License Manager Pro version,
     * or a clear failure — never a login, never a JWT.
     */
    public function ajax_test_connection()
    {
        check_ajax_referer(self::NONCE_TEST);
        if (!current_user_can('manage_woocommerce')) {
            wp_send_json_error('Not allowed.');
        }
        $info = $this->api->get_system_info();
        if (is_wp_error($info)) {
            wp_send_json_error($info->get_error_message());
        }
        wp_send_json_success(
            'Connected to License Manager Pro version '
            . (isset($info['version']) ? $info['version'] : 'unknown')
        );
    }

    /**
     * License Manager Pro products for the mapping dropdowns, cached
     * for 10 minutes. Returns array('products' => [...], 'error' =>
     * ''|'message'). Each product is array('slug', 'name',
     * 'billing_cycles'). On API failure 'products' is
     * empty and 'error' explains why — the View then falls back to a
     * plain text field per row instead of breaking the page.
     */
    public function get_products_for_mapping()
    {
        $cached = get_transient(self::PRODUCTS_TRANSIENT);
        if (is_array($cached)) {
            return array('products' => $cached, 'error' => '');
        }
        $result = $this->api->list_products();
        if (is_wp_error($result)) {
            return array('products' => array(), 'error' => $result->get_error_message());
        }
        $products = array();
        foreach ((array) $result as $product) {
            if (is_array($product) && isset($product['slug'], $product['name'])) {
                $products[] = array(
                    'slug' => (string) $product['slug'],
                    'name' => (string) $product['name'],
                    'billing_cycles' => (isset($product['billing_cycles']) && is_array($product['billing_cycles']))
                        ? $product['billing_cycles']
                        : array(),
                );
            }
        }
        set_transient(self::PRODUCTS_TRANSIENT, $products, self::PRODUCTS_TRANSIENT_TTL);
        return array('products' => $products, 'error' => '');
    }

    /**
     * Label for one dropdown option: name plus a cycle hint,
     * e.g. "CloudPanel Pro (monthly, annual)".
     */
    public static function product_option_label($product)
    {
        $label = $product['name'];
        if (!empty($product['billing_cycles'])) {
            $label .= ' (' . implode(', ', $product['billing_cycles']) . ')';
        }
        return $label;
    }

    public function render_settings_page()
    {
        if (!current_user_can('manage_woocommerce')) {
            wp_die(esc_html__('You do not have permission to access this page.', 'licensemanagerpro'));
        }
        $settings = lmp_get_settings();
        $map = lmp_get_product_map();
        $products = wc_get_products(array('limit' => -1, 'status' => 'publish'));
        $lmp = $this->get_products_for_mapping();
        $lmp_products = $lmp['products'];
        $lmp_error = $lmp['error'];
        $api_configured = $this->api->is_configured();
        $cycles = LMP_Api::BILLING_CYCLES;
        $test_nonce = wp_create_nonce(self::NONCE_TEST);
        $version = defined('LMP_WC_VERSION') ? LMP_WC_VERSION : '';
        include LMP_WC_PATH . 'includes/views/admin-settings.php';
    }
}
