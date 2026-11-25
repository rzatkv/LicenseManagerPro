<?php
/**
 * License Manager Pro — WooCommerce API client.
 *
 * Wraps the License Manager Pro REST API with wp_remote_post(). The
 * plugin logs in with an admin username/password (POST /api/auth/login)
 * and caches the JWT in a transient for 50 minutes.
 */

if (!defined('ABSPATH')) {
    exit;
}

class LMP_Api
{
    /** @var string */
    private $base_url;
    /** @var string */
    private $username;
    /** @var string */
    private $password;

    public function __construct($base_url, $username, $password)
    {
        $this->base_url = rtrim((string) $base_url, '/');
        $this->username = (string) $username;
        $this->password = (string) $password;
    }

    /**
     * Get a JWT, reusing the cached one while it is still valid.
     * Returns the token string, or a WP_Error.
     */
    public function get_token()
    {
        $cached = get_transient('lmp_jwt_token');
        if ($cached) {
            return $cached;
        }
        $response = $this->request('POST', '/auth/login', array(
            'email' => $this->username,
            'password' => $this->password,
        ), false);
        if (is_wp_error($response)) {
            return $response;
        }
        if (empty($response['access_token'])) {
            return new WP_Error('lmp_login', 'Login failed: no access token returned.');
        }
        set_transient('lmp_jwt_token', $response['access_token'], 50 * MINUTE_IN_SECONDS);
        return $response['access_token'];
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
     * One HTTP call. Returns the decoded body array on HTTP 2xx, or a
     * WP_Error with a readable message otherwise.
     */
    private function request($method, $path, $data = null, $with_auth = true)
    {
        $headers = array('Content-Type' => 'application/json', 'Accept' => 'application/json');
        if ($with_auth) {
            $token = $this->get_token();
            if (is_wp_error($token)) {
                return $token;
            }
            $headers['Authorization'] = 'Bearer ' . $token;
        }
        $args = array(
            'method' => $method,
            'headers' => $headers,
            'timeout' => 15,
        );
        if ($data !== null) {
            $args['body'] = wp_json_encode($data);
        }
        $response = wp_remote_request($this->base_url . $path, $args);
        if (is_wp_error($response)) {
            return $response;
        }
        $code = (int) wp_remote_retrieve_response_code($response);
        $body = json_decode(wp_remote_retrieve_body($response), true);
        if ($code < 200 || $code >= 300) {
            $detail = '';
            if (is_array($body) && isset($body['detail'])) {
                $detail = is_string($body['detail']) ? $body['detail'] : wp_json_encode($body['detail']);
            }
            return new WP_Error(
                'lmp_http_' . $code,
                'License Manager Pro returned HTTP ' . $code . ($detail !== '' ? ': ' . $detail : '')
            );
        }
        return is_array($body) ? $body : array();
    }

    /**
     * Resolve a product slug to its License Manager Pro product id.
     * Returns the product array, or a WP_Error.
     */
    public function find_product_by_slug($slug)
    {
        $list = $this->get('/products?slug=' . rawurlencode($slug));
        if (is_wp_error($list)) {
            return $list;
        }
        if (is_array($list) && count($list) === 1) {
            return $list[0];
        }
        return new WP_Error('lmp_product', 'License Manager Pro product "' . $slug . '" was not found.');
    }

    /**
     * Create a license for a product id + billing cycle.
     * Returns the license array, or a WP_Error.
     */
    public function create_license($product_id, $billing_cycle, $owner_email = null)
    {
        return $this->post('/licenses', array(
            'product_id' => (int) $product_id,
            'billing_cycle' => $billing_cycle,
            'owner_email' => $owner_email,
        ));
    }

    /**
     * Validate a license key (optionally with the site domain).
     * Returns array('valid' => bool, 'detail' => string, 'license' => ...).
     */
    public function validate_license($key, $domain = null)
    {
        $body = array('key' => $key);
        if ($domain) {
            $body['domain'] = $domain;
        }
        return $this->post('/licenses/validate', $body);
    }
}
