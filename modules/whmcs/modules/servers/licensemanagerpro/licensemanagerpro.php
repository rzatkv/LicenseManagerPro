<?php
/**
 * License Manager Pro — WHMCS server module.
 *
 * Controller layer: WHMCS lifecycle handlers (CreateAccount,
 * SuspendAccount, UnsuspendAccount, TerminateAccount, Renew,
 * ChangePackage, TestConnection), the module settings definition
 * (ConfigOptions) and the product-dropdown Loader function. It
 * orchestrates the Model layer and hands rendering to the View layer.
 * It makes no raw HTTP calls and contains no license business logic —
 * both live in lib/.
 *
 * Layers:
 *   Model      lib/ApiClient.php        (HTTP + X-API-Key + HMAC signing)
 *              lib/ProductRepository.php (product lookups + cached list)
 *              lib/LicenseService.php   (create/suspend/renew/...)
 *              lib/BillingCycle.php     (WHMCS cycle -> LMP cycle)
 *   View       lib/AdminTabView.php     (admin services-tab license card)
 *   Controller this file                (WHMCS entry points only)
 *
 * Authentication is API-key-only: ONE module-scoped API key, stored
 * in the product's module settings together with the API URL and an
 * optional "signed requests" toggle. There is no login call and no
 * admin credential anywhere in this module. The key is created in the
 * License Manager Pro panel (API Keys page, module-key toggle,
 * 30/90/180/365-day expiry) and pasted once; the WHMCS product then
 * picks its License Manager Pro product from a live dropdown (see the
 * Loader function below) instead of a typed slug.
 *
 * Provisions License Manager Pro licenses from WHMCS: when a customer
 * orders (and pays for) a product that uses this module, WHMCS creates
 * a license in License Manager Pro and stores the license key in the
 * service's password field. Suspension, unsuspension, termination,
 * renewal and package changes are all mapped to the License Manager
 * Pro API.
 *
 * Install: copy the modules/ folder from this package into your WHMCS
 * installation root, so this file ends up at
 * modules/servers/licensemanagerpro/licensemanagerpro.php, then create
 * a product in WHMCS and select "LicenseManagerPro" as its module.
 * No server entry is needed (RequiresServer = false): the API URL and
 * API key are configured per product below.
 *
 * Requires PHP with the cURL extension.
 */

if (!defined('WHMCS')) {
    die('This file cannot be accessed directly');
}

require_once __DIR__ . '/lib/ApiClient.php';
require_once __DIR__ . '/lib/BillingCycle.php';
require_once __DIR__ . '/lib/ProductRepository.php';
require_once __DIR__ . '/lib/LicenseService.php';
require_once __DIR__ . '/lib/AdminTabView.php';

/**
 * Build an API client from the product's config options.
 * Config option order (see licensemanagerpro_ConfigOptions):
 *   1 = api_url, 2 = api_key, 3 = signed_requests.
 */
function licensemanagerpro_client($params)
{
    $signed = licensemanagerpro_option($params, 'signed_requests', 3);
    return new LMP_ApiClient(
        licensemanagerpro_option($params, 'api_url', 1),
        licensemanagerpro_option($params, 'api_key', 2),
        ($signed === 'on' || $signed === '1' || $signed === true || $signed === 'true')
    );
}

/**
 * Build the license service (Model) for this product's settings.
 */
function licensemanagerpro_service($params)
{
    $client = licensemanagerpro_client($params);
    return new LMP_LicenseService($client, new LMP_ProductRepository($client));
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
 * Resolve the billing cycle to send to License Manager Pro for a
 * service: the mapped WHMCS service cycle wins; when the service cycle
 * is unmapped/missing, fall back to the product config option
 * 'billing_cycle'. Returns null only when neither yields a cycle.
 * (Triennially maps to 'biennial' — see LMP_BillingCycle.)
 */
function licensemanagerpro_resolveBillingCycle($params)
{
    $mapped = LMP_BillingCycle::map(
        isset($params['billingcycle']) ? $params['billingcycle'] : null
    );
    if ($mapped !== null) {
        return $mapped;
    }
    return licensemanagerpro_option($params, 'billing_cycle', 5);
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

function licensemanagerpro_ConfigOptions($params = array())
{
    return array(
        'api_url' => array(
            'FriendlyName' => 'API URL',
            'Type' => 'text',
            'Size' => '60',
            'Default' => 'https://license.example.com/api',
            'Description' => 'Base URL of your License Manager Pro API, without a trailing slash.',
        ),
        'api_key' => array(
            'FriendlyName' => 'API key',
            'Type' => 'password',
            'Size' => '40',
            'Description' => 'Module-scoped API key from the License Manager Pro panel (API Keys page, module-key toggle). The key is shown once when created — copy it here. No admin login is used.',
        ),
        'signed_requests' => array(
            'FriendlyName' => 'Sign requests (HMAC)',
            'Type' => 'yesno',
            'Description' => 'Send X-LMP-Timestamp + X-LMP-Signature with every request (HMAC-SHA256). Only enable this when the API key was created with "require signed requests".',
        ),
        'product_slug' => array(
            'FriendlyName' => 'LicenseManagerPro Product',
            'Type' => 'text',
            'Size' => '40',
            'Loader' => 'licensemanagerpro_ProductLoader',
            'SimpleMode' => true,
            'Description' => 'Pick the License Manager Pro product from the list (loaded live from the API with the key above). If the list cannot be loaded, the error is shown here and you can type the product slug manually instead.',
        ),
        'billing_cycle' => array(
            'FriendlyName' => 'Billing cycle',
            'Type' => 'dropdown',
            'Options' => 'monthly,quarterly,semiannual,annual,biennial,lifetime',
            'Default' => 'annual',
            'Description' => 'Fallback billing cycle, used only when the service\'s own WHMCS billing cycle has no equivalent in License Manager Pro (e.g. Free Account). When the service cycle maps (Monthly, Quarterly, Semi-Annually, Annually, Biennially, Triennially -> biennial, One Time), that cycle is used instead — and it is added to the product automatically when missing.',
        ),
    );
}

/**
 * Loader function for the "LicenseManagerPro Product" field (see
 * ConfigOptions). WHMCS calls this with $params — including the
 * product's saved api_url / api_key — when the Module Settings page
 * is rendered, and shows the returned [slug => label] pairs as the
 * dropdown. The list is cached for 5 minutes by the repository, so
 * every admin page load does not hammer the API.
 *
 * Failure handling (graceful, never breaks the settings page):
 *  - API unreachable / key rejected: when a product slug is already
 *    saved for this WHMCS product, that slug is returned as the only
 *    option, labelled so the admin knows the list could not be
 *    refreshed — the saved value is preserved. When nothing is saved
 *    yet, an Exception is thrown with a clear message, which WHMCS
 *    displays inline on the settings page; the field stays a plain
 *    text input, so the admin can still type the product slug
 *    manually, fix the API URL / key, save, and reopen the page.
 *  - The API key is only ever sent server-side (cURL, TLS verified);
 *    it is never exposed to the browser.
 */
function licensemanagerpro_ProductLoader($params)
{
    $client = licensemanagerpro_client($params);
    if (!$client->isConfigured()) {
        throw new Exception(
            'Set the API URL and API key above, save the product, then reopen Module Settings to load the product list.'
        );
    }
    $repository = new LMP_ProductRepository($client);
    $result = $repository->dropdownOptions();
    if (!empty($result['options'])) {
        return $result['options'];
    }
    $savedSlug = licensemanagerpro_option($params, 'product_slug', 4);
    if ($savedSlug !== null && $savedSlug !== '') {
        return array(
            $savedSlug => $savedSlug . ' (product list unavailable — saved value kept)',
        );
    }
    throw new Exception(
        'Could not load products from License Manager Pro: '
        . ($result['error'] !== '' ? $result['error'] : 'no products found.')
        . ' Type the product slug manually, or fix the API URL / API key and try again.'
    );
}

function licensemanagerpro_CreateAccount($params)
{
    $service = licensemanagerpro_service($params);
    $slug = licensemanagerpro_option($params, 'product_slug', 4);
    // The service's own WHMCS billing cycle wins when it maps; the
    // configured billing_cycle is only the fallback (see
    // licensemanagerpro_resolveBillingCycle).
    $cycle = licensemanagerpro_resolveBillingCycle($params);
    if ($slug === null || $slug === '') {
        return 'No License Manager Pro product selected: pick one in the product\'s module settings.';
    }
    $license = $service->createLicense(
        $slug,
        $cycle,
        isset($params['clientsdetails']['email']) ? $params['clientsdetails']['email'] : null
    );
    if ($license === null) {
        // Fail closed: no license minted, the service is not marked
        // as licensed, and the error is shown to the admin.
        return $service->lastError ? $service->lastError : 'License creation failed';
    }
    licensemanagerpro_storeKey($params['serviceid'], $license['key']);
    return 'success';
}

function licensemanagerpro_SuspendAccount($params)
{
    $service = licensemanagerpro_service($params);
    $license = $service->findByKey($params['password']);
    if ($license === null) {
        return $service->lastError
            ? $service->lastError
            : 'License for this service was not found in License Manager Pro';
    }
    $updated = $service->setStatus($license['id'], 'inactive');
    if ($updated === null) {
        return $service->lastError ? $service->lastError : 'Suspend failed';
    }
    return 'success';
}

function licensemanagerpro_UnsuspendAccount($params)
{
    $service = licensemanagerpro_service($params);
    $license = $service->findByKey($params['password']);
    if ($license === null) {
        return $service->lastError
            ? $service->lastError
            : 'License for this service was not found in License Manager Pro';
    }
    $updated = $service->setStatus($license['id'], 'active');
    if ($updated === null) {
        return $service->lastError ? $service->lastError : 'Unsuspend failed';
    }
    return 'success';
}

function licensemanagerpro_TerminateAccount($params)
{
    $service = licensemanagerpro_service($params);
    $license = $service->findByKey($params['password']);
    if ($license === null) {
        // Fail closed on an API error (do not pretend the license is
        // gone while the backend could not even be reached); return
        // success only when the lookup genuinely found nothing, i.e.
        // the license is already gone.
        if ($service->lastError !== '') {
            return $service->lastError;
        }
        return 'success';
    }
    if (!$service->revokeLicense($license['id'])) {
        return $service->lastError ? $service->lastError : 'Terminate failed';
    }
    return 'success';
}

function licensemanagerpro_Renew($params)
{
    $service = licensemanagerpro_service($params);
    $license = $service->findByKey($params['password']);
    if ($license === null) {
        return $service->lastError
            ? $service->lastError
            : 'License for this service was not found in License Manager Pro';
    }
    // Renew with the service's resolved billing cycle: the license
    // switches to that cycle (synced onto the product when missing) and
    // expiry is extended by it. Without a cycle the license simply
    // renews by its own stored cycle.
    $cycle = licensemanagerpro_resolveBillingCycle($params);
    $renewed = $service->renewLicense($license['id'], $cycle);
    if ($renewed === null) {
        return $service->lastError ? $service->lastError : 'Renew failed';
    }
    return 'success';
}

function licensemanagerpro_ChangePackage($params)
{
    // The new package's config options arrive in $params['configoptions'].
    // When the new package maps to a different License Manager Pro product
    // slug, the license is moved to that product; the billing cycle follows
    // the new package's setting.
    $service = licensemanagerpro_service($params);
    $license = $service->findByKey($params['password']);
    if ($license === null) {
        return $service->lastError
            ? $service->lastError
            : 'License for this service was not found in License Manager Pro';
    }
    $oldSlug = licensemanagerpro_option($params, 'product_slug', 4);
    $newSlug = isset($params['configoptions']['product_slug'])
        ? $params['configoptions']['product_slug']
        : $oldSlug;
    // Resolve the cycle from the new package's params the same way as
    // CreateAccount: the new package's WHMCS billing cycle wins when it
    // maps, otherwise the new package's configured billing_cycle.
    $newCycle = licensemanagerpro_resolveBillingCycle($params);
    $newSlugForMove = ($newSlug && $newSlug !== $oldSlug) ? $newSlug : null;
    $updated = $service->moveLicense($license['id'], $newSlugForMove, $newCycle);
    if ($updated === null) {
        return $service->lastError ? $service->lastError : 'Change package failed';
    }
    return 'success';
}

function licensemanagerpro_TestConnection($params)
{
    $client = licensemanagerpro_client($params);
    $info = $client->getSystemInfo();
    if ($info === null) {
        return array(
            'success' => false,
            'error' => $client->lastError ? $client->lastError : 'Connection failed',
        );
    }
    return array(
        'success' => true,
        'error' => 'Connected to License Manager Pro version '
            . (isset($info['version']) ? $info['version'] : 'unknown'),
    );
}

function licensemanagerpro_AdminServicesTabFields($params)
{
    $service = licensemanagerpro_service($params);
    $license = $service->findByKey($params['password']);
    $resolvedCycle = licensemanagerpro_resolveBillingCycle($params);
    $apiUrl = licensemanagerpro_option($params, 'api_url', 1);
    $card = LMP_AdminTabView::render($license, $resolvedCycle, $apiUrl);
    return array('LicenseManagerPro' => $card);
}
