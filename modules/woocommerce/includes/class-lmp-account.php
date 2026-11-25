<?php
/**
 * License Manager Pro — My Account → Licenses tab.
 *
 * Lists every license the customer owns (gathered from the order item
 * meta of their orders), with live status and expiry from the License
 * Manager Pro API, and lets the customer deactivate one activation
 * instance (the plugin calls the admin API server-side, with its own
 * stored credentials, on the customer's behalf).
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

    public function render_endpoint()
    {
        $user_id = get_current_user_id();
        $licenses = $this->get_customer_licenses($user_id);
        $domain = wp_parse_url(get_site_url(), PHP_URL_HOST);
        echo '<h2>' . esc_html__('Your licenses', 'licensemanagerpro') . '</h2>';
        if (empty($licenses)) {
            echo '<p>' . esc_html__('You do not own any licenses yet.', 'licensemanagerpro') . '</p>';
            return;
        }
        echo '<table class="woocommerce-orders-table shop_table"><thead><tr>'
            . '<th>' . esc_html__('Product', 'licensemanagerpro') . '</th>'
            . '<th>' . esc_html__('License key', 'licensemanagerpro') . '</th>'
            . '<th>' . esc_html__('Status', 'licensemanagerpro') . '</th>'
            . '<th>' . esc_html__('Expires', 'licensemanagerpro') . '</th>'
            . '<th>' . esc_html__('Activations', 'licensemanagerpro') . '</th>'
            . '</tr></thead><tbody>';
        foreach ($licenses as $license) {
            $status = __('Unknown', 'licensemanagerpro');
            $expires = '-';
            $activations = '-';
            $activation_rows = array();
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
                $instances = $this->api->get('/licenses/' . $license['license_id'] . '/activations');
                if (!is_wp_error($instances) && is_array($instances)) {
                    $activation_rows = $instances;
                }
            }
            echo '<tr><td>' . esc_html($license['product_name']) . '</td>'
                . '<td><code>' . esc_html($license['key']) . '</code></td>'
                . '<td>' . esc_html($status) . '</td>'
                . '<td>' . esc_html($expires) . '</td>'
                . '<td>' . esc_html($activations) . '</td></tr>';
            foreach ($activation_rows as $instance) {
                echo '<tr><td colspan="4">'
                    . esc_html(isset($instance['label']) && $instance['label'] ? $instance['label'] : $instance['fingerprint'])
                    . ' <small>(' . esc_html($instance['fingerprint']) . ')</small></td>'
                    . '<td><button type="button" class="button lmp-deactivate" data-license-id="'
                    . esc_attr($license['license_id']) . '" data-activation-id="'
                    . esc_attr($instance['id']) . '">'
                    . esc_html__('Deactivate', 'licensemanagerpro') . '</button></td></tr>';
            }
        }
        echo '</tbody></table>';
        echo '<script>document.querySelectorAll(".lmp-deactivate").forEach(function (btn) {'
            . 'btn.addEventListener("click", function () {'
            . 'if (!confirm("' . esc_js(__('Deactivate this installation?', 'licensemanagerpro')) . '")) return;'
            . 'fetch("' . esc_url(admin_url('admin-ajax.php')) . '", {method: "POST", headers: {"Content-Type": "application/x-www-form-urlencoded"},'
            . 'body: "action=lmp_deactivate&license_id=" + btn.dataset.licenseId + "&activation_id=" + btn.dataset.activationId'
            . ' + "&_wpnonce=' . wp_create_nonce('lmp_deactivate') . '"})'
            . '.then(function (r) { return r.json(); }).then(function (d) {'
            . 'if (d.success) { location.reload(); } else { alert(d.data || "Deactivation failed."); }'
            . '}); }); });</script>';
    }

    /**
     * AJAX: deactivate one activation instance (server-side, using the
     * plugin's stored admin credentials).
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
