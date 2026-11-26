<?php
/**
 * License Manager Pro — OpenCart catalog model.
 *
 * Catalog-side copy of the License Manager Pro API client (see the
 * admin model for the full description). OpenCart admin and catalog
 * are separate applications, so one shared client file cannot be
 * autoloaded by both sides — this copy is intentional, and must be
 * kept in sync with admin/model/extension/module/licensemanagerpro.php
 * whenever the client changes.
 *
 * Authentication is by ONE scoped module API key (X-API-Key header).
 * No admin email/password is used anywhere. Signed requests add
 * X-LMP-Timestamp / X-LMP-Signature. TLS verification is always on
 * and a 401/403 fails closed: null is returned and no license is
 * minted.
 */
class ModelExtensionModuleLicensemanagerpro extends Model
{
    public const API_TIMEOUT_SECONDS = 15;
    public const API_CONNECT_TIMEOUT_SECONDS = 5;
    public const DEFAULT_COMPLETE_STATUS_ID = 5;

    /** @var string[] The six billing cycles License Manager Pro understands. */
    public const BILLING_CYCLES = ['monthly', 'quarterly', 'semiannual', 'annual', 'biennial', 'lifetime'];

    /** @var string Last error message from the API, empty on success. */
    public string $lastError = '';

    /**
     * @return array{base_url: string, api_key: string, signed: bool}
     */
    public function getApiConfig(): array
    {
        return [
            'base_url' => rtrim((string) $this->config->get('module_licensemanagerpro_api_url'), '/'),
            'api_key' => (string) $this->config->get('module_licensemanagerpro_api_key'),
            'signed' => (bool) $this->config->get('module_licensemanagerpro_signed'),
        ];
    }

    public function isConfigured(): bool
    {
        $config = $this->getApiConfig();
        return $config['base_url'] !== '' && $config['api_key'] !== '';
    }

    /**
     * @return array<int, array{slug: string, cycle: string}>
     */
    public function getMapping(): array
    {
        $mapping = $this->config->get('module_licensemanagerpro_mapping');
        if (!is_array($mapping)) {
            return [];
        }
        $clean = [];
        foreach ($mapping as $productId => $row) {
            $slug = trim((string) ($row['slug'] ?? ''));
            if ($slug === '') {
                continue;
            }
            $cycle = (string) ($row['cycle'] ?? '');
            $clean[(int) $productId] = [
                'slug' => $slug,
                'cycle' => self::isValidBillingCycle($cycle) ? $cycle : '',
            ];
        }
        return $clean;
    }

    public function getCompleteStatusId(): int
    {
        $statusId = (int) $this->config->get('module_licensemanagerpro_complete_status_id');
        return $statusId > 0 ? $statusId : self::DEFAULT_COMPLETE_STATUS_ID;
    }

    public static function isValidBillingCycle(?string $cycle): bool
    {
        return $cycle !== null && in_array($cycle, self::BILLING_CYCLES, true);
    }

    /** @return array<int, array<string, mixed>> */
    public function listProducts(): array
    {
        $result = $this->get('/products', ['limit' => 100]);
        return is_array($result) ? $result : [];
    }

    public function findProductBySlug(string $slug): ?array
    {
        $result = $this->get('/products', ['slug' => $slug]);
        if (!is_array($result) || count($result) !== 1) {
            if ($this->lastError === '') {
                $this->lastError = 'License Manager Pro product "' . $slug . '" was not found.';
            }
            return null;
        }
        return $result[0];
    }

    public function createLicense(int $productId, string $ownerEmail, ?string $billingCycle = null): ?array
    {
        $payload = [
            'product_id' => $productId,
            'owner_email' => $ownerEmail,
        ];
        if (self::isValidBillingCycle($billingCycle)) {
            $payload['billing_cycle'] = $billingCycle;
        }
        return $this->post('/licenses', $payload);
    }

    public function createLicenseForSlug(string $slug, string $ownerEmail, ?string $billingCycle = null): ?array
    {
        $product = $this->findProductBySlug($slug);
        if ($product === null || !isset($product['id'])) {
            return null;
        }
        return $this->createLicense((int) $product['id'], $ownerEmail, $billingCycle);
    }

    /** @return array<int, array<string, mixed>> */
    public function getLicensesByEmail(string $email): array
    {
        $result = $this->get('/licenses', ['search' => $email]);
        return is_array($result) ? $result : [];
    }

    public function getLicense(int $licenseId): ?array
    {
        return $this->get('/licenses/' . $licenseId);
    }

    public function renewLicense(int $licenseId, ?string $billingCycle = null): ?array
    {
        $query = [];
        if (self::isValidBillingCycle($billingCycle)) {
            $query['billing_cycle'] = $billingCycle;
        }
        return $this->post('/licenses/' . $licenseId . '/renew', [], $query);
    }

    public function revokeLicense(int $licenseId): ?array
    {
        return $this->delete('/licenses/' . $licenseId);
    }

    /**
     * POST /licenses/validate — check a key against domain/IP/install path.
     * PUBLIC endpoint (v3.0): sends no API key and no HMAC signature —
     * the check is open to any server; the blacklist still applies
     * server-side.
     */
    public function validateLicense(string $key, ?string $domain = null, ?string $ip = null, ?string $installPath = null): ?array
    {
        $payload = ['key' => $key];
        if ($domain !== null && $domain !== '') {
            $payload['domain'] = $domain;
        }
        if ($ip !== null && $ip !== '') {
            $payload['ip'] = $ip;
        }
        if ($installPath !== null && $installPath !== '') {
            $payload['install_path'] = $installPath;
        }
        return $this->post('/licenses/validate', $payload, [], true);
    }

    public function get(string $path, array $query = []): ?array
    {
        return $this->request('GET', $path, null, $query);
    }

    public function post(string $path, array $data = [], array $query = [], bool $public = false): ?array
    {
        return $this->request('POST', $path, $data, $query, $public);
    }

    public function put(string $path, array $data = [], array $query = []): ?array
    {
        return $this->request('PUT', $path, $data, $query);
    }

    public function delete(string $path, array $query = []): ?array
    {
        return $this->request('DELETE', $path, null, $query);
    }

    /**
     * One HTTP call. Returns the decoded JSON body (array) on HTTP 2xx,
     * null on failure (see $this->lastError). TLS verification is never
     * disabled and a 401/403 fails closed.
     *
     * $public = true marks a PUBLIC endpoint (POST /licenses/validate):
     * no X-API-Key header and no HMAC signature are sent.
     */
    public function request(string $method, string $path, ?array $data = null, array $query = [], bool $public = false): ?array
    {
        $this->lastError = '';
        $config = $this->getApiConfig();
        if ($config['base_url'] === '' || $config['api_key'] === '') {
            $this->lastError = 'License Manager Pro API URL and API key are not configured.';
            return null;
        }
        $method = strtoupper($method);
        $body = $data === null ? '' : (string) json_encode($data);
        $url = $config['base_url'] . $path;
        if ($query !== []) {
            $url .= '?' . http_build_query($query);
        }
        $headers = [
            'Content-Type: application/json',
            'Accept: application/json',
        ];
        if (!$public) {
            $headers[] = 'X-API-Key: ' . $config['api_key'];
        }
        if ($config['signed'] && !$public) {
            $timestamp = (string) time();
            $bodyHash = hash('sha256', $body);
            $message = $method . "\n" . $path . "\n" . $timestamp . "\n" . $bodyHash;
            $signingKey = hex2bin(hash('sha256', $config['api_key']));
            $headers[] = 'X-LMP-Timestamp: ' . $timestamp;
            $headers[] = 'X-LMP-Signature: ' . hash_hmac('sha256', $message, $signingKey);
        }
        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, self::API_TIMEOUT_SECONDS);
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, self::API_CONNECT_TIMEOUT_SECONDS);
        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
        curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 2);
        if ($data !== null) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
        }
        $raw = curl_exec($ch);
        $httpCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);
        if ($raw === false || $curlError !== '') {
            $this->lastError = 'Could not reach License Manager Pro: ' . $curlError;
            return null;
        }
        $decoded = json_decode((string) $raw, true);
        if ($httpCode === 401 || $httpCode === 403) {
            $this->lastError = 'License Manager Pro rejected the API key (HTTP ' . $httpCode . '). '
                . 'No license was created. Check the key and its scopes in the License Manager Pro panel.';
            return null;
        }
        if ($httpCode < 200 || $httpCode >= 300) {
            $detail = '';
            if (is_array($decoded) && isset($decoded['detail'])) {
                $detail = is_string($decoded['detail']) ? $decoded['detail'] : json_encode($decoded['detail']);
            }
            $this->lastError = 'License Manager Pro returned HTTP ' . $httpCode
                . ($detail !== '' ? ': ' . $detail : '');
            return null;
        }
        if (!is_array($decoded)) {
            $this->lastError = 'License Manager Pro returned an unexpected response.';
            return null;
        }
        return $decoded;
    }

    public function getLicenseTable(): string
    {
        return DB_PREFIX . 'lmp_license';
    }

    public function hasLicenseForOrderProduct(int $orderProductId): bool
    {
        $query = $this->db->query("SELECT `lmp_license_id` FROM `" . $this->getLicenseTable() . "` "
            . "WHERE `order_product_id` = '" . (int) $orderProductId . "'");
        return $query->num_rows > 0;
    }

    public function recordLicense(int $orderId, int $orderProductId, int $licenseId, string $licenseKey): void
    {
        $this->db->query("INSERT INTO `" . $this->getLicenseTable() . "` SET "
            . "`order_id` = '" . (int) $orderId . "', "
            . "`order_product_id` = '" . (int) $orderProductId . "', "
            . "`license_id` = '" . (int) $licenseId . "', "
            . "`license_key` = '" . $this->db->escape($licenseKey) . "', "
            . "`date_added` = NOW()");
    }
}
