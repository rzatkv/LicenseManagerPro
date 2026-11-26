<?php
/**
 * License Manager Pro — Joomla API client.
 *
 * Wraps the License Manager Pro REST API with Joomla's HTTP client
 * (HttpFactory). Authentication is API-key only: one scoped module key
 * is sent as X-API-Key, optionally with HMAC-signed requests.
 *
 * Signing (when enabled): headers X-LMP-Timestamp (unix seconds) and
 * X-LMP-Signature = hex(HMAC-SHA256(key = raw bytes of SHA256(secret),
 * message)) where message = METHOD + "\n" + PATH + "\n" + TIMESTAMP +
 * "\n" + SHA256(raw request body).hexdigest(). PATH is the URL path
 * only, without the query string. The server rejects timestamps older
 * than 5 minutes.
 *
 * TLS verification is never disabled: no SSL option is ever passed
 * that would turn verification off, and the client fails closed on
 * any transport error.
 *
 * Every non-2xx response throws. HTTP 401/403 throws LmpAuthException
 * and must be treated as "no license minted, no state changed".
 */

declare(strict_types=1);

namespace Licensemanagerpro\Component\Licensemanagerpro\Administrator\Model;

use Joomla\CMS\Http\HttpFactory;
use RuntimeException;
use Throwable;

/** API error carrying the HTTP status code (0 = transport failure). */
class LmpApiException extends RuntimeException
{
    private int $statusCode;

    public function __construct(string $message, int $statusCode = 0)
    {
        parent::__construct($message, $statusCode);
        $this->statusCode = $statusCode;
    }

    public function getStatusCode(): int
    {
        return $this->statusCode;
    }
}

/** Authentication/authorization failure (HTTP 401/403). Fail closed. */
class LmpAuthException extends LmpApiException
{
}

class ApiClient
{
    public const TIMEOUT_SECONDS = 15;
    public const SIGNATURE_WINDOW_SECONDS = 300;

    private const HEADER_API_KEY = 'X-API-Key';
    private const HEADER_TIMESTAMP = 'X-LMP-Timestamp';
    private const HEADER_SIGNATURE = 'X-LMP-Signature';

    private string $apiUrl;
    private string $apiKey;
    private bool $signedRequests;
    private HttpFactory $httpFactory;

    /**
     * @param string $apiUrl         Base URL of the License Manager Pro API,
     *                               e.g. https://license.example.com/api
     * @param string $apiKey         Scoped module API key (shown once at creation)
     * @param bool   $signedRequests Whether to add HMAC signature headers
     */
    public function __construct(string $apiUrl, string $apiKey, bool $signedRequests, ?HttpFactory $httpFactory = null)
    {
        $apiUrl = rtrim(trim($apiUrl), '/');
        if ($apiUrl === '') {
            throw new LmpApiException('License Manager Pro API URL is not configured.');
        }
        if (trim($apiKey) === '') {
            throw new LmpApiException('License Manager Pro API key is not configured.');
        }
        if (substr($apiUrl, -4) !== '/api') {
            $apiUrl .= '/api';
        }
        $this->apiUrl = $apiUrl;
        $this->apiKey = trim($apiKey);
        $this->signedRequests = $signedRequests;
        $this->httpFactory = $httpFactory ?? new HttpFactory();
    }

    /** GET /system/info — used by Test connection. */
    public function testConnection(): array
    {
        $info = $this->get('/system/info');
        return [
            'ok' => true,
            'version' => $info['version'] ?? null,
            'lastUpdated' => $info['lastUpdated'] ?? null,
        ];
    }

    /**
     * POST /licenses/validate — check a key (optionally bound to a
     * domain, IP or install path). Returns the decoded response.
     * PUBLIC endpoint (v3.0): sends no API key and no HMAC signature —
     * the check is open to any server; the blacklist still applies
     * server-side.
     */
    public function validateLicense(string $key, ?string $domain = null, ?string $ip = null, ?string $installPath = null): array
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
        return $this->post('/licenses/validate', $payload, true);
    }

    public function get(string $path): array
    {
        return $this->request('GET', $path);
    }

    public function post(string $path, array $data = [], bool $public = false): array
    {
        return $this->request('POST', $path, $data, $public);
    }

    public function put(string $path, array $data = []): array
    {
        return $this->request('PUT', $path, $data);
    }

    public function delete(string $path): array
    {
        return $this->request('DELETE', $path);
    }

    /**
     * One HTTP call. Returns the decoded JSON body on HTTP 2xx.
     * Throws LmpAuthException on 401/403 and LmpApiException otherwise.
     *
     * $public = true marks a PUBLIC endpoint (POST /licenses/validate):
     * no X-API-Key header and no HMAC signature are sent.
     */
    private function request(string $method, string $path, ?array $data = null, bool $public = false): array
    {
        $method = strtoupper($method);
        $url = $this->apiUrl . $path;
        $body = $data === null ? '' : (string) json_encode($data);

        $headers = [
            'Accept' => 'application/json',
        ];
        if (!$public) {
            $headers[self::HEADER_API_KEY] = $this->apiKey;
        }
        if ($body !== '') {
            $headers['Content-Type'] = 'application/json';
        }
        if ($this->signedRequests && !$public) {
            $timestamp = (string) time();
            $pathOnly = (string) parse_url($url, PHP_URL_PATH);
            $message = $method . "\n" . $pathOnly . "\n" . $timestamp . "\n" . hash('sha256', $body);
            $signingKey = hash('sha256', $this->apiKey, true);
            $headers[self::HEADER_TIMESTAMP] = $timestamp;
            $headers[self::HEADER_SIGNATURE] = hash_hmac('sha256', $message, $signingKey);
        }

        try {
            $http = $this->httpFactory->getHttp(['timeout' => self::TIMEOUT_SECONDS]);
            switch ($method) {
                case 'GET':
                    $response = $http->get($url, $headers);
                    break;
                case 'POST':
                    $response = $http->post($url, $body, $headers);
                    break;
                case 'PUT':
                    $response = $http->put($url, $body, $headers);
                    break;
                case 'DELETE':
                    $response = $http->delete($url, $headers);
                    break;
                default:
                    throw new LmpApiException('Unsupported HTTP method: ' . $method);
            }
        } catch (LmpApiException $e) {
            throw $e;
        } catch (Throwable $e) {
            throw new LmpApiException('Could not reach License Manager Pro: ' . $e->getMessage());
        }

        $code = (int) $response->code;
        $decoded = json_decode((string) $response->body, true);
        $detail = $this->extractDetail($decoded);

        if ($code === 401 || $code === 403) {
            throw new LmpAuthException(
                'License Manager Pro rejected the API key (HTTP ' . $code . ').'
                . ($detail !== '' ? ' ' . $detail : '')
                . ' No license was created or changed.',
                $code
            );
        }
        if ($code < 200 || $code >= 300) {
            throw new LmpApiException(
                'License Manager Pro returned HTTP ' . $code . ($detail !== '' ? ': ' . $detail : ''),
                $code
            );
        }
        if (!is_array($decoded)) {
            throw new LmpApiException('License Manager Pro returned an unreadable response.');
        }
        return $decoded;
    }

    private function extractDetail(mixed $decoded): string
    {
        if (!is_array($decoded) || !isset($decoded['detail'])) {
            return '';
        }
        $detail = $decoded['detail'];
        if (is_string($detail)) {
            return $detail;
        }
        if (is_array($detail)) {
            $parts = [];
            foreach ($detail as $item) {
                if (is_string($item)) {
                    $parts[] = $item;
                } elseif (is_array($item) && isset($item['msg'])) {
                    $parts[] = (string) $item['msg'];
                }
            }
            return implode('; ', $parts);
        }
        return '';
    }
}
