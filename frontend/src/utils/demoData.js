import {DEMO_MODE} from "../config";

/**
 * Demo backend: an in-browser mock of the real FastAPI API (v2.2).
 *
 * Active only when the app is built with REACT_APP_DEMO_MODE=true
 * (the GitHub Pages demo). Data lives in localStorage so creates and
 * deletes survive a page reload, and a "Reset demo data" is available
 * via resetDemoData(). Nothing here ever talks to a server.
 */

export {DEMO_MODE};

const STORAGE_KEY = "lmp-demo-db-v8";
const MODULES = [
    {id: "whmcs", name: "WHMCS Module", version: "1.0.0", description: "WHMCS server module: provisions, suspends, renews and terminates licenses from WHMCS."},
    {id: "woocommerce", name: "WooCommerce Plugin", version: "1.0.0", description: "WordPress plugin: creates a license when a WooCommerce order completes and shows the key to the customer."},
];
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
export const BILLING_CYCLES = ["monthly", "quarterly", "semiannual", "annual", "biennial", "lifetime"];
export const CYCLE_MONTHS = {monthly: 1, quarterly: 3, semiannual: 6, annual: 12, biennial: 24, lifetime: null};
export const WEBHOOK_EVENTS = ["license.created", "license.renewed", "license.revoked", "license.expiring", "license.expired", "license.validated_failed"];
export const ROLES = ["admin", "manager", "support", "viewer"];

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

// Add whole calendar months (same rule as the backend: Jan 31 + 1 month -> Feb 28).
function addMonths(date, months) {
    const d = new Date(date);
    const day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + months);
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, last));
    return d;
}

function expiryForCycle(cycle, from) {
    const months = CYCLE_MONTHS[cycle];
    if (months == null) return null; // lifetime
    return addMonths(from || new Date(), months).toISOString();
}

const randomToken = (length) => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let out = "";
    for (let i = 0; i < length; i++) {
        out += chars[Math.floor(Math.random() * chars.length)];
    }
    return out;
};

const randomLicenseKey = (product) => {
    // Honour the product's key format (prefix / segments / segment length).
    const segments = (product && product.key_segments) || 4;
    const length = (product && product.key_segment_length) || 4;
    const group = () =>
        Array.from({length}, () =>
            "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"[Math.floor(Math.random() * 36)]
        ).join("");
    const parts = Array.from({length: segments}, group);
    const prefix = product && product.key_prefix ? `${product.key_prefix}-` : "LIC-";
    return prefix + parts.join("-");
};

const splitList = (value) => {
    if (!value) return [];
    if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
    return String(value).split(",").map((v) => v.trim()).filter(Boolean);
};

function seed() {
    const now = new Date().toISOString();
    const productGroups = [
        {id: 1, name: "Server Tools", slug: "server-tools", description: "Control panels and server software.", color: "#7B6CFF", sort_order: 0, created_at: isoDaysAgo(30), updated_at: isoDaysAgo(30)},
        {id: 2, name: "Business Apps", slug: "business-apps", description: "CRM, helpdesk and office tools.", color: "#C1165E", sort_order: 1, created_at: isoDaysAgo(30), updated_at: isoDaysAgo(30)},
    ];
    const products = [
        {id: 1, name: "CloudPanel Pro", slug: "cloudpanel-pro", description: "Server control panel with license management.", price: 49, currency: "USD", status: "active", billing_cycles: ["monthly", "quarterly", "annual", "lifetime"], webhook_url: "https://example.com/hooks/lmp", webhook_events: ["license.created", "license.renewed", "license.expiring"], webhook_secret: "whsec_demo_cloudpanel", group_id: 1, key_prefix: "CPN", key_segments: 4, key_segment_length: 4, max_reissues: 3, created_at: isoDaysAgo(30), updated_at: isoDaysAgo(2)},
        {id: 2, name: "CRM Suite", slug: "crm-suite", description: "Customer relationship management suite.", price: 29, currency: "USD", status: "active", billing_cycles: ["monthly", "semiannual", "annual"], webhook_url: null, webhook_events: [], webhook_secret: null, group_id: 2, key_prefix: null, key_segments: 4, key_segment_length: 4, max_reissues: 0, created_at: isoDaysAgo(20), updated_at: isoDaysAgo(5)},
        {id: 3, name: "HelpDesk", slug: "helpdesk", description: "Support ticket system for small teams.", price: 19, currency: "USD", status: "active", billing_cycles: ["monthly", "annual", "biennial"], webhook_url: null, webhook_events: [], webhook_secret: null, group_id: 1, key_prefix: "HDK", key_segments: 3, key_segment_length: 4, max_reissues: 1, created_at: isoDaysAgo(12), updated_at: isoDaysAgo(1)},
    ];
    const lic = (id, productId, product, owner, status, expires, created, extra) => ({
        id, key: randomLicenseKey(products.find((p) => p.id === productId)), product, product_id: productId,
        billing_cycle: productId === 1 ? "annual" : productId === 2 ? "monthly" : "annual",
        owner_email: owner, status, expires_at: expires, max_activations: 5, activations: 1,
        allowed_domains: [], allowed_ips: [], install_path: null, reissue_count: 0,
        created_at: created, updated_at: created, ...(extra || {}),
    });
    return {
        users: [
            {id: 1, email: "demo@demo.com", role: "admin", is_active: true, created_at: isoDaysAgo(30)},
            {id: 2, email: "manager@demo.com", role: "manager", is_active: true, created_at: isoDaysAgo(12)},
            {id: 3, email: "support@demo.com", role: "support", is_active: true, created_at: isoDaysAgo(5)},
            {id: 4, email: "viewer@demo.com", role: "viewer", is_active: true, created_at: isoDaysAgo(3)},
        ],
        currentUserId: 1,
        products,
        licenses: [
            lic(1, 1, "CloudPanel Pro", "acme@example.com", "active", isoDaysFromNow(200), isoDaysAgo(30), {billing_cycle: "annual", allowed_domains: ["acme.example.com"], activations: 3, max_activations: 10}),
            lic(2, 1, "CloudPanel Pro", "studio@example.com", "active", isoDaysFromNow(30), isoDaysAgo(20), {billing_cycle: "quarterly", allowed_domains: ["studio.example.com"], allowed_ips: ["203.0.113.10"]}),
            lic(3, 2, "CRM Suite", "acme@example.com", "inactive", isoDaysAgo(10), isoDaysAgo(45), {billing_cycle: "monthly"}),
            lic(4, 3, "HelpDesk", "billing@example.com", "active", isoDaysFromNow(365), now, {billing_cycle: "annual", install_path: "/var/www/html"}),
            lic(5, 2, "CRM Suite", "studio@example.com", "active", isoDaysFromNow(120), isoDaysAgo(3), {billing_cycle: "semiannual", activations: 2}),
            lic(6, 1, "CloudPanel Pro", "ops@example.com", "active", null, isoDaysAgo(10), {billing_cycle: "lifetime", activations: 0}),
            lic(7, 3, "HelpDesk", "help@example.com", "active", isoDaysFromNow(15), isoDaysAgo(2), {billing_cycle: "monthly", allowed_domains: ["help.example.com"]}),
            lic(8, 2, "CRM Suite", "sales@example.com", "active", isoDaysFromNow(60), isoDaysAgo(1), {billing_cycle: "annual"}),
        ],
        apiKeys: [
            {id: 1, key: "lmp_demo_A1b2C3d4E5f6G7h8", access_rights: ["create_license", "get_license_info", "renew_license"], expires_at: isoDaysFromNow(90), associated_ip: null, associated_domain: null, associated_directory: null, single_use: false, consumed: false, created_at: isoDaysAgo(30)},
            {id: 2, key: "lmp_demo_X9y8Z7w6V5u4T3s2", access_rights: ["get_license_info"], expires_at: null, associated_ip: null, associated_domain: null, associated_directory: null, single_use: true, consumed: false, created_at: isoDaysAgo(12)},
            {id: 3, key: "lmp_demo_M4n5B6v7C8x9Z0a1", access_rights: [...ACCESS_RIGHTS], expires_at: isoDaysFromNow(365), associated_ip: null, associated_domain: "example.com", associated_directory: null, single_use: false, consumed: false, created_at: isoDaysAgo(5)},
        ],
        languages: [
            {code: "en", name: "English", builtin: true, translations: {}},
            {code: "fa", name: "فارسی", builtin: true, translations: {}},
            {code: "de", name: "Deutsch (sample)", builtin: false, translations: {
                "common.appName": "License Manager Pro",
                "nav.dashboard": "Dashboard",
                "nav.products": "Produkte",
                "nav.licenses": "Lizenzen",
                "nav.apiKeys": "API-Schlüssel",
                "nav.users": "Benutzer",
                "nav.settings": "Einstellungen",
                "nav.about": "Über",
                "common.save": "Speichern",
                "common.cancel": "Abbrechen",
                "common.delete": "Löschen",
                "login.title": "Anmelden",
                "login.button": "Anmelden",
            }},
        ],
        deliveries: [
            {id: 1, product_id: 1, event: "license.created", url: "https://example.com/hooks/lmp", status_code: 200, success: true, created_at: isoDaysAgo(1)},
            {id: 2, product_id: 1, event: "license.renewed", url: "https://example.com/hooks/lmp", status_code: 200, success: true, created_at: isoDaysAgo(2)},
        ],
        settings: {
            app_version: "2.2.2",
            latest_version: "2.2.2",
            last_updated: new Date().toISOString().slice(0, 10),
            daily_request_limit: "100",
            site_name: "License Manager Pro",
            logo_url: "./logo.svg",
        },
        product_groups: productGroups,
        notifications: [
            {id: 1, user_id: null, title: "Welcome to v2.2", message: "Download the real WHMCS and WooCommerce modules from the Downloads page.", type: "info", link: "/downloads", is_read: false, created_at: isoDaysAgo(1)},
            {id: 2, user_id: null, title: "License expiring soon", message: "License LIC-XXXX-XXXX-XXXX (HelpDesk) expires in 15 days.", type: "warning", link: "/licenses", is_read: false, created_at: isoDaysAgo(1)},
            {id: 3, user_id: null, title: "License created", message: "A new CRM Suite license was created for sales@example.com.", type: "success", link: "/licenses", is_read: true, created_at: isoDaysAgo(2)},
        ],
        blacklist: [],
        activations: [
            {id: 1, license_id: 1, fingerprint: "fp-demo-acme-01", label: "acme-web-01", created_at: isoDaysAgo(10)},
        ],
        audit_logs: [
            {id: 1, actor_email: "demo@demo.com", action: "license.create", entity: "license", entity_id: 8, details: {key: "LIC-XXXX-XXXX-XXXX", product: "CRM Suite"}, created_at: isoDaysAgo(1)},
            {id: 2, actor_email: "manager@demo.com", action: "product.update", entity: "product", entity_id: 1, details: {name: "CloudPanel Pro"}, created_at: isoDaysAgo(2)},
            {id: 3, actor_email: "demo@demo.com", action: "user.create", entity: "user", entity_id: 4, details: {email: "viewer@demo.com", role: "viewer"}, created_at: isoDaysAgo(3)},
            {id: 4, actor_email: "support@demo.com", action: "license.renew", entity: "license", entity_id: 7, details: {billing_cycle: "monthly"}, created_at: isoDaysAgo(2)},
            {id: 5, actor_email: "demo@demo.com", action: "api_key.create", entity: "api_key", entity_id: 3, details: {access_rights: ["get_license_info"]}, created_at: isoDaysAgo(5)},
        ],
        nextLicenseId: 9,
        nextApiKeyId: 4,
        nextUserId: 5,
        nextProductId: 4,
        nextDeliveryId: 3,
        nextAuditLogId: 6,
        nextGroupId: 3,
        nextNotificationId: 4,
        nextBlacklistId: 1,
        nextActivationId: 2,
    };
}

function loadDb() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && Array.isArray(parsed.licenses)) {
                const fresh = seed();
                // Migrate a v2-shaped DB forward if it ever lands under v3 key.
                if (!parsed.audit_logs) {
                    parsed.audit_logs = fresh.audit_logs;
                    parsed.nextAuditLogId = fresh.nextAuditLogId;
                }
                if (!parsed.products) {
                    parsed.products = fresh.products;
                    parsed.languages = fresh.languages;
                    parsed.deliveries = fresh.deliveries;
                    parsed.nextProductId = fresh.nextProductId;
                    parsed.nextDeliveryId = fresh.nextDeliveryId;
                    parsed.currentUserId = parsed.currentUserId || 1;
                }
                // v2.2 collections: backfill when a pre-v2.2 DB is loaded.
                if (!parsed.product_groups) { parsed.product_groups = fresh.product_groups; parsed.nextGroupId = fresh.nextGroupId; }
                if (!parsed.notifications) { parsed.notifications = fresh.notifications; parsed.nextNotificationId = fresh.nextNotificationId; }
                if (!parsed.blacklist) { parsed.blacklist = []; parsed.nextBlacklistId = 1; }
                if (!parsed.activations) { parsed.activations = []; parsed.nextActivationId = 1; }
                if (!parsed.settings.site_name) parsed.settings.site_name = "License Manager Pro";
                if (!parsed.settings.logo_url) parsed.settings.logo_url = "./logo.svg";
                return parsed;
            }
        }
    } catch (e) {}
    const fresh = seed();
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
    } catch (e) {}
    return fresh;
}

let db = loadDb();

function save() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    } catch (e) {}
}

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

function currentUser() {
    return db.users.find((u) => u.id === db.currentUserId) || db.users[0];
}

// Role enforcement mirroring the backend: viewer is read-only, support
// cannot delete or manage products/users/settings, manager cannot manage users.
function requireRole(allowed) {
    const role = currentUser().role;
    if (!allowed.includes(role)) {
        fail(403, `Role '${role}' is not allowed to perform this action`);
    }
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

function recordDelivery(productId, event, url) {
    const delivery = {
        id: db.nextDeliveryId++,
        product_id: productId,
        event,
        url: url || null,
        status_code: 200,
        success: true,
        created_at: new Date().toISOString(),
    };
    db.deliveries.unshift(delivery);
    return delivery;
}

// Audit log: newest first. Appended on every mock mutation (license /
// product / user / api-key create/update/delete, settings changes).
function logAudit(action, entity, entityId, details) {
    if (!Array.isArray(db.audit_logs)) db.audit_logs = [];
    if (!db.nextAuditLogId) db.nextAuditLogId = db.audit_logs.length + 1;
    const user = currentUser();
    db.audit_logs.unshift({
        id: db.nextAuditLogId++,
        actor_email: user ? user.email : "system",
        action,
        entity,
        entity_id: entityId,
        details: details || null,
        created_at: new Date().toISOString(),
    });
}

// Notification helper (mirrors the backend notify() service): broadcast
// (user_id null) reaches every admin; a user_id targets one user.
function notify(title, message, type, link, userId) {
    if (!Array.isArray(db.notifications)) db.notifications = [];
    if (!db.nextNotificationId) db.nextNotificationId = db.notifications.length + 1;
    db.notifications.unshift({
        id: db.nextNotificationId++,
        user_id: userId == null ? null : userId,
        title,
        message,
        type: type || "info",
        link: link || null,
        is_read: false,
        created_at: new Date().toISOString(),
    });
}

// Blacklist matching (mirrors the backend): domain exact-or-subdomain,
// IP exact-or-CIDR.
function isBlacklisted(ip, domain) {
    const list = db.blacklist || [];
    for (const entry of list) {
        if (entry.type === "domain" && domain) {
            const d = domain.toLowerCase();
            const v = entry.value.toLowerCase();
            if (d === v || d.endsWith(`.${v}`)) return true;
        }
        if (entry.type === "ip" && ip) {
            if (entry.value === ip) return true;
            const m = entry.value.match(/^(\d+\.\d+\.\d+\.\d+)\/(\d+)$/);
            if (m) {
                const bits = Number(m[2]);
                const toInt = (s) => s.split(".").reduce((a, o) => (a << 8) + Number(o), 0) >>> 0;
                const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
                if ((toInt(ip) & mask) === (toInt(m[1]) & mask)) return true;
            }
        }
    }
    return false;
}

// Estimated MRR (mirrors the backend): sum over active licenses of their
// product's price normalized to monthly by billing cycle.
function estimatedMrr() {
    const months = {monthly: 1, quarterly: 3, semiannual: 6, annual: 12, biennial: 24, lifetime: 0};
    let total = 0;
    for (const lic of db.licenses) {
        if (effectiveStatus(lic) !== "active") continue;
        const product = db.products.find((p) => p.id === lic.product_id);
        if (!product || !product.price) continue;
        const m = months[lic.billing_cycle] || 0;
        if (m > 0) total += product.price / m;
    }
    return Math.round(total * 100) / 100;
}

// ?skip&limit pagination shared by the list endpoints. When neither param
// is present the full list is returned (backward compat for get()).
// When present, returns {items, total} like the real API's X-Total-Count.
function paginate(list, query) {
    const skipRaw = query.get("skip");
    const limitRaw = query.get("limit");
    if (skipRaw == null && limitRaw == null) return list;
    const skip = Math.max(0, Number(skipRaw) || 0);
    const limit = limitRaw != null ? Math.max(0, Number(limitRaw) || 0) : list.length;
    return {items: list.slice(skip, skip + limit), total: list.length};
}

export async function mockRequest(method, endpoint, body) {
    await delay(250);

    const [path, queryString] = endpoint.split("?");
    const query = new URLSearchParams(queryString || "");
    const parts = path.split("/").filter(Boolean);

    // ---- Auth -------------------------------------------------------------
    if (method === "POST" && path === "/auth/login") {
        const match = db.users.find((u) => u.email === (body && body.email));
        db.currentUserId = match ? match.id : 1;
        save();
        return {access_token: "demo-token", token_type: "bearer"};
    }
    if (method === "GET" && path === "/users/me") {
        return {...currentUser()};
    }

    // ---- Dashboard ----------------------------------------------------------
    if (method === "GET" && path === "/dashboard/summary") {
        const active = db.licenses.filter((l) => effectiveStatus(l) === "active").length;
        return {
            apiKeysCount: db.apiKeys.length,
            usersCount: db.users.length,
            activeLicenses: active,
            inactiveLicenses: db.licenses.length - active,
            estimated_mrr: estimatedMrr(),
        };
    }
    if (method === "GET" && path === "/dashboard/license-trend") {
        const days = Math.min(90, Math.max(1, Number(query.get("days")) || 14));
        const points = [];
        const today = new Date();
        for (let i = days - 1; i >= 0; i--) {
            const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
            const next = new Date(d);
            next.setDate(next.getDate() + 1);
            const count = db.licenses.filter((l) => {
                const c = new Date(l.created_at);
                return c >= d && c < next;
            }).length;
            points.push({date: d.toISOString().slice(0, 10), count});
        }
        return {points};
    }

    // ---- Products -----------------------------------------------------------
    if (parts[0] === "products") {
        if (method === "GET" && parts.length === 1) {
            let list = db.products.map((p) => ({
                ...p,
                license_count: db.licenses.filter((l) => l.product_id === p.id).length,
            }));
            const groupId = query.get("group_id");
            if (groupId != null) list = list.filter((p) => String(p.group_id) === String(groupId));
            const slug = query.get("slug");
            if (slug != null) list = list.filter((p) => p.slug === slug);
            return paginate(list, query);
        }
        if (method === "POST" && parts.length === 1) {
            requireRole(["admin", "manager"]);
            if (!body || !body.name) fail(400, "Product name is required");
            const cycles = (body.billing_cycles || []).filter((c) => BILLING_CYCLES.includes(c));
            const created = {
                id: db.nextProductId++,
                name: body.name,
                slug: body.slug || body.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
                description: body.description || null,
                price: Number(body.price) || 0,
                currency: body.currency || "USD",
                status: body.status || "active",
                billing_cycles: cycles,
                webhook_url: body.webhook_url || null,
                webhook_events: (body.webhook_events || []).filter((e) => WEBHOOK_EVENTS.includes(e)),
                webhook_secret: body.webhook_secret || null,
                group_id: body.group_id != null ? Number(body.group_id) : null,
                key_prefix: body.key_prefix || null,
                key_segments: Number(body.key_segments) || 4,
                key_segment_length: Number(body.key_segment_length) || 4,
                max_reissues: Number(body.max_reissues) || 0,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            };
            db.products.push(created);
            logAudit("product.create", "product", created.id, {name: created.name});
            save();
            return {...created, license_count: 0};
        }
        if (parts.length === 3 && parts[2] === "test-webhook" && /^\d+$/.test(parts[1])) {
            requireRole(["admin", "manager"]);
            const product = db.products.find((p) => p.id === Number(parts[1]));
            if (!product) fail(404, "Product not found");
            if (!product.webhook_url) fail(400, "Product has no webhook URL configured");
            recordDelivery(product.id, "license.created", product.webhook_url);
            save();
            return {success: true, status_code: 200};
        }
        if (parts.length === 2 && /^\d+$/.test(parts[1])) {
            const id = Number(parts[1]);
            const product = db.products.find((p) => p.id === id);
            if (!product) fail(404, "Product not found");
            if (method === "GET") {
                return {...product, license_count: db.licenses.filter((l) => l.product_id === id).length};
            }
            if (method === "PUT") {
                requireRole(["admin", "manager"]);
                Object.assign(product, body || {}, {updated_at: new Date().toISOString()});
                if (body && body.billing_cycles) {
                    product.billing_cycles = body.billing_cycles.filter((c) => BILLING_CYCLES.includes(c));
                }
                logAudit("product.update", "product", id, {name: product.name});
                save();
                return {...product, license_count: db.licenses.filter((l) => l.product_id === id).length};
            }
            if (method === "DELETE") {
                requireRole(["admin", "manager"]);
                if (db.licenses.some((l) => l.product_id === id)) {
                    fail(400, "Cannot delete product: licenses still reference this product");
                }
                db.products = db.products.filter((p) => p.id !== id);
                logAudit("product.delete", "product", id, {name: product.name});
                save();
                return {message: "Product deleted"};
            }
        }
    }

    // ---- Product groups -----------------------------------------------------
    if (parts[0] === "product-groups") {
        if (method === "GET" && parts.length === 1) {
            return paginate([...db.product_groups].sort((a, b) => (a.sort_order - b.sort_order) || a.id - b.id), query);
        }
        if (method === "POST" && parts.length === 1) {
            requireRole(["admin", "manager"]);
            if (!body || !body.name) fail(400, "Group name is required");
            const slug = body.slug || body.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
            if (db.product_groups.some((g) => g.slug === slug)) fail(400, "Group slug already exists");
            if (body.color && !/^#[0-9a-fA-F]{6}$/.test(body.color)) fail(400, "color must be a #RRGGBB hex value");
            const created = {
                id: db.nextGroupId++,
                name: body.name,
                slug,
                description: body.description || null,
                color: body.color || "#7B6CFF",
                sort_order: Number(body.sort_order) || 0,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            };
            db.product_groups.push(created);
            save();
            return {...created};
        }
        if (parts.length === 2 && /^\d+$/.test(parts[1])) {
            const id = Number(parts[1]);
            const group = db.product_groups.find((g) => g.id === id);
            if (!group) fail(404, "Product group not found");
            if (method === "GET") return {...group};
            if (method === "PUT") {
                requireRole(["admin", "manager"]);
                if (body && body.slug && body.slug !== group.slug && db.product_groups.some((g) => g.slug === body.slug)) {
                    fail(400, "Group slug already exists");
                }
                Object.assign(group, body || {}, {updated_at: new Date().toISOString()});
                save();
                return {...group};
            }
            if (method === "DELETE") {
                requireRole(["admin", "manager"]);
                if (db.products.some((p) => p.group_id === id)) {
                    fail(400, "Cannot delete group: products still belong to this group");
                }
                db.product_groups = db.product_groups.filter((g) => g.id !== id);
                save();
                return {message: "Product group deleted"};
            }
        }
    }

    // ---- Blacklist ----------------------------------------------------------
    if (parts[0] === "blacklist") {
        if (method === "GET" && parts.length === 1) {
            requireRole(["admin"]);
            let list = [...db.blacklist];
            const type = query.get("type");
            if (type) list = list.filter((e) => e.type === type);
            return paginate(list, query);
        }
        if (method === "POST" && parts.length === 1) {
            requireRole(["admin"]);
            if (!body || !["ip", "domain"].includes(body.type)) fail(400, "type must be 'ip' or 'domain'");
            if (!body.value) fail(400, "value is required");
            if (db.blacklist.some((e) => e.type === body.type && e.value === body.value)) {
                fail(400, "This value is already blacklisted");
            }
            if (body.type === "ip" && !/^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/.test(body.value)) {
                fail(400, "Invalid IP address or CIDR");
            }
            if (body.type === "domain" && !body.value.includes(".")) {
                fail(400, "Domain must contain a dot");
            }
            const created = {
                id: db.nextBlacklistId++,
                type: body.type,
                value: body.value,
                reason: body.reason || null,
                created_at: new Date().toISOString(),
                created_by: currentUser() ? currentUser().email : null,
            };
            db.blacklist.push(created);
            save();
            return {...created};
        }
        if (parts.length === 2 && /^\d+$/.test(parts[1]) && method === "DELETE") {
            requireRole(["admin"]);
            const id = Number(parts[1]);
            if (!db.blacklist.some((e) => e.id === id)) fail(404, "Blacklist entry not found");
            db.blacklist = db.blacklist.filter((e) => e.id !== id);
            save();
            return {message: "Blacklist entry deleted"};
        }
    }

    // ---- Notifications ------------------------------------------------------
    if (parts[0] === "notifications") {
        const user = currentUser();
        const visible = (db.notifications || []).filter(
            (n) => user.role === "admin" || n.user_id === null || n.user_id === user.id
        );
        if (method === "GET" && parts.length === 1) {
            const sorted = [...visible].sort((a, b) => (a.is_read - b.is_read) || (new Date(b.created_at) - new Date(a.created_at)));
            const paged = paginate(sorted, query);
            if (Array.isArray(paged)) {
                return {notifications: paged, total: paged.length, unread: paged.filter((n) => !n.is_read).length};
            }
            return {notifications: paged.items, total: paged.total, unread: sorted.filter((n) => !n.is_read).length};
        }
        if (method === "POST" && parts.length === 2 && parts[1] === "read-all") {
            let count = 0;
            for (const n of visible) {
                if (!n.is_read) { n.is_read = true; count += 1; }
            }
            save();
            return {message: `${count} notification(s) marked as read`};
        }
        if (method === "POST" && parts.length === 3 && parts[2] === "read" && /^\d+$/.test(parts[1])) {
            const id = Number(parts[1]);
            const note = visible.find((n) => n.id === id);
            if (!note) fail(404, "Notification not found");
            note.is_read = true;
            save();
            return {...note};
        }
    }

    // ---- Downloads ----------------------------------------------------------
    if (parts[0] === "downloads") {
        if (method === "GET" && parts.length === 1) {
            return MODULES.map((m) => ({...m, updated_at: db.settings.last_updated}));
        }
        if (method === "GET" && parts.length === 2 && parts[1] === "versions") {
            const out = {};
            for (const m of MODULES) {
                out[m.id] = {local: m.version, latest: m.version, update_available: false};
            }
            return out;
        }
        if (method === "GET" && parts.length === 2) {
            // The in-browser mock cannot build a ZIP; the Downloads page
            // links to the GitHub releases page in demo mode instead.
            fail(404, "Download available in the self-hosted app");
        }
    }

    // ---- Webhook deliveries -------------------------------------------------
    if (parts[0] === "webhooks" && parts[1] === "deliveries" && method === "GET") {
        const productId = query.get("product_id");
        const limit = Number(query.get("limit")) || 50;
        let list = [...db.deliveries];
        if (productId) list = list.filter((d) => d.product_id === Number(productId));
        return list.slice(0, limit);
    }

    // ---- Licenses -----------------------------------------------------------
    if (parts[0] === "licenses") {
        if (method === "GET" && parts.length === 1) {
            const filter = query.get("filter") || "all";
            const productFilter = query.get("product");
            const now = new Date();
            const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const startOfWeek = new Date(startOfToday);
            startOfWeek.setDate(startOfWeek.getDate() - 6);
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            let list = db.licenses.map(withEffectiveStatus);
            if (productFilter) list = list.filter((l) => String(l.product_id) === String(productFilter));
            if (filter === "active") list = list.filter((l) => l.status === "active");
            if (filter === "inactive") list = list.filter((l) => l.status !== "active");
            if (filter === "daily") list = list.filter((l) => new Date(l.created_at) >= startOfToday);
            if (filter === "weekly") list = list.filter((l) => new Date(l.created_at) >= startOfWeek);
            if (filter === "monthly") list = list.filter((l) => new Date(l.created_at) >= startOfMonth);
            return paginate(list, query);
        }
        if (method === "POST" && parts.length === 1) {
            requireRole(["admin", "manager", "support"]);
            const productId = body && body.product_id ? Number(body.product_id) : null;
            let product = null;
            let expiresAt = null;
            let cycle = (body && body.billing_cycle) || null;
            if (productId) {
                product = db.products.find((p) => p.id === productId);
                if (!product) fail(400, "Product not found");
                if (!cycle || !product.billing_cycles.includes(cycle)) {
                    fail(400, "billing_cycle must be one of the product's billing cycles");
                }
                expiresAt = expiryForCycle(cycle, new Date());
            } else {
                if (!body || !body.product) fail(400, "Product name is required");
                const days = Number(body.expires_in_days) || 365;
                expiresAt = isoDaysFromNow(days);
            }
            const created = {
                id: db.nextLicenseId++,
                key: (body && body.key) || randomLicenseKey(product),
                product: product ? product.name : body.product,
                product_id: productId,
                billing_cycle: cycle,
                owner_email: (body && body.owner_email) || null,
                status: "active",
                expires_at: expiresAt,
                max_activations: Number(body && body.max_activations) || 1,
                activations: 0,
                allowed_domains: splitList(body && body.allowed_domains),
                allowed_ips: splitList(body && body.allowed_ips),
                install_path: (body && body.install_path) || null,
                reissue_count: 0,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            };
            db.licenses.unshift(created);
            logAudit("license.create", "license", created.id, {product: created.product, owner_email: created.owner_email});
            notify("License created", `License ${created.key} (${created.product}) was created.`, "success", "/licenses");
            if (product && product.webhook_url) recordDelivery(product.id, "license.created", product.webhook_url);
            save();
            return {...created};
        }
        if (parts.length === 2 && /^\d+$/.test(parts[1])) {
            const id = Number(parts[1]);
            const license = db.licenses.find((l) => l.id === id);
            if (!license) fail(404, "License not found");
            if (method === "GET") return withEffectiveStatus(license);
            if (method === "PUT") {
                requireRole(["admin", "manager", "support"]);
                const updates = {...(body || {})};
                if (updates.allowed_domains !== undefined) updates.allowed_domains = splitList(updates.allowed_domains);
                if (updates.allowed_ips !== undefined) updates.allowed_ips = splitList(updates.allowed_ips);
                Object.assign(license, updates, {updated_at: new Date().toISOString()});
                logAudit("license.update", "license", id, {product: license.product});
                save();
                return withEffectiveStatus(license);
            }
            if (method === "DELETE") {
                requireRole(["admin", "manager"]);
                db.licenses = db.licenses.filter((l) => l.id !== id);
                logAudit("license.delete", "license", id, {product: license.product});
                save();
                return {message: "License deleted"};
            }
        }
        if (method === "POST" && parts.length === 3 && parts[2] === "renew" && /^\d+$/.test(parts[1])) {
            requireRole(["admin", "manager", "support"]);
            const id = Number(parts[1]);
            const license = db.licenses.find((l) => l.id === id);
            if (!license) fail(404, "License not found");
            const base = license.expires_at && new Date(license.expires_at) > new Date()
                ? new Date(license.expires_at)
                : new Date();
            if (body && body.extend_days != null) {
                base.setDate(base.getDate() + Number(body.extend_days));
            } else if (license.billing_cycle) {
                const months = CYCLE_MONTHS[license.billing_cycle];
                if (months == null) fail(400, "Lifetime licenses do not expire and cannot be renewed");
                license.expires_at = addMonths(base, months).toISOString();
                license.status = "active";
                license.updated_at = new Date().toISOString();
                logAudit("license.renew", "license", id, {billing_cycle: license.billing_cycle});
                save();
                return withEffectiveStatus(license);
            } else {
                base.setDate(base.getDate() + 365);
            }
            license.expires_at = base.toISOString();
            license.status = "active";
            license.updated_at = new Date().toISOString();
            logAudit("license.renew", "license", id, {billing_cycle: license.billing_cycle});
            save();
            return withEffectiveStatus(license);
        }
        if (method === "POST" && parts.length === 3 && parts[2] === "reissue" && /^\d+$/.test(parts[1])) {
            requireRole(["admin", "manager", "support"]);
            const id = Number(parts[1]);
            const license = db.licenses.find((l) => l.id === id);
            if (!license) fail(404, "License not found");
            const product = license.product_id ? db.products.find((p) => p.id === license.product_id) : null;
            const maxReissues = product ? (product.max_reissues || 0) : 0;
            if ((license.reissue_count || 0) >= maxReissues) {
                fail(400, "This license has reached its maximum number of reissues");
            }
            license.key = randomLicenseKey(product);
            license.reissue_count = (license.reissue_count || 0) + 1;
            license.updated_at = new Date().toISOString();
            logAudit("license.reissue", "license", id, {product: license.product});
            notify("License reissued", `License ${license.key} (${license.product}) was reissued.`, "info", "/licenses");
            save();
            return withEffectiveStatus(license);
        }
        if (parts.length === 3 && parts[2] === "activations" && /^\d+$/.test(parts[1])) {
            const licenseId = Number(parts[1]);
            const license = db.licenses.find((l) => l.id === licenseId);
            if (!license) fail(404, "License not found");
            if (method === "GET") {
                return (db.activations || []).filter((a) => a.license_id === licenseId);
            }
            if (method === "POST") {
                requireRole(["admin", "manager", "support"]);
                const fp = body && body.fingerprint;
                if (!fp) fail(400, "fingerprint is required");
                const existing = (db.activations || []).find((a) => a.license_id === licenseId && a.fingerprint === fp);
                if (existing) return {...existing};
                const count = (db.activations || []).filter((a) => a.license_id === licenseId).length;
                if (count >= (license.max_activations || 1)) fail(400, "Maximum activations reached for this license");
                const created = {
                    id: db.nextActivationId++,
                    license_id: licenseId,
                    fingerprint: fp,
                    label: (body && body.label) || null,
                    created_at: new Date().toISOString(),
                };
                db.activations.push(created);
                license.activations = count + 1;
                save();
                return {...created};
            }
        }
        if (method === "DELETE" && parts.length === 4 && parts[2] === "activations" && /^\d+$/.test(parts[1]) && /^\d+$/.test(parts[3])) {
            requireRole(["admin", "manager", "support"]);
            const licenseId = Number(parts[1]);
            const activationId = Number(parts[3]);
            const found = (db.activations || []).find((a) => a.id === activationId && a.license_id === licenseId);
            if (!found) fail(404, "Activation not found");
            db.activations = db.activations.filter((a) => a.id !== activationId);
            const license = db.licenses.find((l) => l.id === licenseId);
            if (license) license.activations = Math.max(0, (license.activations || 1) - 1);
            save();
            return {message: "Activation removed"};
        }
        if (method === "POST" && parts.length === 2 && parts[1] === "validate") {
            const found = db.licenses.find((l) => l.key === (body && body.key));
            if (!found) return {valid: false, detail: "License key not found", reason: "License key not found", license: null};
            if (isBlacklisted(body && body.ip, body && body.domain)) {
                return {valid: false, detail: "blocked: blacklisted", reason: "blocked: blacklisted", license: withEffectiveStatus(found)};
            }
            const failWith = (reason) => {
                const product = found.product_id ? db.products.find((p) => p.id === found.product_id) : null;
                if (product && product.webhook_url) recordDelivery(product.id, "license.validated_failed", product.webhook_url);
                save();
                return {valid: false, detail: reason, reason, license: withEffectiveStatus(found)};
            };
            const status = effectiveStatus(found);
            if (status !== "active") return failWith(`License is ${status}`);
            if (body && body.domain && found.allowed_domains && found.allowed_domains.length && !found.allowed_domains.includes(body.domain)) {
                return failWith(`Domain ${body.domain} is not allowed for this license`);
            }
            if (body && body.ip && found.allowed_ips && found.allowed_ips.length && !found.allowed_ips.includes(body.ip)) {
                return failWith(`IP ${body.ip} is not allowed for this license`);
            }
            if (body && body.install_path && found.install_path && found.install_path !== body.install_path) {
                return failWith(`Install path ${body.install_path} does not match this license`);
            }
            return {valid: true, detail: "License is valid", reason: "License is valid", license: withEffectiveStatus(found)};
        }
    }

    // ---- API keys -----------------------------------------------------------
    if (parts[0] === "api-keys") {
        if (method === "GET" && parts.length === 1) {
            const paged = paginate(db.apiKeys.map((k) => ({...k})), query);
            if (Array.isArray(paged)) return {api_keys: paged};
            return {api_keys: paged.items, total: paged.total};
        }
        if (method === "GET" && parts.length === 2 && parts[1] === "check-access") {
            const domain = query.get("domain");
            if (isBlacklisted(null, domain)) {
                fail(403, "blocked: blacklisted");
            }
            return {valid: true, access_rights: ["get_license_info"], message: "Demo key is valid"};
        }
        if (method === "POST" && parts.length === 1) {
            requireRole(["admin", "manager", "support"]);
            const rights = (body && body.access_rights) || [];
            for (const right of rights) {
                if (!ACCESS_RIGHTS.includes(right)) fail(400, `Invalid access right: ${right}`);
            }
            const key = (body && body.key) || `lmp_${randomToken(32)}`;
            if (db.apiKeys.some((k) => k.key === key)) fail(400, "API Key already exists");
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
            logAudit("api_key.create", "api_key", created.id, {access_rights: created.access_rights});
            save();
            return {...created};
        }
        if (parts.length === 2 && /^\d+$/.test(parts[1])) {
            const id = Number(parts[1]);
            const key = db.apiKeys.find((k) => k.id === id);
            if (!key) fail(404, "API Key not found");
            if (method === "GET") return {...key};
            if (method === "PUT") {
                requireRole(["admin", "manager", "support"]);
                if (body && body.access_rights) {
                    for (const right of body.access_rights) {
                        if (!ACCESS_RIGHTS.includes(right)) fail(400, `Invalid access right: ${right}`);
                    }
                    key.access_rights = body.access_rights;
                }
                if (body && body.expires_in_days != null) key.expires_at = isoDaysFromNow(Number(body.expires_in_days));
                for (const field of ["associated_ip", "associated_domain", "associated_directory", "single_use"]) {
                    if (body && body[field] !== undefined) key[field] = body[field];
                }
                logAudit("api_key.update", "api_key", id, null);
                save();
                return {...key};
            }
            if (method === "DELETE") {
                requireRole(["admin", "manager"]);
                db.apiKeys = db.apiKeys.filter((k) => k.id !== id);
                logAudit("api_key.delete", "api_key", id, null);
                save();
                return {message: "API Key deleted"};
            }
        }
    }

    // ---- Users --------------------------------------------------------------
    if (parts[0] === "users") {
        if (method === "GET" && parts.length === 1) {
            return paginate(db.users.map((u) => ({...u})), query);
        }
        if (method === "POST" && parts.length === 1) {
            requireRole(["admin"]);
            if (!body || !body.email) fail(400, "Email is required");
            if (!body.password || body.password.length < 8) fail(400, "Password must be at least 8 characters");
            if (!ROLES.includes(body.role || "viewer")) fail(400, `Invalid role: ${body.role}`);
            if (db.users.some((u) => u.email === body.email)) fail(400, "User already exists");
            const created = {
                id: db.nextUserId++,
                email: body.email,
                role: body.role || "viewer",
                is_active: true,
                created_at: new Date().toISOString(),
            };
            db.users.push(created);
            logAudit("user.create", "user", created.id, {email: created.email, role: created.role});
            notify("User created", `User ${created.email} (${created.role}) was created.`, "info", "/users");
            save();
            return {...created};
        }
        if (parts.length === 2 && /^\d+$/.test(parts[1])) {
            const id = Number(parts[1]);
            const user = db.users.find((u) => u.id === id);
            if (!user) fail(404, "User not found");
            if (method === "PUT") {
                requireRole(["admin"]);
                if (body && body.role && !ROLES.includes(body.role)) fail(400, `Invalid role: ${body.role}`);
                Object.assign(user, body || {});
                logAudit(body && body.role ? "user.role_change" : "user.update", "user", id, {email: user.email, role: user.role});
                save();
                return {...user};
            }
            if (method === "DELETE") {
                requireRole(["admin"]);
                const admins = db.users.filter((u) => u.role === "admin");
                if (user.role === "admin" && admins.length <= 1) fail(400, "Cannot delete the last admin");
                db.users = db.users.filter((u) => u.id !== id);
                logAudit("user.delete", "user", id, {email: user.email});
                save();
                return {message: "User deleted"};
            }
        }
    }

    // ---- Languages ----------------------------------------------------------
    if (parts[0] === "languages") {
        if (method === "GET" && parts.length === 1) {
            return db.languages.map((l) => ({code: l.code, name: l.name}));
        }
        if (method === "POST" && parts.length === 1) {
            requireRole(["admin", "manager"]);
            if (!body || !body.code) fail(400, "Language code is required");
            if (db.languages.some((l) => l.code === body.code)) fail(400, "Language already exists");
            const created = {code: body.code, name: body.name || body.code, builtin: false, translations: (body.translations || {})};
            db.languages.push(created);
            save();
            return {...created};
        }
        if (parts.length === 2) {
            const code = decodeURIComponent(parts[1]);
            let lang = db.languages.find((l) => l.code === code);
            if (!lang && method === "PUT") {
                // PUT upserts: the Languages page creates a language this way.
                requireRole(["admin", "manager"]);
                lang = {code, name: (body && body.name) || code, builtin: false, translations: {}};
                db.languages.push(lang);
            }
            if (!lang) fail(404, "Language not found");
            if (method === "GET") return {code: lang.code, name: lang.name, translations: {...lang.translations}};
            if (method === "PUT") {
                requireRole(["admin", "manager"]);
                if (lang.builtin) fail(400, "Built-in languages cannot be edited");
                if (body && body.name) lang.name = body.name;
                if (body && body.translations) lang.translations = {...body.translations};
                save();
                return {code: lang.code, name: lang.name, translations: {...lang.translations}};
            }
            if (method === "DELETE") {
                requireRole(["admin", "manager"]);
                if (lang.builtin) fail(400, "Built-in languages cannot be deleted");
                db.languages = db.languages.filter((l) => l.code !== code);
                save();
                return {message: "Language deleted"};
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
                requireRole(["admin", "manager"]);
                db.settings[key] = String(body && body.value !== undefined ? body.value : "");
                logAudit("setting.update", "setting", key, {value: db.settings[key]});
                save();
                return {key, value: db.settings[key]};
            }
            if (method === "DELETE") {
                requireRole(["admin", "manager"]);
                if (!(key in db.settings)) fail(404, "Setting not found");
                delete db.settings[key];
                logAudit("setting.delete", "setting", key, null);
                save();
                return {message: `Setting '${key}' deleted successfully`};
            }
        }
    }

    // ---- Audit logs ---------------------------------------------------------
    if (parts[0] === "audit-logs" && method === "GET" && parts.length === 1) {
        requireRole(["admin", "manager"]);
        const entity = query.get("entity");
        const actor = query.get("actor");
        let list = [...(db.audit_logs || [])];
        if (entity) list = list.filter((l) => l.entity === entity);
        if (actor) list = list.filter((l) => (l.actor_email || "").toLowerCase().includes(actor.toLowerCase()));
        return paginate(list, query);
    }

    // ---- System -------------------------------------------------------------
    if (method === "GET" && path === "/system/info") {
        return {version: db.settings.app_version, lastUpdated: db.settings.last_updated};
    }
    if (method === "GET" && path === "/system/check-updates") {
        return {updateAvailable: db.settings.latest_version !== db.settings.app_version};
    }
    if (method === "GET" && path === "/system/update-check") {
        // The demo has no newer release: it is always up to date.
        return {
            current_version: db.settings.app_version,
            latest_version: db.settings.latest_version,
            update_available: db.settings.latest_version !== db.settings.app_version,
            release_url: "https://github.com/rzatkv/LicenseManagerPro/releases/latest",
            release_notes: null,
            published_at: null,
            error: null,
        };
    }
    if (method === "POST" && path === "/system/update") {
        requireRole(["admin", "manager"]);
        // Demo staging: no tarball is really downloaded; report the staged
        // state so the About page flow can be exercised.
        db.settings.app_version = db.settings.latest_version;
        db.settings.last_updated = new Date().toISOString().slice(0, 10);
        save();
        return {staged: true, version: db.settings.app_version, next_step: "bash scripts/update.sh"};
    }
    if (method === "POST" && path === "/system/check-expiring") {
        requireRole(["admin", "manager"]);
        const days = Number(query.get("days")) || 7;
        const horizon = new Date();
        horizon.setDate(horizon.getDate() + days);
        const now = new Date();
        let expiring = 0;
        let expired = 0;
        for (const lic of db.licenses) {
            if (!lic.expires_at) continue;
            const exp = new Date(lic.expires_at);
            if (exp < now) expired += 1;
            else if (exp <= horizon && lic.status === "active") expiring += 1;
        }
        return {expiring_notified: expiring, expired_notified: expired};
    }

    fail(404, `Demo API has no route ${method} ${path}`);
}
