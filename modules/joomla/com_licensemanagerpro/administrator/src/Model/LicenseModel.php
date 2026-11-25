<?php
/**
 * License Manager Pro — administrator data layer.
 *
 * Talks to the License Manager Pro API through ApiClient and nothing
 * else: no direct database access to the backend, no credentials
 * other than the one scoped module API key from the component
 * parameters. All failures throw LmpApiException / LmpAuthException
 * and leave backend state untouched (fail closed).
 */

declare(strict_types=1);

namespace Licensemanagerpro\Component\Licensemanagerpro\Administrator\Model;

use InvalidArgumentException;
use Joomla\CMS\Component\ComponentHelper;
use Joomla\CMS\MVC\Model\BaseDatabaseModel;

class LicenseModel extends BaseDatabaseModel
{
    /** Build the API client from the stored component parameters. */
    public static function createClient(): ApiClient
    {
        $params = ComponentHelper::getParams('com_licensemanagerpro');
        return new ApiClient(
            (string) $params->get('api_url', ''),
            (string) $params->get('api_key', ''),
            (bool) $params->get('signed_requests', 0)
        );
    }

    /** GET /system/info — connection probe for the dashboard. */
    public function testConnection(): array
    {
        return self::createClient()->testConnection();
    }

    /** GET /products — the product list for the mint form dropdown. */
    public function getProducts(): array
    {
        $products = self::createClient()->get('/products?limit=100');
        return is_array($products) ? array_values($products) : [];
    }

    /** GET /products?slug=<slug> — exact slug lookup, null when absent. */
    public function findProductBySlug(string $slug): ?array
    {
        $products = self::createClient()->get('/products?slug=' . rawurlencode($slug));
        if (is_array($products) && count($products) === 1) {
            return $products[0];
        }
        return null;
    }

    /** GET /licenses, optionally filtered by search text / status. */
    public function getLicenses(?string $search = null, ?string $status = null, int $limit = 25): array
    {
        $query = ['limit' => max(1, $limit)];
        if ($search !== null && $search !== '') {
            $query['search'] = $search;
        }
        if ($status !== null && $status !== '') {
            $query['status'] = $status;
        }
        $licenses = self::createClient()->get('/licenses?' . http_build_query($query));
        return is_array($licenses) ? array_values($licenses) : [];
    }

    /** GET /licenses/{id}. */
    public function getLicense(int $id): array
    {
        return self::createClient()->get('/licenses/' . $id);
    }

    /**
     * POST /licenses — mint a license for a Joomla user.
     *
     * The product slug is resolved to a product id first (the backend
     * has no product_slug field). The billing cycle must map to one of
     * the six License Manager Pro cycles; anything else fails closed
     * here instead of sending a cycle the backend would reject.
     */
    public function mintLicense(string $ownerEmail, string $productSlug, ?string $billingCycle, ?string $key = null): array
    {
        $product = $this->findProductBySlug($productSlug);
        if ($product === null || !isset($product['id'])) {
            throw new LmpApiException('License Manager Pro product "' . $productSlug . '" was not found.');
        }
        $cycle = CycleMapper::map($billingCycle);
        if ($cycle === null) {
            throw new InvalidArgumentException('A billing cycle is required and must be one of: ' . implode(', ', CycleMapper::CYCLES) . '.');
        }
        $payload = [
            'product_id' => (int) $product['id'],
            'owner_email' => $ownerEmail,
            'billing_cycle' => $cycle,
        ];
        if ($key !== null && $key !== '') {
            $payload['key'] = $key;
        }
        return self::createClient()->post('/licenses', $payload);
    }

    /**
     * POST /licenses/{id}/renew — renew by the license's own cycle, or
     * switch to a new cycle (sent as ?billing_cycle=..., per the
     * backend contract; the backend syncs a missing cycle onto the
     * product).
     */
    public function renewLicense(int $id, ?string $billingCycle = null): array
    {
        $path = '/licenses/' . $id . '/renew';
        $cycle = CycleMapper::map($billingCycle);
        if ($billingCycle !== null && $billingCycle !== '' && $cycle === null) {
            throw new InvalidArgumentException('Unknown billing cycle "' . $billingCycle . '".');
        }
        if ($cycle !== null) {
            $path .= '?billing_cycle=' . rawurlencode($cycle);
        }
        return self::createClient()->post($path, []);
    }

    /** PUT /licenses/{id} {status} — activate or deactivate. */
    public function setLicenseStatus(int $id, string $status): array
    {
        if (!in_array($status, ['active', 'inactive'], true)) {
            throw new InvalidArgumentException('Status must be active or inactive.');
        }
        return self::createClient()->put('/licenses/' . $id, ['status' => $status]);
    }

    /** DELETE /licenses/{id} — revoke the license. */
    public function revokeLicense(int $id): void
    {
        self::createClient()->delete('/licenses/' . $id);
    }

    /** POST /licenses/validate — check a key from the dashboard tool. */
    public function validateLicenseKey(string $key, ?string $domain = null): array
    {
        return self::createClient()->validateLicense($key, $domain);
    }
}
