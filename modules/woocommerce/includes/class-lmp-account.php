<?php
/**
 * License Manager Pro — My Account → Licenses tab.
 *
 * Controller layer: registers the Licenses endpoint, gathers the
 * customer's licenses (from order item meta) with live status/expiry
 * from the License Manager Pro API, and handles the deactivate AJAX
 * action. All rendering lives in views/my-licenses.php; this class
 * never echoes HTML.
 *
 * Deactivation calls the API server-side, with the plugin's own
 * stored module API key, on the customer's behalf — and only for a
 * license that belongs to that customer.
 */

if (!defined('ABSPATH')) {
    exit;
}

class LMP_Account
{
    /** @var LMP_Api */
    private $api;

    public function __construct($api)
    {
        $this->api = $api;
    }

    public function register_hooks()
    {
        add_filter('woocommerce_account_menu_items', array($this, 'add_menu_item'));
        add_rewrite_endpoint('licenses', EP_ROOT | EP_PAGES);
        add_action('woocommerce_account_licenses_endpoint', array($this, 'render_endpoint'));
        add_action('wp_ajax_lmp_deactivate', array($this, 'ajax_deactivate'));
    }

    public function add_menu_item($items)
    {
        $items['licenses'] = __('Licenses', 'licensemanagerpro');
        return $items;
    }

    /**
     * All licenses owned by a user: every order item meta pair
     * (_lmp_license_key / _lmp_license_id) of their orders.
     */
    public function get_customer_licenses($user_id)
    {
        $licenses = array();
        $orders = wc_get_orders(array(
            'customer_id' => $user_id,
            'limit' => -1,
            'status' => array('completed', 'processing', 'on-hold'),
        ));
        foreach ($orders as $order) {
            foreach ($order->get_items() as $item) {
                $key = $item->get_meta('_lmp_license_key');
                if (!$key) {
                    continue;
                }
                $licenses[] = array(
                    'key' => $key,
                    'license_id' => (int) $item->get_meta('_lmp_license_id'),
                    'product_name' => $item->get_name(),
                    'order_id' => $order->get_id(),
                );
            }
        }
        return $licenses;
    }

    /**
     * CSS class for a license status pill: green active, amber inactive,
     * red revoked/expired, grey anything else.
     */
    private function status_pill_class($status)
    {
        switch (strtolower((string) $status)) {
            case 'active':
                return 'lmp-ok';
            case 'inactive':
                return 'lmp-warn';
            case 'revoked':
            case 'expired':
                return 'lmp-err';
            default:
                return 'lmp-muted';
        }
    }

    /**
     * Gather the view data for one owned license: live status, expiry
     * and activation count from POST /licenses/validate, plus the
     * activation instances from GET /licenses/{id}/activations.
     * A failed API call leaves the "Unknown" placeholders in place —
     * the tab never breaks because the backend is unreachable.
     */
    private function view_data_for_license($license, $domain)
    {
        $status = __('Unknown', 'licensemanagerpro');
        $expires = '-';
        $activations = '-';
        $instances = array();
        $result = $this->api->validate_license($license['key'], $domain ? $domain : null);
        if (!is_wp_error($result) && isset($result['license']) && is_array($result['license'])) {
            $info = $result['license'];
            $status = isset($info['status']) ? $info['status'] : $status;
            $expires = !empty($info['expires_at'])
                ? date_i18n(get_option('date_format'), strtotime($info['expires_at']))
                : __('Never (lifetime)', 'licensemanagerpro');
            $activations = (isset($info['activations']) ? $info['activations'] : 0)
                . ' / ' . (isset($info['max_activations']) ? $info['max_activations'] : 1);
        }
        if ($license['license_id'] > 0) {
            $rows = $this->api->get('/licenses/' . $license['license_id'] . '/activations');
            if (!is_wp_error($rows) && is_array($rows)) {
                foreach ($rows as $instance) {
                    if (!is_array($instance)) {
                        continue;
                    }
                    $instances[] = array(
                        'id' => isset($instance['id']) ? (int) $instance['id'] : 0,
                        'label' => (isset($instance['label']) && $instance['label'])
                            ? (string) $instance['label']
                            : (isset($instance['fingerprint']) ? (string) $instance['fingerprint'] : ''),
                        'fingerprint' => isset($instance['fingerprint']) ? (string) $instance['fingerprint'] : '',
                    );
                }
            }
        }
        return array(
            'key' => $license['key'],
            'license_id' => $license['license_id'],
            'product_name' => $license['product_name'],
            'order_id' => $license['order_id'],
            'status' => $status,
            'status_class' => $this->status_pill_class($status),
            'expires' => $expires,
            'activations' => $activations,
            'instances' => $instances,
        );
    }

    public function render_endpoint()
    {
        $user_id = get_current_user_id();
        $licenses = $this->get_customer_licenses($user_id);
        $domain = wp_parse_url(get_site_url(), PHP_URL_HOST);
        $view_licenses = array();
        foreach ($licenses as $license) {
            $view_licenses[] = $this->view_data_for_license($license, $domain);
        }
        $deactivate_nonce = wp_create_nonce('lmp_deactivate');
        $ajax_url = admin_url('admin-ajax.php');
        $copied_label = __('Copied!', 'licensemanagerpro');
        $confirm_label = __('Deactivate this installation?', 'licensemanagerpro');
        include LMP_WC_PATH . 'includes/views/my-licenses.php';
    }

    /**
     * AJAX: deactivate one activation instance (server-side, using the
     * plugin's stored module API key).
     */
    public function ajax_deactivate()
    {
        check_ajax_referer('lmp_deactivate');
        if (!is_user_logged_in()) {
            wp_send_json_error('Not logged in.');
        }
        $license_id = (int) (isset($_POST['license_id']) ? $_POST['license_id'] : 0);
        $activation_id = (int) (isset($_POST['activation_id']) ? $_POST['activation_id'] : 0);
        // The license must belong to this customer.
        $owned = false;
        foreach ($this->get_customer_licenses(get_current_user_id()) as $license) {
            if ($license['license_id'] === $license_id) {
                $owned = true;
                break;
            }
        }
        if (!$owned || $license_id <= 0 || $activation_id <= 0) {
            wp_send_json_error('This license does not belong to you.');
        }
        $result = $this->api->delete('/licenses/' . $license_id . '/activations/' . $activation_id);
        if (is_wp_error($result)) {
            wp_send_json_error($result->get_error_message());
        }
        wp_send_json_success();
    }
}
