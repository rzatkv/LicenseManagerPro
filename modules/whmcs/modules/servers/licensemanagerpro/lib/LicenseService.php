<?php
/**
 * License Manager Pro — WHMCS server module license service.
 *
 * Model/service layer: all license business logic (create, suspend,
 * unsuspend, terminate, renew, move to another product) in one place.
 * It only talks to License Manager Pro through LMP_ApiClient and only
 * maps cycles through LMP_BillingCycle — it knows nothing about WHMCS
 * pages or HTML. The Controller (licensemanagerpro.php) calls these
 * methods and translates their results into WHMCS return values.
 *
 * Fail-closed contract: every method returns null on API failure, and
 * $lastError explains why. A 401/403 from the backend means the
 * module API key is wrong/expired/revoked or lacks the scope — in
 * that case no license is minted, changed or reported as licensed.
 */

if (!defined('WHMCS')) {
    die('This file cannot be accessed directly');
}

class LMP_LicenseService
{
    /** @var LMP_ApiClient */
    private $client;
    /** @var LMP_ProductRepository */
    private $products;
    /** @var string Last error message */
    public $lastError = '';

    public function __construct($client, $products)
    {
        $this->client = $client;
        $this->products = $products;
    }

    /**
     * Find a license by its key. Returns the license array, or null
     * when not found / on API error.
     */
    public function findByKey($key)
    {
        $this->lastError = '';
        if (!$key) {
            return null;
        }
        $list = $this->client->get('/licenses?search=' . rawurlencode($key));
        if (!is_array($list)) {
            $this->lastError = $this->client->lastError;
            return null;
        }
        foreach ($list as $license) {
            if (isset($license['key']) && $license['key'] === $key) {
                return $license;
            }
        }
        return null;
    }

    /**
     * Create a license for a product slug + billing cycle + owner email.
     * Returns the license array (with 'key') or null on failure.
     * The billing cycle is sent explicitly; the backend adds a cycle
     * missing from the product automatically (sync).
     */
    public function createLicense($productSlug, $billingCycle, $ownerEmail)
    {
        $product = $this->products->findBySlug($productSlug);
        if ($product === null) {
            $this->lastError = ($this->client->lastError !== '')
                ? $this->client->lastError
                : 'License Manager Pro product "' . $productSlug . '" was not found';
            return null;
        }
        $license = $this->client->post('/licenses', array(
            'product_id' => (int) $product['id'],
            'billing_cycle' => $billingCycle,
            'owner_email' => $ownerEmail,
        ));
        if ($license === null || !isset($license['key'])) {
            $this->lastError = $this->client->lastError
                ? $this->client->lastError
                : 'License creation failed';
            return null;
        }
        return $license;
    }

    /**
     * Set a license's status ('active' / 'inactive'). Returns the
     * updated license array or null on failure.
     */
    public function setStatus($licenseId, $status)
    {
        $updated = $this->client->put('/licenses/' . (int) $licenseId, array('status' => $status));
        if ($updated === null) {
            $this->lastError = $this->client->lastError ? $this->client->lastError : 'Status update failed';
            return null;
        }
        return $updated;
    }

    /**
     * Revoke (delete) a license. Returns true on success, false on
     * failure (see $lastError).
     */
    public function revokeLicense($licenseId)
    {
        $deleted = $this->client->delete('/licenses/' . (int) $licenseId);
        if ($deleted === null) {
            $this->lastError = $this->client->lastError ? $this->client->lastError : 'Terminate failed';
            return false;
        }
        return true;
    }

    /**
     * Renew a license, optionally switching it to a new billing cycle
     * (sent as ?billing_cycle=, synced onto the product when missing).
     * Returns the renewed license array or null on failure.
     */
    public function renewLicense($licenseId, $billingCycle)
    {
        $path = '/licenses/' . (int) $licenseId . '/renew';
        if ($billingCycle !== null && $billingCycle !== '') {
            $path .= '?billing_cycle=' . rawurlencode($billingCycle);
        }
        $renewed = $this->client->post($path, array());
        if ($renewed === null) {
            $this->lastError = $this->client->lastError ? $this->client->lastError : 'Renew failed';
            return null;
        }
        return $renewed;
    }

    /**
     * Move a license to another product and/or billing cycle (package
     * change). Returns the updated license array or null on failure.
     */
    public function moveLicense($licenseId, $productSlug, $billingCycle)
    {
        $update = array('billing_cycle' => $billingCycle);
        if ($productSlug !== null && $productSlug !== '') {
            $product = $this->products->findBySlug($productSlug);
            if ($product === null) {
                $this->lastError = ($this->client->lastError !== '')
                    ? $this->client->lastError
                    : 'License Manager Pro product "' . $productSlug . '" was not found';
                return null;
            }
            $update['product_id'] = (int) $product['id'];
        }
        $updated = $this->client->put('/licenses/' . (int) $licenseId, $update);
        if ($updated === null) {
            $this->lastError = $this->client->lastError ? $this->client->lastError : 'Change package failed';
            return null;
        }
        return $updated;
    }
}
