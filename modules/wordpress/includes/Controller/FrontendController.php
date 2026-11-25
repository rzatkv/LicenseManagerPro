<?php
/**
 * License Manager Pro — WordPress (without WooCommerce).
 *
 * Controller layer: frontend shortcode [lmp_licenses], the "My
 * Licenses" page created on activation, and on-demand license minting
 * for the logged-in user. All rendering lives in
 * templates/my-licenses.php.
 */

declare(strict_types=1);

namespace LicenseManagerPro\WordPress\Controller;

use LicenseManagerPro\WordPress\Model\LicenseRepository;

if (!defined('ABSPATH')) {
    exit;
}

final class FrontendController
{
    public const SHORTCODE = 'lmp_licenses';
    public const PAGE_SLUG = 'my-licenses';
    public const PAGE_OPTION = 'lmp_wp_page_id';
    public const NONCE_MINT = 'lmp_wp_mint_front';

    private LicenseRepository $repository;

    public function __construct(LicenseRepository $repository)
    {
        $this->repository = $repository;
    }

    public function registerHooks(): void
    {
        add_shortcode(self::SHORTCODE, array($this, 'renderShortcode'));
    }

    /**
     * Shortcode: [lmp_licenses] or [lmp_licenses product="slug" cycle="annual"].
     * Without attributes the mint form offers every mapped product.
     */
    public function renderShortcode($atts = array()): string
    {
        $atts = is_array($atts) ? $atts : array();
        $atts = shortcode_atts(
            array('product' => '', 'cycle' => ''),
            $atts,
            self::SHORTCODE
        );

        if (!is_user_logged_in()) {
            $login_url = wp_login_url(get_permalink());
            return '<div class="lmp-notice lmp-notice-info">'
                . esc_html__('Please log in to view your licenses.', 'licensemanagerpro-wordpress')
                . ' <a href="' . esc_url($login_url) . '">'
                . esc_html__('Log in', 'licensemanagerpro-wordpress')
                . '</a></div>';
        }

        $user = wp_get_current_user();
        $email = (string) $user->user_email;
        $notice = null;
        $notice_is_error = false;

        if (isset($_POST['lmp_wp_mint_nonce'])) {
            $mint_result = $this->handleMintRequest($email, (string) $atts['product'], (string) $atts['cycle']);
            if ($mint_result !== null) {
                $notice = $mint_result['message'];
                $notice_is_error = $mint_result['is_error'];
            }
        }

        $licenses = $this->repository->licensesForEmail($email);
        if (is_wp_error($licenses)) {
            $notice = $licenses->get_error_message();
            $notice_is_error = true;
            $licenses = array();
        }

        $mapped = $this->getMappedProducts();
        $mint_nonce = wp_create_nonce(self::NONCE_MINT);
        $fixed_product = strtolower(sanitize_text_field((string) $atts['product']));
        $fixed_cycle = LicenseRepository::mapCycle((string) $atts['cycle']);

        ob_start();
        include LMP_WP_PATH . 'templates/my-licenses.php';
        return (string) ob_get_clean();
    }

    /**
     * Handle the "Get a license" form. Returns null when the form was
     * not submitted; otherwise an array with message + is_error.
     */
    private function handleMintRequest(string $email, string $shortcode_product, string $shortcode_cycle): ?array
    {
        $nonce = isset($_POST['lmp_wp_mint_nonce'])
            ? sanitize_text_field(wp_unslash((string) $_POST['lmp_wp_mint_nonce']))
            : '';
        if (!wp_verify_nonce($nonce, self::NONCE_MINT)) {
            return array(
                'message' => __('Security check failed. Please try again.', 'licensemanagerpro-wordpress'),
                'is_error' => true,
            );
        }

        $slug = $shortcode_product !== '' ? $shortcode_product : '';
        $cycle = $shortcode_cycle !== '' ? $shortcode_cycle : null;
        if ($slug === '') {
            $post_id = isset($_POST['lmp_wp_post_id']) ? absint($_POST['lmp_wp_post_id']) : 0;
            $map = AdminController::getProductMap();
            if (!isset($map[$post_id])) {
                return array(
                    'message' => __('Please choose a product first.', 'licensemanagerpro-wordpress'),
                    'is_error' => true,
                );
            }
            $slug = (string) $map[$post_id]['slug'];
            $cycle = isset($map[$post_id]['cycle']) ? (string) $map[$post_id]['cycle'] : null;
        }

        $license = $this->repository->createLicenseForSlug($slug, $email, $cycle);
        if (is_wp_error($license)) {
            return array('message' => $license->get_error_message(), 'is_error' => true);
        }
        return array(
            'message' => sprintf(
                /* translators: %s: license key. */
                __('Your license was created: %s', 'licensemanagerpro-wordpress'),
                isset($license['key']) ? (string) $license['key'] : ''
            ),
            'is_error' => false,
        );
    }

    /**
     * Mapped products for the mint form: post/page id, title, LMP slug
     * and cycle. Only rows that are still mapped are returned.
     */
    private function getMappedProducts(): array
    {
        $mapped = array();
        foreach (AdminController::getProductMap() as $post_id => $row) {
            if (!is_array($row) || empty($row['slug'])) {
                continue;
            }
            $mapped[] = array(
                'post_id' => (int) $post_id,
                'title' => get_the_title((int) $post_id),
                'slug' => (string) $row['slug'],
                'cycle' => isset($row['cycle']) ? (string) $row['cycle'] : 'annual',
            );
        }
        return $mapped;
    }

    /**
     * Activation: create the "My Licenses" page if it does not exist
     * yet, then flush rewrite rules.
     */
    public static function activate(): void
    {
        $existing = get_page_by_path(self::PAGE_SLUG);
        if ($existing instanceof \WP_Post) {
            update_option(self::PAGE_OPTION, (int) $existing->ID);
        } else {
            $page_id = wp_insert_post(array(
                'post_title' => __('My Licenses', 'licensemanagerpro-wordpress'),
                'post_name' => self::PAGE_SLUG,
                'post_content' => '[' . self::SHORTCODE . ']',
                'post_status' => 'publish',
                'post_type' => 'page',
            ));
            if (!is_wp_error($page_id) && $page_id > 0) {
                update_option(self::PAGE_OPTION, (int) $page_id);
            }
        }
        flush_rewrite_rules();
    }

    public static function deactivate(): void
    {
        flush_rewrite_rules();
    }
}
