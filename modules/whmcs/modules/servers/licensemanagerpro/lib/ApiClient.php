<?php
/**
 * License Manager Pro — WHMCS server module API client.
 *
 * Small cURL wrapper around the License Manager Pro REST API. The module
 * logs in with an admin username/password (POST /api/auth/login) and
 * keeps the JWT for the rest of the request. No token is stored anywhere.
 *
 * Requires PHP with the cURL extension. No other dependencies.
 */

if (!defined('WHMCS')) {
    die('This file cannot be accessed directly');
}

class LMP_ApiClient
{
    /** @var string Base URL of the License Manager Pro API, e.g. https://license.example.com/api */
    private $baseUrl;
    /** @var string Admin username (email) */
    private $username;
    /** @var string Admin password */
    private $password;
    /** @var string|null JWT from the last successful login */
    private $token = null;
    /** @var string Last error message, for the module to return to WHMCS */
    public $lastError = '';

    public function __construct($baseUrl, $username, $password)
    {
        $this->baseUrl = rtrim($baseUrl, '/');
        $this->username = $username;
        $this->password = $password;
    }

    /**
     * Log in and store the JWT. Returns true on success.
     */
    public function login()
    {
        $result = $this->request('POST', '/auth/login', array(
            'email' => $this->username,
            'password' => $this->password,
        ), false);
        if ($result === null || !isset($result['access_token'])) {
            if (!$this->lastError) {
                $this->lastError = 'Login failed: no access token returned';
            }
            return false;
        }
        $this->token = $result['access_token'];
        return true;
    }

    public function get($path)
    {
        return $this->request('GET', $path);
    }

    public function post($path, $data = array())
    {
        return $this->request('POST', $path, $data);
    }

    public function put($path, $data = array())
    {
        return $this->request('PUT', $path, $data);
    }

    public function delete($path)
    {
        return $this->request('DELETE', $path);
    }

    /**
     * One HTTP call. Returns the decoded JSON body (array) on HTTP 2xx,
     * null on failure (see $this->lastError).
     */
    private function request($method, $path, $data = null, $withAuth = true)
    {
        if ($withAuth && $this->token === null) {
            if (!$this->login()) {
                return null;
            }
        }
        $url = $this->baseUrl . $path;
        $ch = curl_init($url);
        $headers = array('Content-Type: application/json', 'Accept: application/json');
        if ($withAuth && $this->token) {
            $headers[] = 'Authorization: Bearer ' . $this->token;
        }
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 15);
        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
        if ($data !== null) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
        }
        $raw = curl_exec($ch);
        $httpCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);

        if ($raw === false || $curlError !== '') {
            $this->lastError = 'Could not reach License Manager Pro: ' . $curlError;
            return null;
        }
        $decoded = json_decode($raw, true);
        if ($httpCode < 200 || $httpCode >= 300) {
            $detail = '';
            if (is_array($decoded) && isset($decoded['detail'])) {
                $detail = is_string($decoded['detail']) ? $decoded['detail'] : json_encode($decoded['detail']);
            }
            $this->lastError = 'License Manager Pro returned HTTP ' . $httpCode
                . ($detail !== '' ? ': ' . $detail : '');
            return null;
        }
        return is_array($decoded) ? $decoded : array();
    }
}
