<?php
/**
 * License Manager Pro — WooCommerce order handling.
 *
 * When an order reaches "Completed", one license is created in License
 * Manager Pro for every mapped line item. The key (and the license id)
 * are stored in the order item meta, and shown to the customer in the
 * order details, the order email and the My Account → Licenses tab.
 *
 * Keys are never minted before the order completes.
 */

if (!defined('ABSPATH')) {
    exit;
}

class LMP_Orders
{
    /** @var LMP_Api */
    private $api;

    public function __construct($api)
    {
        $this->api = $api;
    }

    public function register_hooks()
    {
        add_action('woocommerce_order_status_completed', array($this, 'create_licenses_for_order'), 10, 1);
        // Show the key on the customer order page and in the admin.
        add_action('woocommerce_order_item_meta_end', array($this, 'show_license_in_order_item'), 10, 3);
        // Show the key in the order email.
        add_filter('woocommerce_email_order_meta_fields', array($this, 'add_license_to_email'), 10, 3);
    }

    /**
     * Create licenses for every mapped line item of a completed order.
     */
    public function create_licenses_for_order($order_id)
    {
        $order = wc_get_order($order_id);
        if (!$order) {
            return;
        }
        $map = lmp_get_product_map();
        $owner_email = $order->get_billing_email();
        foreach ($order->get_items() as $item_id => $item) {
            $product_id = (int) $item->get_product_id();
            if (empty($map[$product_id])) {
                continue;
            }
            // One license per line item — never mint twice for the same item.
            if ($item->get_meta('_lmp_license_key')) {
                continue;
            }
            $mapping = $map[$product_id];
            $product = $this->api->find_product_by_slug($mapping['slug']);
            if (is_wp_error($product)) {
                $order->add_order_note('License Manager Pro: ' . $product->get_error_message());
                continue;
            }
            $license = $this->api->create_license(
                (int) $product['id'],
                $mapping['cycle'],
                $owner_email ? $owner_email : null
            );
            if (is_wp_error($license)) {
                $order->add_order_note('License Manager Pro: ' . $license->get_error_message());
                continue;
            }
            $item->update_meta_data('_lmp_license_key', isset($license['key']) ? $license['key'] : '');
            $item->update_meta_data('_lmp_license_id', isset($license['id']) ? (int) $license['id'] : 0);
            $item->save();
            $order->add_order_note(
                'License Manager Pro: license created for ' . $item->get_name()
                . ' — key ' . (isset($license['key']) ? $license['key'] : '')
            );
        }
    }

    /**
     * Show the license key under the line item on order pages.
     */
    public function show_license_in_order_item($item_id, $item, $order)
    {
        $key = $item->get_meta('_lmp_license_key');
        if (!$key) {
            return;
        }
        echo '<p><strong>' . esc_html__('License key:', 'licensemanagerpro') . '</strong> '
            . '<code>' . esc_html($key) . '</code></p>';
    }

    /**
     * Add the license keys to the order email meta fields.
     */
    public function add_license_to_email($fields, $sent_to_admin, $order)
    {
        $keys = array();
        foreach ($order->get_items() as $item) {
            $key = $item->get_meta('_lmp_license_key');
            if ($key) {
                $keys[] = $item->get_name() . ': ' . $key;
            }
        }
        if ($keys) {
            $fields['lmp_licenses'] = array(
                'label' => __('License keys', 'licensemanagerpro'),
                'value' => implode("\n", $keys),
            );
        }
        return $fields;
    }
}
