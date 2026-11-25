import {DEMO_MODE} from "../config";

/**
 * Demo backend: an in-browser mock of the real FastAPI API.
 *
 * Active only when the app is built with REACT_APP_DEMO_MODE=true
 * (the GitHub Pages demo). Data lives in localStorage so creates and
 * deletes survive a page reload, and a "Reset demo data" is available
 * via resetDemoData(). Nothing here ever talks to a server.
 */

export {DEMO_MODE};

const STORAGE_KEY = "lmp-demo-db-v1";
const ACCESS_RIGHTS = [
    "create_license",
    "edit_license",
    "delete_license",
    "get_license_info",
    "renew_license",
    "remove_access",
    "add_access",
    "change_access_key",
    "create_temporary_access_key",
];

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isoDaysFromNow = (days) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString();
};

const isoDaysAgo = (days) => {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString();
};

const randomToken = (length) => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let out = "";
    for (let i = 0; i < length; i++) {
        out += chars[Math.floor(Math.random() * chars.length)];
    }
    return out;
};

const randomLicenseKey = () => {
    const group = () =>
        Array.from({length: 4}, () =>
            "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"[Math.floor(Math.random() * 36)]
        ).join("");
    return `LIC-${group()}-${group()}-${group()}`;
};

function seed() {
    const now = new Date().toISOString();
    return {
        users: [
            {id: 1, email: "demo@demo.com", role: "admin", is_active: true, created_at: isoDaysAgo(30)},
            {id: 2, email: "sara@example.com", role: "user", is_active: true, created_at: isoDaysAgo(12)},
            {id: 3, email: "ops@example.com", role: "user", is_active: true, created_at: isoDaysAgo(5)},
        ],
        licenses: [
            {id: 1, key: "LIC-7F3A-9K2M-4Q8D", product: "Acme CRM", owner_email: "acme@example.com", status: "active", expires_at: isoDaysFromNow(200), max_activations: 10, activations: 3, created_at: isoDaysAgo(30), updated_at: isoDaysAgo(2)},
            {id: 2, key: "LIC-2B8E-5T6Y-1W3R", product: "PhotoPro", owner_email: "studio@example.com", status: "active", expires_at: isoDaysFromNow(30), max_activations: 5, activations: 1, created_at: isoDaysAgo(20), updated_at: isoDaysAgo(1)},
            {id: 3, key: "LIC-9D1C-3H7J-8M5K", product: "Acme CRM", owner_email: "acme@example.com", status: "inactive", expires_at: isoDaysAgo(10), max_activations: 10, activations: 0, created_at: isoDaysAgo(45), updated_at: isoDaysAgo(10)},
            {id: 4, key: "LIC-4P6Q-2Z9X-7V1N", product: "InvoiceFlow", owner_email: "billing@example.com", status: "active", expires_at: isoDaysFromNow(365), max_activations: 1, activations: 0, created_at: now, updated_at: now},
            {id: 5, key: "LIC-8M3S-6F4D-2K9P", product: "PhotoPro", owner_email: "studio@example.com", status: "active", expires_at: isoDaysFromNow(120), max_activations: 5, activations: 2, created_at: isoDaysAgo(3), updated_at: isoDaysAgo(3)},
        ],
        apiKeys: [
            {id: 1, key: "lmp_demo_A1b2C3d4E5f6G7h8", access_rights: ["create_license", "get_license_info", "renew_license"], expires_at: isoDaysFromNow(90), associated_ip: null, associated_domain: null, associated_directory: null, single_use: false, consumed: false, created_at: isoDaysAgo(30)},
            {id: 2, key: "lmp_demo_X9y8Z7w6V5u4T3s2", access_rights: ["get_license_info"], expires_at: null, associated_ip: null, associated_domain: null, associated_directory: null, single_use: true, consumed: false, created_at: isoDaysAgo(12)},
            {id: 3, key: "lmp_demo_M4n5B6v7C8x9Z0a1", access_rights: [...ACCESS_RIGHTS], expires_at: isoDaysFromNow(365), associated_ip: null, associated_domain: "example.com", associated_directory: null, single_use: false, consumed: false, created_at: isoDaysAgo(5)},
        ],
        settings: {
            app_version: "1.0.0",
            latest_version: "1.0.0",
            last_updated: new Date().toISOString().slice(0, 10),
            daily_request_limit: "100",
        },
        nextLicenseId: 6,
        nextApiKeyId: 4,
        nextUserId: 4,
    };
}

function loadDb() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && Array.isArray(parsed.licenses)) {
                return parsed;
            }
        }
    } catch (e) {
        // Corrupt demo data: fall through to a fresh seed.
    }
    const fresh = seed();
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
    } catch (e) {
        // Storage unavailable (private mode): keep it in memory only.
    }
    return fresh;
}

let db = loadDb();

function save() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    } catch (e) {
        // Ignore storage failures in demo mode.
    }
}

/** Restore the original sample data (used by the demo's reset affordance). */
export function resetDemoData() {
    db = seed();
    save();
    return db;
}

function fail(status, message) {
    const error = new Error(message);
    error.status = status;
    throw error;
}

function effectiveStatus(license) {
    if (license.expires_at && new Date(license.expires_at) < new Date()) {
        return "expired";
    }
    return license.status;
}

function withEffectiveStatus(license) {
    return {...license, status: effectiveStatus(license)};
}

/**
 * Handle one mock API call. `endpoint` is the path the real frontend
 * would send (e.g. "/licenses?filter=active"). Returns the same JSON
 * shapes the FastAPI backend returns.
 */
export async function mockRequest(method, endpoint, body) {
    // A short pause so the demo feels like a real round trip.
    await delay(250);

    const [path, queryString] = endpoint.split("?");
    const query = new URLSearchParams(queryString || "");
    const parts = path.split("/").filter(Boolean); // e.g. ["licenses", "3"]

    // ---- Auth -------------------------------------------------------------
    if (method === "POST" && path === "/auth/login") {
        return {access_token: "demo-token", token_type: "bearer"};
    }
    if (method === "GET" && path === "/users/me") {
        return {...db.users[0]};
    }

    // ---- Dashboard ----------------------------------------------------------
    if (method === "GET" && path === "/dashboard/summary") {
        const active = db.licenses.filter((l) => effectiveStatus(l) === "active").length;
        return {
            apiKeysCount: db.apiKeys.length,
            usersCount: db.users.length,
            activeLicenses: active,
            inactiveLicenses: db.licenses.length - active,
        };
    }

    // ---- Licenses -----------------------------------------------------------
    if (parts[0] === "licenses") {
        if (method === "GET" && parts.length === 1) {
            const filter = query.get("filter") || "all";
            const now = new Date();
            const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const startOfWeek = new Date(startOfToday);
            startOfWeek.setDate(startOfWeek.getDate() - 6);
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            let list = db.licenses.map(withEffectiveStatus);
            if (filter === "active") list = list.filter((l) => l.status === "active");
            if (filter === "inactive") list = list.filter((l) => l.status !== "active");
            if (filter === "daily") list = list.filter((l) => new Date(l.created_at) >= startOfToday);
            if (filter === "weekly") list = list.filter((l) => new Date(l.created_at) >= startOfWeek);
            if (filter === "monthly") list = list.filter((l) => new Date(l.created_at) >= startOfMonth);
            return list;
        }
        if (method === "POST" && parts.length === 1) {
            if (!body || !body.product) {
                fail(400, "Product name is required");
            }
            const days = Number(body.expires_in_days) || 365;
            const created = {
                id: db.nextLicenseId++,
                key: randomLicenseKey(),
                product: body.product,
                owner_email: body.owner_email || null,
                status: "active",
                expires_at: isoDaysFromNow(days),
                max_activations: Number(body.max_activations) || 1,
                activations: 0,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            };
            db.licenses.unshift(created);
            save();
            return {...created};
        }
        if (parts.length === 2 && /^\d+$/.test(parts[1])) {
            const id = Number(parts[1]);
            const license = db.licenses.find((l) => l.id === id);
            if (!license) fail(404, "License not found");
            if (method === "GET") return withEffectiveStatus(license);
            if (method === "PUT") {
                Object.assign(license, body || {}, {updated_at: new Date().toISOString()});
                save();
                return withEffectiveStatus(license);
            }
            if (method === "DELETE") {
                db.licenses = db.licenses.filter((l) => l.id !== id);
                save();
                return {message: "License deleted"};
            }
        }
        if (method === "POST" && parts.length === 3 && parts[2] === "renew" && /^\d+$/.test(parts[1])) {
            const id = Number(parts[1]);
            const license = db.licenses.find((l) => l.id === id);
            if (!license) fail(404, "License not found");
            const days = Number(body && body.days) || 365;
            const base = license.expires_at && new Date(license.expires_at) > new Date()
                ? new Date(license.expires_at)
                : new Date();
            base.setDate(base.getDate() + days);
            license.expires_at = base.toISOString();
            license.status = "active";
            license.updated_at = new Date().toISOString();
            save();
            return withEffectiveStatus(license);
        }
        if (method === "POST" && parts.length === 2 && parts[1] === "validate") {
            const found = db.licenses.find((l) => l.key === (body && body.key));
            if (!found) return {valid: false, reason: "License not found"};
            const status = effectiveStatus(found);
            return {valid: status === "active", license: withEffectiveStatus(found), reason: status === "active" ? null : `License is ${status}`};
        }
    }

    // ---- API keys -----------------------------------------------------------
    if (parts[0] === "api-keys") {
        if (method === "GET" && parts.length === 1) {
            return {api_keys: db.apiKeys.map((k) => ({...k}))};
        }
        if (method === "GET" && parts.length === 2 && parts[1] === "check-access") {
            return {valid: true, access_rights: ["get_license_info"], message: "Demo key is valid"};
        }
        if (method === "POST" && parts.length === 1) {
            const rights = (body && body.access_rights) || [];
            for (const right of rights) {
                if (!ACCESS_RIGHTS.includes(right)) {
                    fail(400, `Invalid access right: ${right}`);
                }
            }
            const key = (body && body.key) || `lmp_${randomToken(32)}`;
            if (db.apiKeys.some((k) => k.key === key)) {
                fail(400, "API Key already exists");
            }
            const created = {
                id: db.nextApiKeyId++,
                key,
                access_rights: rights,
                expires_at: body && body.expires_in_days ? isoDaysFromNow(Number(body.expires_in_days)) : null,
                associated_ip: (body && body.associated_ip) || null,
                associated_domain: (body && body.associated_domain) || null,
                associated_directory: (body && body.associated_directory) || null,
                single_use: !!(body && body.single_use),
                consumed: false,
                created_at: new Date().toISOString(),
            };
            db.apiKeys.unshift(created);
            save();
            return {...created};
        }
        if (parts.length === 2 && /^\d+$/.test(parts[1])) {
            const id = Number(parts[1]);
            const key = db.apiKeys.find((k) => k.id === id);
            if (!key) fail(404, "API Key not found");
            if (method === "GET") return {...key};
            if (method === "PUT") {
                if (body && body.access_rights) {
                    for (const right of body.access_rights) {
                        if (!ACCESS_RIGHTS.includes(right)) {
                            fail(400, `Invalid access right: ${right}`);
                        }
                    }
                    key.access_rights = body.access_rights;
                }
                if (body && body.expires_in_days != null) {
                    key.expires_at = isoDaysFromNow(Number(body.expires_in_days));
                }
                for (const field of ["associated_ip", "associated_domain", "associated_directory", "single_use"]) {
                    if (body && body[field] !== undefined) key[field] = body[field];
                }
                save();
                return {...key};
            }
            if (method === "DELETE") {
                db.apiKeys = db.apiKeys.filter((k) => k.id !== id);
                save();
                return {message: "API Key deleted"};
            }
        }
    }

    // ---- Users --------------------------------------------------------------
    if (parts[0] === "users") {
        if (method === "GET" && parts.length === 1) {
            return db.users.map((u) => ({...u}));
        }
        if (method === "POST" && parts.length === 1) {
            if (!body || !body.email) fail(400, "Email is required");
            if (!body.password || body.password.length < 8) {
                fail(400, "Password must be at least 8 characters");
            }
            if (db.users.some((u) => u.email === body.email)) {
                fail(400, "User already exists");
            }
            const created = {
                id: db.nextUserId++,
                email: body.email,
                role: body.role || "user",
                is_active: true,
                created_at: new Date().toISOString(),
            };
            db.users.push(created);
            save();
            return {...created};
        }
        if (parts.length === 2 && /^\d+$/.test(parts[1])) {
            const id = Number(parts[1]);
            const user = db.users.find((u) => u.id === id);
            if (!user) fail(404, "User not found");
            if (method === "PUT") {
                Object.assign(user, body || {});
                save();
                return {...user};
            }
            if (method === "DELETE") {
                const admins = db.users.filter((u) => u.role === "admin");
                if (user.role === "admin" && admins.length <= 1) {
                    fail(400, "Cannot delete the last admin");
                }
                db.users = db.users.filter((u) => u.id !== id);
                save();
                return {message: "User deleted"};
            }
        }
    }

    // ---- Settings -----------------------------------------------------------
    if (parts[0] === "settings") {
        if (method === "GET" && parts.length === 1) {
            return {...db.settings};
        }
        if (parts.length === 2) {
            const key = decodeURIComponent(parts[1]);
            if (method === "GET") {
                if (!(key in db.settings)) fail(404, "Setting not found");
                return {key, value: db.settings[key]};
            }
            if (method === "PUT") {
                db.settings[key] = String(body && body.value !== undefined ? body.value : "");
                save();
                return {key, value: db.settings[key]};
            }
        }
    }

    // ---- System -------------------------------------------------------------
    if (method === "GET" && path === "/system/info") {
        return {version: db.settings.app_version, lastUpdated: db.settings.last_updated};
    }
    if (method === "GET" && path === "/system/check-updates") {
        return {updateAvailable: db.settings.latest_version !== db.settings.app_version};
    }
    if (method === "POST" && path === "/system/update") {
        db.settings.app_version = db.settings.latest_version;
        db.settings.last_updated = new Date().toISOString().slice(0, 10);
        save();
        return {message: "System updated successfully", version: db.settings.app_version};
    }

    fail(404, `Demo API has no route ${method} ${path}`);
}
