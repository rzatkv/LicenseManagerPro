const API_BASE_URL = "/api";

/**
 * ارسال درخواست GET به API
 * @param {string} endpoint
 * @returns {Promise<any>}
 */
export const get = async (endpoint) => {
    const token = localStorage.getItem("token");
    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });
        if (!response.ok) {
            throw new Error(`Error: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error(`GET ${endpoint} failed:`, error);
        throw error;
    }
};

/**
 * ارسال درخواست POST به API
 * @param {string} endpoint
 * @param {object} body
 * @returns {Promise<any>}
 */
export const post = async (endpoint, body) => {
    const token = localStorage.getItem("token");
    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(body),
        });
        if (!response.ok) {
            throw new Error(`Error: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error(`POST ${endpoint} failed:`, error);
        throw error;
    }
};

/**
 * ارسال درخواست DELETE به API
 * @param {string} endpoint
 * @returns {Promise<any>}
 */
export const del = async (endpoint) => {
    const token = localStorage.getItem("token");
    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
            method: "DELETE",
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });
        if (!response.ok) {
            throw new Error(`Error: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error(`DELETE ${endpoint} failed:`, error);
        throw error;
    }
};