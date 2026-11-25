<?php
/**
 * License Manager Pro — WHMCS server module.
 *
 * Provisions License Manager Pro licenses from WHMCS: when a customer
 * orders (and pays for) a product that uses this module, WHMCS creates a
 * license in License Manager Pro and stores the license key in the
 * service's password field. Suspension, unsuspension, termination, renewal
 * and package changes are all mapped to the License Manager Pro API.
 *
 * Install: copy the modules/ folder from this package into your WHMCS
 * installation root, so this file ends up at
 * modules/servers/licensemanagerpro/licensemanagerpro.php, then create a
 * product in WHMCS and select "LicenseManagerPro" as its module.
 * No server entry is needed (RequiresServer = false): the API URL and
 * credentials are configured per product below.
 *
 * Requires PHP with the cURL extension.
 */

if (!defined('WHMCS')) {
    die('This file cannot be accessed directly');
}

require_once __DIR__ . '/lib/ApiClient.php';

/**
 * Build an API client from the product's config options.
 */
function licensemanagerpro_client($params)
{
    return new LMP_ApiClient(
        licensemanagerpro_option($params, 'api_url', 1),      // API URL
        licensemanagerpro_option($params, 'api_user', 2),     // Admin email
        licensemanagerpro_option($params, 'api_password', 3)  // Admin password
    );
}

/**
 * Read one config option: WHMCS exposes named options under
 * $params['configoptions']['name'] and positionally as
 * $params['configoptionN'] — accept both.
 */
function licensemanagerpro_option($params, $name, $index)
{
    if (isset($params['configoptions'][$name])) {
        return $params['configoptions'][$name];
    }
    $key = 'configoption' . $index;
    return isset($params[$key]) ? $params[$key] : null;
}

/**
 * Resolve a product slug to its License Manager Pro product id.
 */
function licensemanagerpro_findProduct($client, $slug)
{
    if (!$slug) {
        return null;
    }
    $list = $client->get('/products?slug=' . rawurlencode($slug));
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
 * Find a license by its key (the key is stored in the service password).
 * Returns the license array, or null when not found.
 */
function licensemanagerpro_findLicense($client, $key)
{
    if (!$key) {
        return null;
    }
    $list = $client->get('/licenses?search=' . rawurlencode($key));
    if (!is_array($list)) {
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
 * Store the license key in the service's password field via the WHMCS
 * local API, so the customer (and the admin) can see it in WHMCS.
 */
function licensemanagerpro_storeKey($serviceId, $key)
{
    if (!function_exists('localAPI')) {
        return false;
    }
    $result = localAPI('UpdateClientProduct', array(
        'serviceid' => (int) $serviceId,
        'password' => $key,
    ));
    return isset($result['result']) && $result['result'] === 'success';
}

function licensemanagerpro_MetaData()
{
    return array(
        'DisplayName' => 'License Manager Pro',
        'APIVersion' => '1.1',
        'RequiresServer' => false,
    );
}

function licensemanagerpro_ConfigOptions()
{
    return array(
        'api_url' => array(
            'FriendlyName' => 'API URL',
            'Type' => 'text',
            'Size' => '60',
            'Default' => 'https://license.example.com/api',
            'Description' => 'Base URL of your License Manager Pro API, without a trailing slash.',
        ),
        'api_user' => array(
            'FriendlyName' => 'Admin email',
            'Type' => 'text',
            'Size' => '40',
            'Description' => 'Email of an admin user in License Manager Pro (used for the JWT login).',
        ),
        'api_password' => array(
            'FriendlyName' => 'Admin password',
            'Type' => 'password',
            'Size' => '40',
            'Description' => 'Password of the admin user above.',
        ),
        'product_slug' => array(
            'FriendlyName' => 'Product slug',
            'Type' => 'text',
            'Size' => '40',
            'Description' => 'Slug of the product in License Manager Pro (Products page).',
        ),
        'billing_cycle' => array(
            'FriendlyName' => 'Billing cycle',
            'Type' => 'dropdown',
            'Options' => 'monthly,quarterly,semiannual,annual,biennial,lifetime',
            'Default' => 'annual',
            'Description' => 'Billing cycle used when creating the license. It must be one of the product\'s cycles.',
        ),
    );
}

function licensemanagerpro_CreateAccount($params)
{
    $client = licensemanagerpro_client($params);
    $slug = licensemanagerpro_option($params, 'product_slug', 4);
    $cycle = licensemanagerpro_option($params, 'billing_cycle', 5);
    $product = licensemanagerpro_findProduct($client, $slug);
    if ($product === null) {
        return 'License Manager Pro product "' . $slug . '" was not found';
    }
    $license = $client->post('/licenses', array(
        'product_id' => (int) $product['id'],
        'billing_cycle' => $cycle,
        'owner_email' => isset($params['clientsdetails']['email']) ? $params['clientsdetails']['email'] : null,
    ));
    if ($license === null || !isset($license['key'])) {
        return $client->lastError ? $client->lastError : 'License creation failed';
    }
    licensemanagerpro_storeKey($params['serviceid'], $license['key']);
    return 'success';
}

function licensemanagerpro_SuspendAccount($params)
{
    $client = licensemanagerpro_client($params);
    $license = licensemanagerpro_findLicense($client, $params['password']);
    if ($license === null) {
        return 'License for this service was not found in License Manager Pro';
    }
    $updated = $client->put('/licenses/' . (int) $license['id'], array('status' => 'inactive'));
    if ($updated === null) {
        return $client->lastError ? $client->lastError : 'Suspend failed';
    }
    return 'success';
}

function licensemanagerpro_UnsuspendAccount($params)
{
    $client = licensemanagerpro_client($params);
    $license = licensemanagerpro_findLicense($client, $params['password']);
    if ($license === null) {
        return 'License for this service was not found in License Manager Pro';
    }
    $updated = $client->put('/licenses/' . (int) $license['id'], array('status' => 'active'));
    if ($updated === null) {
        return $client->lastError ? $client->lastError : 'Unsuspend failed';
    }
    return 'success';
}

function licensemanagerpro_TerminateAccount($params)
{
    $client = licensemanagerpro_client($params);
    $license = licensemanagerpro_findLicense($client, $params['password']);
    if ($license === null) {
        // Nothing to revoke: the license is already gone.
        return 'success';
    }
    $deleted = $client->delete('/licenses/' . (int) $license['id']);
    if ($deleted === null) {
        return $client->lastError ? $client->lastError : 'Terminate failed';
    }
    return 'success';
}

function licensemanagerpro_Renew($params)
{
    $client = licensemanagerpro_client($params);
    $license = licensemanagerpro_findLicense($client, $params['password']);
    if ($license === null) {
        return 'License for this service was not found in License Manager Pro';
    }
    $renewed = $client->post('/licenses/' . (int) $license['id'] . '/renew', array());
    if ($renewed === null) {
        return $client->lastError ? $client->lastError : 'Renew failed';
    }
    return 'success';
}

function licensemanagerpro_ChangePackage($params)
{
    // The new package's config options arrive in $params['configoptions'].
    // When the new package maps to a different License Manager Pro product
    // slug, the license is moved to that product; the billing cycle follows
    // the new package's setting.
    $client = licensemanagerpro_client($params);
    $license = licensemanagerpro_findLicense($client, $params['password']);
    if ($license === null) {
        return 'License for this service was not found in License Manager Pro';
    }
    $oldSlug = licensemanagerpro_option($params, 'product_slug', 4);
    $newSlug = isset($params['configoptions']['product_slug'])
        ? $params['configoptions']['product_slug']
        : $oldSlug;
    $newCycle = isset($params['configoptions']['billing_cycle'])
        ? $params['configoptions']['billing_cycle']
        : licensemanagerpro_option($params, 'billing_cycle', 5);
    $update = array('billing_cycle' => $newCycle);
    if ($newSlug && $newSlug !== $oldSlug) {
        $product = licensemanagerpro_findProduct($client, $newSlug);
        if ($product === null) {
            return 'License Manager Pro product "' . $newSlug . '" was not found';
        }
        $update['product_id'] = (int) $product['id'];
    }
    $updated = $client->put('/licenses/' . (int) $license['id'], $update);
    if ($updated === null) {
        return $client->lastError ? $client->lastError : 'Change package failed';
    }
    return 'success';
}

function licensemanagerpro_TestConnection($params)
{
    $client = licensemanagerpro_client($params);
    if (!$client->login()) {
        return array(
            'success' => false,
            'error' => $client->lastError ? $client->lastError : 'Login failed',
        );
    }
    $info = $client->get('/system/info');
    if ($info === null) {
        return array('success' => false, 'error' => $client->lastError);
    }
    return array(
        'success' => true,
        'error' => 'Connected to License Manager Pro version '
            . (isset($info['version']) ? $info['version'] : 'unknown'),
    );
}

function licensemanagerpro_AdminServicesTabFields($params)
{
    $client = licensemanagerpro_client($params);
    $license = licensemanagerpro_findLicense($client, $params['password']);
    if ($license === null) {
        return array(
            'License' => 'No license found in License Manager Pro for this service.',
        );
    }
    return array(
        'License Key' => isset($license['key']) ? $license['key'] : '-',
        'Status' => isset($license['status']) ? $license['status'] : '-',
        'Product' => isset($license['product']) ? $license['product'] : '-',
        'Billing Cycle' => isset($license['billing_cycle']) ? $license['billing_cycle'] : '-',
        'Owner Email' => isset($license['owner_email']) ? $license['owner_email'] : '-',
        'Expires At' => isset($license['expires_at']) && $license['expires_at']
            ? $license['expires_at']
            : 'Never (lifetime)',
        'Activations' => (isset($license['activations']) ? $license['activations'] : 0)
            . ' / ' . (isset($license['max_activations']) ? $license['max_activations'] : 1),
    );
}
