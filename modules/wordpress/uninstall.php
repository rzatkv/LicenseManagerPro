<?php
/**
 * License Manager Pro — WordPress: uninstall cleanup.
 *
 * Removes the plugin settings, the cached product list and the
 * "My Licenses" page created on activation (only when it still
 * contains the shortcode, so a page the admin repurposed is kept).
 */

if (!defined('WP_UNINSTALL_PLUGIN')) {
    exit;
}

delete_option('lmp_wp_settings');
delete_transient('lmp_wp_products');

$page_id = (int) get_option('lmp_wp_page_id');
if ($page_id > 0) {
    $page = get_post($page_id);
    if ($page instanceof WP_Post && strpos((string) $page->post_content, '[lmp_licenses]') !== false) {
        wp_delete_post($page_id, true);
    }
}
delete_option('lmp_wp_page_id');
