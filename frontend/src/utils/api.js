import {API_BASE_URL, DEMO_MODE} from "../config";
// v3.0.6 (security, M7): demoData is loaded LAZILY, only in demo mode.
// It used to be a static import, so the demo mock (demo users, demo API
// keys, the demo 2FA code) shipped inside EVERY production bundle even
// though it never ran there. A dynamic import keeps it in a separate
// chunk that only the demo build loads; the main bundle carries no
// demo secrets at all.
const loadMockRequest = async () => (await import("./demoData")).mockRequest;

const authHeaders = () => {
    const token = localStorage.getItem("token");
    return token ? {Authorization: `Bearer ${token}`} : {};
};

// Shared error parsing for non-2xx responses (v3.0.6): getList used to
// re-implement this inline instead of calling handleResponse.
const throwForBadResponse = async (response) => {
    if (response.ok) return;
    let detail = `Error: ${response.status}`;
    try {
        const err = await response.json();
        detail = err.detail || detail;
    } catch (e) {
        // Keep the status-based message when the body is not JSON.
    }
    const error = new Error(detail);
    error.status = response.status;
    throw error;
};

const handleResponse = async (response, endpoint) => {
    await throwForBadResponse(response);
    return response.json();
};

// Single implementation behind get/post/put/del (v3.0.6 — the four verbs
// used to be four copies of the same ~15-line block: demo branch ->
// mockRequest -> log -> rethrow; live branch -> fetch with authHeaders
// -> handleResponse). Behaviour is unchanged: GET/DELETE send no body
// and no Content-Type; POST/PUT always send Content-Type and a JSON
// body (JSON.stringify(undefined) is undefined, so a missing body sends
// nothing, as before). Errors are logged as `${METHOD} ${endpoint}
// failed:` and rethrown in both modes.
async function request(method, endpoint, body) {
    if (DEMO_MODE) {
        try {
            return await (await loadMockRequest())(method, endpoint, body);
        } catch (error) {
            console.error(`${method} ${endpoint} failed:`, error);
            throw error;
        }
    }
    const hasBody = method === "POST" || method === "PUT";
    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
            method,
            headers: {
                ...(hasBody ? {"Content-Type": "application/json"} : {}),
                ...authHeaders(),
            },
            ...(hasBody ? {body: JSON.stringify(body)} : {}),
        });
        return await handleResponse(response, endpoint);
    } catch (error) {
        console.error(`${method} ${endpoint} failed:`, error);
        throw error;
    }
}

/**
 * Send a GET request to the API
 * @param {string} endpoint
 * @returns {Promise<any>}
 */
export const get = (endpoint) => request("GET", endpoint);

/**
 * Send a POST request to the API
 * @param {string} endpoint
 * @param {object} body
 * @returns {Promise<any>}
 */
export const post = (endpoint, body) => request("POST", endpoint, body);

/**
 * Send a PUT request to the API
 * @param {string} endpoint
 * @param {object} body
 * @returns {Promise<any>}
 */
export const put = (endpoint, body) => request("PUT", endpoint, body);

/**
 * Send a DELETE request to the API
 * @param {string} endpoint
 * @returns {Promise<any>}
 */
export const del = (endpoint) => request("DELETE", endpoint);

/**
 * Paginated list fetch: GET path?skip=&limit= (+ any query already in path).
 * Returns {items, total}. In real mode the total comes from the
 * X-Total-Count response header and the body stays a JSON array; in demo
 * mode the mock returns the same {items, total} shape. get() is unchanged
 * and keeps returning a plain array for backward compatibility.
 * @param {string} path
 * @param {{skip?: number, limit?: number}} opts
 * @returns {Promise<{items: any[], total: number}>}
 */
export const getList = async (path, {skip = 0, limit = 10} = {}) => {
    const sep = path.includes("?") ? "&" : "?";
    const url = `${path}${sep}skip=${skip}&limit=${limit}`;
    if (DEMO_MODE) {
        try {
            const data = await (await loadMockRequest())("GET", url);
            if (data && Array.isArray(data.items)) {
                return {items: data.items, total: data.total != null ? data.total : data.items.length};
            }
            if (data && Array.isArray(data.api_keys)) {
                return {items: data.api_keys, total: data.total != null ? data.total : data.api_keys.length};
            }
            if (Array.isArray(data)) return {items: data, total: data.length};
            return {items: [], total: 0};
        } catch (error) {
            console.error(`GET ${url} failed:`, error);
            throw error;
        }
    }
    try {
        const response = await fetch(`${API_BASE_URL}${url}`, {
            headers: {...authHeaders()},
        });
        await throwForBadResponse(response);
        const body = await response.json();
        const totalHeader = Number(response.headers.get("X-Total-Count"));
        const items = Array.isArray(body) ? body : (body.api_keys || []);
        return {items, total: Number.isFinite(totalHeader) ? totalHeader : items.length};
    } catch (error) {
        console.error(`GET ${url} failed:`, error);
        throw error;
    }
};
