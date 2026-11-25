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
     * Resolve the billing cycle to send for a line item.
     *
     * When the order is a WooCommerce Subscriptions order, the
     * subscription's own billing period wins (see
     * LMP_Cycle_Mapper::from_subscription_period): 'month' -> monthly,
     * 'quarter' -> quarterly, 'year' -> annual. 'day'/'week' (and
     * anything else) have no License Manager Pro equivalent, so the
     * mapped cycle is used instead. Without Subscriptions — or when no
     * subscription is found for the order — the mapped cycle from the
     * admin product mapping is used as today.
     *
     * Defensive by design: every Subscriptions call is guarded by
     * function_exists()/method_exists() checks, so this never
     * fatal-errors when WooCommerce Subscriptions is not installed.
     */
    private function resolve_billing_cycle($order, $mapping)
    {
        $fallback = isset($mapping['cycle']) ? $mapping['cycle'] : null;
        if (!function_exists('wcs_get_subscriptions_for_order')) {
            return $fallback;
        }
        $subscriptions = wcs_get_subscriptions_for_order(
            $order->get_id(),
            array('order_type' => 'any')
        );
        if (empty($subscriptions) || !is_array($subscriptions)) {
            return $fallback;
        }
        $subscription = reset($subscriptions);
        if (!is_object($subscription) || !method_exists($subscription, 'get_billing_period')) {
            return $fallback;
        }
        $mapped = LMP_Cycle_Mapper::from_subscription_period($subscription->get_billing_period());
        return ($mapped !== null) ? $mapped : $fallback;
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
            // Subscription billing period wins when present; otherwise
            // the mapped cycle from the admin product mapping.
            $cycle = $this->resolve_billing_cycle($order, $mapping);
            $license = $this->api->create_license(
                (int) $product['id'],
                $cycle,
                $owner_email ? $owner_email : null
            );
            if (is_wp_error($license)) {
                $order->add_order_note('License Manager Pro: ' . $license->get_error_message());
                continue;
            }
            $item->update_meta_data('_lmp_license_key', isset($license['key']) ? $license['key'] : '');
            $item->update_meta_data('_lmp_license_id', isset($license['id']) ? (int) $license['id'] : 0);
            $item->save();
            $note = 'License Manager Pro: license created for ' . $item->get_name()
                . ' — key ' . (isset($license['key']) ? $license['key'] : '');
            if ($cycle !== null && $cycle !== '') {
                $note .= ' — billing cycle ' . $cycle;
            }
            $order->add_order_note($note);
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
            . '<code style="font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;color:#9d174d;background:#fdf2f8;border:1px solid #f9a8d4;border-radius:8px;padding:2px 8px;word-break:break-all;">' . esc_html($key) . '</code></p>';
    }

    /**
     * Add the license keys to the order email meta fields.
     *
     * Deliberately plain text, no HTML chip: WooCommerce renders these
     * same fields in BOTH the HTML and the plain-text email templates, so
     * any markup here would show up literally in plain-text emails.
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
