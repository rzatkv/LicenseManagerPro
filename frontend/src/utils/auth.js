import {API_BASE_URL, DEMO_MODE} from "../config";
import {mockRequest} from "./demoData";

const USER_KEY = "lmp-user";

/** The logged-in user as stored at login: {id, email, role}. The id is
 * what the per-user theme sync (theme.js) keys on. */
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
        localStorage.setItem(USER_KEY, JSON.stringify({id: user.id != null ? user.id : null, email: user.email || "", role: user.role || "viewer"}));
    } catch (e) {}
}

/** Tell the app (theme provider, …) the logged-in user changed, so
 * per-user state (theme) reloads from the backend for the new user. */
function notifyAuthChange() {
    try { window.dispatchEvent(new Event("lmp-auth-change")); } catch (e) {}
}

/**
 * Login and store the token plus the user's email/role (from /users/me,
 * which the backend returns for the authenticated user).
 *
 * @param {object|null} captcha v3.0: captcha payload for the login request
 *   ({captcha_challenge_id, captcha_answer} for custom models, or
 *   {captcha_token} for reCAPTCHA) — verified server-side before the
 *   password is checked. Null when captcha is off.
 * @throws {Error} with `requires2fa` set when the second factor is
 *   pending (tempToken, twofaChannel, demoCode attached).
 */
export const login = async (email, password, captcha) => {
    if (DEMO_MODE) {
        // Demo: go through the mock login so the captcha is actually
        // verified (the mock fails closed on a wrong/missing answer when
        // captcha is on) and 2FA is honoured. No seed user has TOTP on,
        // so the plain demo login still lands straight on the dashboard.
        const data = await mockRequest("POST", "/auth/login", {email, password, ...(captcha || {})});
        if (data.requires_2fa) {
            const err = new Error("Two-factor authentication required");
            err.requires2fa = true;
            err.tempToken = data.temp_token;
            err.twofaChannel = data.twofa_channel;
            err.demoCode = data.demo_code;
            throw err;
        }
        localStorage.setItem("token", data.access_token || "demo-token");
        const me = await mockRequest("GET", "/users/me");
        storeUser({id: me.id, email: me.email || email, role: me.role || "admin"});
        notifyAuthChange();
        return;
    }
    try {
        const response = await fetch(`${API_BASE_URL}/auth/login`, {
            method: "POST", headers: {
                "Content-Type": "application/json",
            }, body: JSON.stringify({email, password, ...(captcha || {})}),
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
                storeUser({id: null, email, role: "viewer"});
            }
        } catch (e) {
            storeUser({id: null, email, role: "viewer"});
        }
        notifyAuthChange();
    } catch (error) {
        console.error("Login failed:", error);
        throw error;
    }
};

export const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem(USER_KEY);
    notifyAuthChange();
};

export const isAuthenticated = () => {
    return !!localStorage.getItem("token");
};
