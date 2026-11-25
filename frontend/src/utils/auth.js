import {API_BASE_URL} from "../config";

/**
 * ورود کاربر و ذخیره توکن
 * @param {string} email
 * @param {string} password
 * @returns {Promise<void>}
 */
export const login = async (email, password) => {
    try {
        const response = await fetch(`${API_BASE_URL}/auth/login`, {
            method: "POST", headers: {
                "Content-Type": "application/json",
            }, body: JSON.stringify({email, password}),
        });

        if (!response.ok) {
            throw new Error("Invalid credentials");
        }

        const data = await response.json();
        localStorage.setItem("token", data.access_token);
    } catch (error) {
        console.error("Login failed:", error);
        throw error;
    }
};

/**
 * خروج کاربر و حذف توکن
 */
export const logout = () => {
    localStorage.removeItem("token");
};

/**
 * بررسی وضعیت ورود کاربر
 * @returns {boolean}
 */
export const isAuthenticated = () => {
    return !!localStorage.getItem("token");
};
