import {API_BASE_URL, DEMO_MODE} from "../config";

const USER_KEY = "lmp-user";

/** The logged-in user as stored at login: {email, role}. */
export function getCurrentUser() {
    try {
        const raw = localStorage.getItem(USER_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (e) {
        return null;
    }
}

export function getCurrentRole() {
    const user = getCurrentUser();
    return user && user.role ? user.role : null;
}

function storeUser(user) {
    try {
        localStorage.setItem(USER_KEY, JSON.stringify({email: user.email || "", role: user.role || "viewer"}));
    } catch (e) {}
}

/**
 * Login and store the token plus the user's email/role (from /users/me,
 * which the backend returns for the authenticated user).
 */
export const login = async (email, password) => {
    if (DEMO_MODE) {
        localStorage.setItem("token", "demo-token");
        // Demo DB seeds four role users; honour the email when it matches one.
        const known = {
            "demo@demo.com": "admin",
            "manager@demo.com": "manager",
            "support@demo.com": "support",
            "viewer@demo.com": "viewer",
        };
        storeUser({email, role: known[email] || "admin"});
        return;
    }
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
        // Role comes from /users/me (login response carries no role).
        try {
            const me = await fetch(`${API_BASE_URL}/users/me`, {
                headers: {Authorization: `Bearer ${data.access_token}`},
            });
            if (me.ok) {
                storeUser(await me.json());
            } else {
                storeUser({email, role: "viewer"});
            }
        } catch (e) {
            storeUser({email, role: "viewer"});
        }
    } catch (error) {
        console.error("Login failed:", error);
        throw error;
    }
};

export const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem(USER_KEY);
};

export const isAuthenticated = () => {
    return !!localStorage.getItem("token");
};
