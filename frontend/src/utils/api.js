import {API_BASE_URL, DEMO_MODE} from "../config";
import {mockRequest} from "./demoData";

const authHeaders = () => {
    const token = localStorage.getItem("token");
    return token ? {Authorization: `Bearer ${token}`} : {};
};

const handleResponse = async (response, endpoint) => {
    if (!response.ok) {
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
    }
    return response.json();
};

/**
 * Send a GET request to the API
 * @param {string} endpoint
 * @returns {Promise<any>}
 */
export const get = async (endpoint) => {
    if (DEMO_MODE) {
        try {
            return await mockRequest("GET", endpoint);
        } catch (error) {
            console.error(`GET ${endpoint} failed:`, error);
            throw error;
        }
    }
    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
            headers: {...authHeaders()},
        });
        return await handleResponse(response, endpoint);
    } catch (error) {
        console.error(`GET ${endpoint} failed:`, error);
        throw error;
    }
};

/**
 * Send a POST request to the API
 * @param {string} endpoint
 * @param {object} body
 * @returns {Promise<any>}
 */
export const post = async (endpoint, body) => {
    if (DEMO_MODE) {
        try {
            return await mockRequest("POST", endpoint, body);
        } catch (error) {
            console.error(`POST ${endpoint} failed:`, error);
            throw error;
        }
    }
    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...authHeaders(),
            },
            body: JSON.stringify(body),
        });
        return await handleResponse(response, endpoint);
    } catch (error) {
        console.error(`POST ${endpoint} failed:`, error);
        throw error;
    }
};

/**
 * Send a PUT request to the API
 * @param {string} endpoint
 * @param {object} body
 * @returns {Promise<any>}
 */
export const put = async (endpoint, body) => {
    if (DEMO_MODE) {
        try {
            return await mockRequest("PUT", endpoint, body);
        } catch (error) {
            console.error(`PUT ${endpoint} failed:`, error);
            throw error;
        }
    }
    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                ...authHeaders(),
            },
            body: JSON.stringify(body),
        });
        return await handleResponse(response, endpoint);
    } catch (error) {
        console.error(`PUT ${endpoint} failed:`, error);
        throw error;
    }
};

/**
 * Send a DELETE request to the API
 * @param {string} endpoint
 * @returns {Promise<any>}
 */
export const del = async (endpoint) => {
    if (DEMO_MODE) {
        try {
            return await mockRequest("DELETE", endpoint);
        } catch (error) {
            console.error(`DELETE ${endpoint} failed:`, error);
            throw error;
        }
    }
    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
            method: "DELETE",
            headers: {...authHeaders()},
        });
        return await handleResponse(response, endpoint);
    } catch (error) {
        console.error(`DELETE ${endpoint} failed:`, error);
        throw error;
    }
};
