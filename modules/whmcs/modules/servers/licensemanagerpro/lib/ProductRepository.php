<?php
/**
 * License Manager Pro — WHMCS server module product repository.
 *
 * Model layer: product lookups against the License Manager Pro API,
 * plus the cached product list that feeds the product dropdown in the
 * module settings (see the Loader function in licensemanagerpro.php).
 *
 * Cache: successful list responses are cached for 5 minutes in the
 * system temp directory, keyed by a hash of the API URL + API key, so
 * every admin page load does not hammer the API and one admin's key
 * can never see another key's cached list. Only successful responses
 * are cached; failures are never cached, so the next page load retries
 * the API immediately. The cache file holds only product names, slugs
 * and cycles — never the API key.
 */

if (!defined('WHMCS')) {
    die('This file cannot be accessed directly');
}

class LMP_ProductRepository
{
    /** How long a fetched product list is reused (5 minutes). */
    const CACHE_TTL_SECONDS = 300;

    /** @var LMP_ApiClient */
    private $client;

    public function __construct($client)
    {
        $this->client = $client;
    }

    /**
     * The product list for the settings dropdown, cached for 5 minutes.
     * Returns array('products' => [...], 'error' => ''|'message').
     * Each product is array('id', 'slug', 'name',
     * 'billing_cycles'). On API failure 'products' is empty and
     * 'error' explains why — the caller (Loader) then falls back to
     * the already-saved slug, or reports the error, instead of
     * breaking the settings page.
     */
    public function listForDropdown()
    {
        $cached = $this->readCache();
        if ($cached !== null) {
            return array('products' => $cached, 'error' => '');
        }
        $list = $this->client->listProducts();
        if ($list === null) {
            return array(
                'products' => array(),
                'error' => $this->client->lastError
                    ? $this->client->lastError
                    : 'Could not load the product list from License Manager Pro.',
            );
        }
        $products = array();
        foreach ((array) $list as $product) {
            if (!is_array($product) || !isset($product['slug'], $product['name'])) {
                continue;
            }
            $products[] = array(
                'id' => isset($product['id']) ? (int) $product['id'] : 0,
                'slug' => (string) $product['slug'],
                'name' => (string) $product['name'],
                'billing_cycles' => (isset($product['billing_cycles']) && is_array($product['billing_cycles']))
                    ? $product['billing_cycles']
                    : array(),
            );
        }
        $this->writeCache($products);
        return array('products' => $products, 'error' => '');
    }

    /**
     * Dropdown options for the Loader function: [slug => label].
     * The label shows the product name plus a cycle hint, e.g.
     * "CloudPanel Pro (monthly, annual)". The stored
     * config value is the slug.
     */
    public function dropdownOptions()
    {
        $result = $this->listForDropdown();
        $options = array();
        foreach ($result['products'] as $product) {
            $label = $product['name'];
            if (!empty($product['billing_cycles'])) {
                $label .= ' (' . implode(', ', $product['billing_cycles']) . ')';
            }
            $options[$product['slug']] = $label;
        }
        return array('options' => $options, 'error' => $result['error']);
    }

    /**
     * Resolve a product slug to its License Manager Pro product.
     * Returns the product array, or null when not found / on API error.
     */
    public function findBySlug($slug)
    {
        if (!$slug) {
            return null;
        }
        $list = $this->client->get('/products?slug=' . rawurlencode($slug));
        if (is_array($list) && count($list) === 1) {
            return $list[0];
        }
        if (is_array($list)) {
            foreach ($list as $candidate) {
                if (isset($candidate['slug']) && $candidate['slug'] === $slug) {
                    return $candidate;
                }
            }
        }
        return null;
    }

    /**
     * Cache file path: system temp dir, keyed by a hash of the API URL
     * + a hash of the API key (the key itself is never written down).
     */
    private function cacheFile()
    {
        $scope = md5($this->clientBaseUrl() . '|' . sha1($this->clientApiKey()));
        return rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR)
            . DIRECTORY_SEPARATOR . 'lmp_whmcs_products_' . $scope . '.json';
    }

    /**
     * Read a fresh cache entry, or null when there is none / it expired
     * / it is unreadable. A corrupt cache is ignored, never fatal.
     */
    private function readCache()
    {
        $file = $this->cacheFile();
        if (!is_readable($file)) {
            return null;
        }
        $raw = @file_get_contents($file);
        if ($raw === false) {
            return null;
        }
        $decoded = json_decode($raw, true);
        if (!is_array($decoded) || !isset($decoded['fetched_at'], $decoded['products'])) {
            return null;
        }
        if (time() - (int) $decoded['fetched_at'] > self::CACHE_TTL_SECONDS) {
            return null;
        }
        return is_array($decoded['products']) ? $decoded['products'] : null;
    }

    private function writeCache($products)
    {
        $payload = json_encode(array(
            'fetched_at' => time(),
            'products' => $products,
        ));
        if ($payload !== false) {
            @file_put_contents($this->cacheFile(), $payload, LOCK_EX);
        }
    }

    /**
     * The client's base URL / API-key fingerprint, used only to scope
     * the product-list cache to one backend + one key. The key itself
     * is never written anywhere.
     */
    private function clientBaseUrl()
    {
        return $this->client->getBaseUrl();
    }

    private function clientApiKey()
    {
        return $this->client->getApiKeyFingerprint();
    }
}
