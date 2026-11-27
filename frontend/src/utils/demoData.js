import {DEMO_MODE} from "../config";
// v3.0.5: single version constant (frontend/src/version.js) — the demo
// and the real app can never disagree about the version again.
import {APP_VERSION} from "../version";

/**
 * Demo backend: an in-browser mock of the real FastAPI API (v2.3).
 *
 * Active only when the app is built with REACT_APP_DEMO_MODE=true
 * (the GitHub Pages demo). Data lives in localStorage so creates and
 * deletes survive a page reload, and a "Reset demo data" is available
 * via resetDemoData(). Nothing here ever talks to a server.
 */

export {DEMO_MODE};

const STORAGE_KEY = "lmp-demo-db-v19";
// Demo 2FA (v2.3): the demo secret is DEMO2FASECRET and the only accepted
// code is 123456 — the Profile page says so. Module scope so the login
// handler (which runs before the 2FA section) can use DEMO_2FA_CODE.
const DEMO_2FA_SECRET = "DEMO2FASECRET";
const DEMO_2FA_CODE = "123456";
const GITHUB_RELEASE_BASE = "https://github.com/rzatkv/LicenseManagerPro/releases/download";
// v3.0.5: panel news — seeded items mirror the repo-root news.json
// (same ids, titles, bodies and dates). GET /news in the mock returns
// these; the Dashboard in demo mode tries the live file from
// raw.githubusercontent.com first and falls back to these when offline.
const NEWS_ITEMS = [
    {id: "v305-release", title: {en: "LicenseManagerPro v3.0.5 is out", fa: "نسخه ۳٫۰٫۵ لایسنس منیجر پرو منتشر شد"}, body: {en: "Vazirmatn Persian font, grouped menus, a Telegram-style bottom nav, full glass design, a live News section, prettier gradient cards, 20 themes and bounded section sizes.", fa: "فونت فارسی وزیرمتن، منوهای طبقه‌بندی‌شده، منوی پایین به سبک تلگرام، طراحی کاملاً شیشه‌ای، بخش اخبار زنده، کارت‌های گرادیانی زیباتر، ۲۰ تم و اندازه‌های محدود برای بخش‌ها."}, date: "2026-11-27", link: "https://github.com/rzatkv/LicenseManagerPro/releases"},
    {id: "news-howto", title: {en: "How news works in this panel", fa: "اخبار در این پنل چطور کار می‌کند؟"}, body: {en: "Edit this file (news.json) in the repository and the news appears on every panel dashboard automatically — no deploy needed for the demo, which reads the file straight from GitHub.", fa: "همین فایل (news.json) را در مخزن ویرایش کنید تا خبرها به‌صورت خودکار روی داشبورد همه پنل‌ها بیایند؛ نسخه دمو فایل را مستقیم از گیت‌هاب می‌خواند و نیازی به استقرار دوباره ندارد."}, date: "2026-11-27", link: null},
    {id: "welcome-admins", title: {en: "Welcome, admins", fa: "به ادمین‌ها خوش‌آمدید"}, body: {en: "Every dashboard block can be hidden from the gear menu, resized from Customize, and personalized separately for each admin.", fa: "هر بخش داشبورد را می‌توان از منوی چرخ‌دنده پنهان کرد، از بخش سفارشی‌سازی اندازه‌اش را عوض کرد و برای هر ادمین جداگانه شخصی‌سازی نمود."}, date: "2026-11-26", link: null},
];
// One module per platform (v2.3): the Downloads page links DIRECTLY to
// the GitHub release asset, so the module version always matches the
// installed app version (version parity).
const MODULES = [
    {id: "whmcs", name: "WHMCS Module", version: APP_VERSION, description: "WHMCS server module: provisions, suspends, renews and terminates licenses from WHMCS."},
    {id: "woocommerce", name: "WooCommerce Plugin", version: APP_VERSION, description: "WordPress plugin: creates a license when a WooCommerce order completes and shows the key to the customer."},
    {id: "wordpress", name: "WordPress Plugin", version: APP_VERSION, description: "WordPress plugin (no WooCommerce): license minting on demand and a My Licenses page."},
    {id: "joomla", name: "Joomla Extension", version: APP_VERSION, description: "Joomla component: admin config, license actions and a user licenses view."},
    {id: "prestashop", name: "PrestaShop Module", version: APP_VERSION, description: "PrestaShop module: mints licenses when an order is paid and shows them to the customer."},
    {id: "magento", name: "Magento Module", version: APP_VERSION, description: "Magento 2 module: admin config, order-paid minting and customer account licenses."},
    {id: "opencart", name: "OpenCart Extension", version: APP_VERSION, description: "OpenCart extension: mints licenses on completed orders and shows them in the customer account."},
    {id: "shopware", name: "Shopware Plugin", version: APP_VERSION, description: "Shopware 6 plugin: order-placed minting and a storefront My Licenses page."},
    {id: "drupal", name: "Drupal Module", version: APP_VERSION, description: "Drupal module: settings form, admin minting and a user licenses page."},
    {id: "odoo", name: "Odoo Module", version: APP_VERSION, description: "Odoo module: mints licenses on sale order confirmation and lists them in the portal."},
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
        {id: 1, name: "CloudPanel Pro", slug: "cloudpanel-pro", description: "Server control panel with license management.", status: "active", billing_cycles: ["monthly", "quarterly", "annual", "lifetime"], webhook_url: "https://example.com/hooks/lmp", webhook_events: ["license.created", "license.renewed", "license.expiring"], webhook_secret: "whsec_demo_cloudpanel", group_id: 1, key_prefix: "CPN", key_segments: 4, key_segment_length: 4, max_reissues: 3, security_overrides: null, notes: "Flagship product — priority support.", created_at: isoDaysAgo(30), updated_at: isoDaysAgo(2)},
        {id: 2, name: "CRM Suite", slug: "crm-suite", description: "Customer relationship management suite.", status: "active", billing_cycles: ["monthly", "semiannual", "annual"], webhook_url: null, webhook_events: [], webhook_secret: null, group_id: 2, key_prefix: null, key_segments: 4, key_segment_length: 4, max_reissues: 0, security_overrides: null, notes: null, created_at: isoDaysAgo(20), updated_at: isoDaysAgo(5)},
        {id: 3, name: "HelpDesk", slug: "helpdesk", description: "Support ticket system for small teams.", status: "active", billing_cycles: ["monthly", "annual", "biennial"], webhook_url: null, webhook_events: [], webhook_secret: null, group_id: 1, key_prefix: "HDK", key_segments: 3, key_segment_length: 4, max_reissues: 1, security_overrides: null, notes: null, created_at: isoDaysAgo(12), updated_at: isoDaysAgo(1)},
    ];
    const lic = (id, productId, product, owner, status, expires, created, extra) => ({
        id, key: randomLicenseKey(products.find((p) => p.id === productId)), product, product_id: productId,
        billing_cycle: productId === 1 ? "annual" : productId === 2 ? "monthly" : "annual",
        owner_email: owner, status, expires_at: expires, max_activations: 5, activations: 1,
        allowed_domains: [], allowed_ips: [], install_path: null, reissue_count: 0, notes: null,
        created_at: created, updated_at: created, ...(extra || {}),
    });
    return {
        users: [
            {id: 1, email: "demo@demo.com", role: "admin", role_id: 1, display_name: "Demo Admin", avatar_url: null, phone: "+989000000000", totp_enabled: false, last_login_at: now, is_active: true, created_at: isoDaysAgo(30)},
            {id: 2, email: "manager@demo.com", role: "manager", role_id: 2, display_name: "Demo Manager", avatar_url: null, phone: null, totp_enabled: false, last_login_at: isoDaysAgo(1), is_active: true, created_at: isoDaysAgo(12)},
            {id: 3, email: "support@demo.com", role: "support", role_id: 3, display_name: "Demo Support", avatar_url: null, phone: null, totp_enabled: false, last_login_at: isoDaysAgo(2), is_active: true, created_at: isoDaysAgo(5)},
            {id: 4, email: "viewer@demo.com", role: "viewer", role_id: 4, display_name: "Demo Viewer", avatar_url: null, phone: null, totp_enabled: false, last_login_at: null, is_active: true, created_at: isoDaysAgo(3)},
        ],
        currentUserId: 1,
        // Built-in roles (v2.3): same permission sets as the backend seed.
        roles: [
            {id: 1, name: "Admin", slug: "admin", description: "Full access to everything.", permissions: ["*"], is_builtin: true, created_at: isoDaysAgo(30), updated_at: isoDaysAgo(30)},
            {id: 2, name: "Manager", slug: "manager", description: "Everything except managing users and roles.", permissions: ["products:write", "licenses:create", "licenses:renew", "licenses:write", "licenses:delete", "api_keys:create", "api_keys:write", "languages:write", "settings:write", "system:check-expiring", "audit:read", "downloads:read", "security:license-locking", "security:captcha", "sms:write", "email:write", "telegram:write", "system:update-check"], is_builtin: true, created_at: isoDaysAgo(30), updated_at: isoDaysAgo(30)},
            {id: 3, name: "Support", slug: "support", description: "Read everything; create/renew licenses and API keys.", permissions: ["licenses:create", "licenses:renew", "api_keys:create", "downloads:read"], is_builtin: true, created_at: isoDaysAgo(30), updated_at: isoDaysAgo(30)},
            {id: 4, name: "Viewer", slug: "viewer", description: "Read-only.", permissions: ["downloads:read"], is_builtin: true, created_at: isoDaysAgo(30), updated_at: isoDaysAgo(30)},
        ],
        // Per-user preferences (v2.3): theme + dashboard layout.
        preferences: {},
        // Global license-security config (v2.3): the strict default.
        licenseSecurity: {strictness: "strict", enforce_domain_lock: true, enforce_ip_lock: true, enforce_install_path_lock: true, enforce_activation_limit: true, missing_lock_behavior: "deny"},
        products,
        licenses: [
            lic(1, 1, "CloudPanel Pro", "acme@example.com", "active", isoDaysFromNow(200), isoDaysAgo(30), {billing_cycle: "annual", allowed_domains: ["acme.example.com"], activations: 3, max_activations: 10, notes: "Enterprise customer — renew early."}),
            lic(2, 1, "CloudPanel Pro", "studio@example.com", "active", isoDaysFromNow(30), isoDaysAgo(20), {billing_cycle: "quarterly", allowed_domains: ["studio.example.com"], allowed_ips: ["203.0.213.10"]}),
            lic(3, 2, "CRM Suite", "acme@example.com", "inactive", isoDaysAgo(10), isoDaysAgo(45), {billing_cycle: "monthly"}),
            lic(4, 3, "HelpDesk", "billing@example.com", "active", isoDaysFromNow(365), now, {billing_cycle: "annual", install_path: "/var/www/html"}),
            lic(5, 2, "CRM Suite", "studio@example.com", "active", isoDaysFromNow(120), isoDaysAgo(3), {billing_cycle: "semiannual", activations: 2}),
            lic(6, 1, "CloudPanel Pro", "ops@example.com", "active", null, isoDaysAgo(10), {billing_cycle: "lifetime", activations: 0}),
            lic(7, 3, "HelpDesk", "help@example.com", "active", isoDaysFromNow(15), isoDaysAgo(2), {billing_cycle: "monthly", allowed_domains: ["help.example.com"]}),
            lic(8, 2, "CRM Suite", "sales@example.com", "active", isoDaysFromNow(60), isoDaysAgo(1), {billing_cycle: "annual"}),
        ],
        apiKeys: [
            // v2.3: `key` is the display prefix only; the secret lives in
            // `_secret` (never sent to the page except once, at creation,
            // as `plain_key`) — mirroring the hashed backend storage.
            {id: 1, key: "lmp_demo_A1b", _secret: "lmp_demo_A1b2C3d4E5f6G7h8", scopes: [], require_signed_requests: false, access_rights: ["create_license", "get_license_info", "renew_license"], expires_at: isoDaysFromNow(90), associated_ip: null, associated_domain: null, associated_directory: null, single_use: false, consumed: false, created_at: isoDaysAgo(30)},
            {id: 2, key: "lmp_demo_X9y", _secret: "lmp_demo_X9y8Z7w6V5u4T3s2", scopes: [], require_signed_requests: false, access_rights: ["get_license_info"], expires_at: null, associated_ip: null, associated_domain: null, associated_directory: null, single_use: true, consumed: false, created_at: isoDaysAgo(12)},
            {id: 3, key: "lmp_demo_M4n", _secret: "lmp_demo_M4n5B6v7C8x9Z0a1", scopes: ["module"], require_signed_requests: false, access_rights: ["create_license", "edit_license", "delete_license", "get_license_info", "renew_license"], expires_at: isoDaysFromNow(90), associated_ip: null, associated_domain: "example.com", associated_directory: null, single_use: false, consumed: false, created_at: isoDaysAgo(5)},
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
            app_version: APP_VERSION,
            latest_version: APP_VERSION,
            last_updated: new Date().toISOString().slice(0, 10),
            daily_request_limit: "100",
            site_name: "License Manager Pro",
            logo_url: "./logo.svg",
            // v3.0: panel domain ("" = request host), maintenance off.
            panel_domain: "",
            maintenance_mode: "off",
            maintenance_message: "",
            // v3.0: date calendar, 4-byte strip, 2FA channel, encoding, notes.
            date_calendar: "gregorian",
            strip_4byte: "on",
            twofa_channel: "totp",
            system_encoding: "utf-8",
            product_notes_enabled: "on",
            // v3.0: JSON configs (mirrors the backend settings).
            sms_config: JSON.stringify({active_provider: "", providers: {ippanel: {}, kavenegar: {}, faraz: {}}}),
            email_config: JSON.stringify({}),
            telegram_config: JSON.stringify({bot_token: "", chat_ids: []}),
            notification_channels: JSON.stringify({}),
        },
        product_groups: productGroups,
        notifications: [
            {id: 1, user_id: null, title: "Welcome to v3.0.5", message: "Dashboard: Vazirmatn Persian font, grouped menus, Telegram-style bottom nav, full glass, a live News section, prettier gradient cards, 20 themes and bounded section sizes — see the Dashboard.", type: "info", link: "/downloads", is_read: false, created_at: isoDaysAgo(1)},
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
            // v3.0: per-channel send logs (demo seed for the Logs channel
            // filters + the dashboard sending charts).
            {id: 6, actor_email: "system", action: "notify.email_sent", entity: "notification", entity_id: null, details: {event: "license_created", channel: "email", to: "acme@example.com"}, created_at: isoDaysAgo(0)},
            {id: 7, actor_email: "system", action: "notify.email_sent", entity: "notification", entity_id: null, details: {event: "license_created", channel: "email", to: "studio@example.com"}, created_at: isoDaysAgo(0)},
            {id: 8, actor_email: "system", action: "notify.email_failed", entity: "notification", entity_id: null, details: {event: "license_expiring", channel: "email", to: "sales@example.com"}, created_at: isoDaysAgo(0)},
            {id: 9, actor_email: "system", action: "notify.sms_sent", entity: "notification", entity_id: null, details: {event: "license_expiring", channel: "sms", to: "+989000000000"}, created_at: isoDaysAgo(1)},
            {id: 10, actor_email: "system", action: "notify.telegram_sent", entity: "notification", entity_id: null, details: {event: "license_created", channel: "telegram", to: ""}, created_at: isoDaysAgo(1)},
            {id: 11, actor_email: "system", action: "twofa.email_sent", entity: "notification", entity_id: null, details: {event: "twofa_code", channel: "email", to: "demo@demo.com"}, created_at: isoDaysAgo(2)},
            {id: 12, actor_email: "system", action: "notify.email_sent", entity: "notification", entity_id: null, details: {event: "license_expiring", channel: "email", to: "help@example.com"}, created_at: isoDaysAgo(3)},
            {id: 13, actor_email: "system", action: "notify.sms_failed", entity: "notification", entity_id: null, details: {event: "license_expired", channel: "sms", to: "+989000000000"}, created_at: isoDaysAgo(5)},
            {id: 14, actor_email: "system", action: "notify.telegram_sent", entity: "notification", entity_id: null, details: {event: "webhook_failed", channel: "telegram", to: ""}, created_at: isoDaysAgo(7)},
            {id: 15, actor_email: "system", action: "notify.email_sent", entity: "notification", entity_id: null, details: {event: "license_renewed", channel: "email", to: "ops@example.com"}, created_at: isoDaysAgo(9)},
            {id: 16, actor_email: "system", action: "service_status.check_failed", entity: "service", entity_id: "email", details: {event: "service_status_check", channel: "system", service: "email", status: "unreachable", detail: "Connection timed out"}, created_at: isoDaysAgo(4)},
        ],
        nextLicenseId: 9,
        nextApiKeyId: 4,
        nextUserId: 5,
        nextProductId: 4,
        nextDeliveryId: 3,
        nextAuditLogId: 17,
        nextGroupId: 3,
        nextNotificationId: 4,
        nextBlacklistId: 1,
        nextActivationId: 2,
        nextRoleId: 5,
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
                // v2.3 collections: backfill when a pre-v2.3 DB is loaded.
                if (!parsed.roles) { parsed.roles = fresh.roles; parsed.nextRoleId = fresh.nextRoleId; }
                if (!parsed.preferences) parsed.preferences = {};
                if (!parsed.licenseSecurity) parsed.licenseSecurity = fresh.licenseSecurity;
                if (!parsed.users[0].role_id) {
                    parsed.users.forEach((u, i) => {
                        u.role_id = i + 1;
                        u.display_name = u.display_name || null;
                        u.avatar_url = u.avatar_url || null;
                        u.totp_enabled = u.totp_enabled || false;
                        u.last_login_at = u.last_login_at || null;
                    });
                }
                if (parsed.apiKeys && parsed.apiKeys.length && parsed.apiKeys[0]._secret === undefined) {
                    parsed.apiKeys.forEach((k) => {
                        k._secret = k.key;
                        k.key = String(k.key).slice(0, 12);
                        k.scopes = k.scopes || [];
                        k.require_signed_requests = k.require_signed_requests || false;
                    });
                }
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

// Public form of an API key: prefix only, never the secret (mirrors the
// v2.3 backend). The secret is returned once, at creation/rotation, as
// `plain_key` on that response only.
function publicApiKey(k, plainKey) {
    const { _secret, ...rest } = k;
    return {...rest, plain_key: plainKey || null};
}

// Role enforcement mirroring the backend: viewer is read-only, support
// cannot delete or manage products/users/settings, manager cannot manage users.
function requireRole(allowed) {
    const role = currentUser().role;
    if (!allowed.includes(role)) {
        fail(403, `Role '${role}' is not allowed to perform this action`);
    }
}

// ---- CAPTCHA (v3.0, mirrors backend/services/captcha.py) -----------------
// In-memory single-use challenges; the demo has no Google, so reCAPTCHA
// verification always fails closed here (the login page shows the
// graceful "could not load" state with placeholder keys).
const CAPTCHA_TYPES = ["off", "custom", "recaptcha-v2", "recaptcha-v3"];
const CAPTCHA_MODELS = ["math", "text", "reverse"];
const _captchaChallenges = new Map();
const _TEXT_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function captchaConfig() {
    let cfg = {type: "off", model: "math", site_key: "", secret_key: "", v3_threshold: 0.5};
    try {
        const stored = JSON.parse(db.settings.captcha_config || "null");
        if (stored && typeof stored === "object") cfg = {...cfg, ...stored};
    } catch (e) {}
    if (!CAPTCHA_TYPES.includes(cfg.type)) cfg.type = "off";
    if (!CAPTCHA_MODELS.includes(cfg.model)) cfg.model = "math";
    return cfg;
}

function publicCaptchaConfig() {
    const cfg = captchaConfig();
    return {
        type: cfg.type,
        model: cfg.model,
        site_key: (cfg.type === "recaptcha-v2" || cfg.type === "recaptcha-v3") ? cfg.site_key : "",
        v3_threshold: cfg.v3_threshold,
        secret_configured: !!cfg.secret_key,
    };
}

function generateCaptchaChallenge(model) {
    if (!CAPTCHA_MODELS.includes(model)) model = "math";
    const id = `ch_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    let display, answer, prompt;
    if (model === "math") {
        const a = 2 + Math.floor(Math.random() * 18);
        const b = 2 + Math.floor(Math.random() * 18);
        if (Math.random() < 0.5) { display = `${a} + ${b} = ?`; answer = String(a + b); }
        else { display = `${a + b} - ${a} = ?`; answer = String(b); }
        prompt = "Solve the calculation";
    } else if (model === "text") {
        const code = Array.from({length: 5}, () => _TEXT_ALPHABET[Math.floor(Math.random() * _TEXT_ALPHABET.length)]).join("");
        display = code.split("").join(" ");
        answer = code;
        prompt = "Type the characters shown";
    } else {
        const digits = Array.from({length: 4}, () => String(Math.floor(Math.random() * 10))).join("");
        display = digits;
        answer = digits.split("").reverse().join("");
        prompt = "Type these digits in reverse order";
    }
    _captchaChallenges.set(id, {answer, expires: Date.now() + 300000});
    return {challenge_id: id, model, prompt, display};
}

function verifyCaptchaChallenge(id, answer) {
    if (!id || answer == null) return false;
    const stored = _captchaChallenges.get(id);
    _captchaChallenges.delete(id);
    if (!stored || Date.now() > stored.expires) return false;
    const norm = (s) => String(s).replace(/\s+/g, "").toLowerCase();
    return norm(answer) === norm(stored.answer);
}

function verifyLoginCaptcha(body) {
    const cfg = captchaConfig();
    if (cfg.type === "off") return true;
    if (cfg.type === "custom") {
        return verifyCaptchaChallenge(body && body.captcha_challenge_id, body && body.captcha_answer);
    }
    // reCAPTCHA in the demo: no Google to verify against — fail closed.
    return false;
}

function isValidHostname(value) {
    if (!value || value.length > 253) return false;
    if (value.includes("://") || value.includes("/") || value.includes(":") || value.includes("_")) return false;
    const label = "[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?";
    return new RegExp(`^${label}(?:\\.${label})*$`).test(value);
}

// Settings the demo mock accepts through PUT /settings/{key} (mirrors the
// backend allowlist); system-managed keys are rejected, unknown keys 404.
const EDITABLE_SETTINGS = ["site_name", "logo_url", "daily_request_limit", "panel_domain", "maintenance_mode", "maintenance_message", "date_calendar", "strip_4byte", "twofa_channel", "system_encoding", "product_notes_enabled"];
const SYSTEM_MANAGED_SETTINGS = ["app_version", "latest_version", "last_updated", "license_security", "captcha_config", "sms_config", "email_config", "telegram_config", "notification_channels"];

function validateSettingValue(key, value) {
    if (key === "panel_domain") {
        if (value && !isValidHostname(value)) fail(400, "panel_domain must be a valid hostname, e.g. panel.example.com");
    } else if (key === "daily_request_limit") {
        const n = Number(value);
        if (!Number.isInteger(n) || n < 1 || n > 1000000) fail(400, "daily_request_limit must be between 1 and 1000000");
    } else if (key === "maintenance_mode") {
        if (value !== "on" && value !== "off") fail(400, "maintenance_mode must be 'on' or 'off'");
    } else if (key === "maintenance_message") {
        if (String(value).length > 500) fail(400, "maintenance_message must be at most 500 characters");
    } else if (key === "site_name") {
        if (!String(value).trim() || String(value).length > 100) fail(400, "site_name must be 1-100 characters");
    } else if (key === "logo_url") {
        if (String(value).length > 500) fail(400, "logo_url must be at most 500 characters");
    } else if (key === "date_calendar") {
        if (!["gregorian", "jalali", "hijri"].includes(value)) fail(400, "date_calendar must be gregorian, jalali or hijri");
    } else if (key === "strip_4byte" || key === "product_notes_enabled") {
        if (value !== "on" && value !== "off") fail(400, `${key} must be 'on' or 'off'`);
    } else if (key === "twofa_channel") {
        if (!["totp", "email", "sms"].includes(value)) fail(400, "twofa_channel must be totp, email or sms");
    } else if (key === "system_encoding") {
        if (!["utf-8", "windows-1256", "iso-8859-1"].includes(String(value).toLowerCase())) fail(400, "system_encoding must be utf-8, windows-1256 or iso-8859-1");
    }
}

// ---- 4-byte strip (v3.0, mirrors backend/services/strip4.py) -------------
function strip4byteText(text) {
    // Remove characters outside the Basic Multilingual Plane (emoji, etc.).
    return String(text).replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, "");
}

function strip4byteDeep(value) {
    if (typeof value === "string") return strip4byteText(value);
    if (Array.isArray(value)) return value.map(strip4byteDeep);
    if (value && typeof value === "object") {
        const out = {};
        for (const [k, v] of Object.entries(value)) out[k] = strip4byteDeep(v);
        return out;
    }
    return value;
}

// ---- SMS / Email / Telegram configs (v3.0, mirrors the backend) ---------
const SMS_PROVIDERS = ["ippanel", "kavenegar", "faraz"];
const SMS_PROVIDER_FIELDS = {ippanel: ["api_key", "sender"], kavenegar: ["api_key", "sender"], faraz: ["username", "password", "sender"]};

function smsConfig() {
    try {
        const cfg = JSON.parse(db.settings.sms_config || "{}");
        return {active_provider: cfg.active_provider || "", providers: {ippanel: {}, kavenegar: {}, faraz: {}, ...(cfg.providers || {})}};
    } catch {
        return {active_provider: "", providers: {ippanel: {}, kavenegar: {}, faraz: {}}};
    }
}

function publicSmsConfig() {
    const cfg = smsConfig();
    const providers = {};
    for (const name of SMS_PROVIDERS) {
        const fields = cfg.providers[name] || {};
        providers[name] = {
            configured: SMS_PROVIDER_FIELDS[name].some((f) => f !== "sender" && (fields[f] || "").trim()),
            sender: fields.sender || "",
        };
    }
    return {active_provider: cfg.active_provider, providers};
}

function emailConfig() {
    try {
        return JSON.parse(db.settings.email_config || "{}");
    } catch {
        return {};
    }
}

function publicEmailConfig() {
    const cfg = emailConfig();
    return {
        smtp_host: cfg.smtp_host || "",
        smtp_port: cfg.smtp_port || 587,
        encryption: cfg.encryption || "tls",
        username: cfg.username || "",
        password_configured: Boolean(cfg.password),
        from_address: cfg.from_address || "",
        from_name: cfg.from_name || "",
        templates: emailTemplates(),
        signature: emailSignature(),
    };
}

const DEFAULT_TEMPLATES = {
    twofa_code: {subject: "Your verification code", body: "Hello,\n\nYour verification code is: {{code}}\n\nThis code expires in 5 minutes. If you did not request it, ignore this email.\n"},
    license_created: {subject: "Your license for {{product_name}} is ready", body: "Hello,\n\nYour license has been created.\n\nLicense key: {{license_key}}\nProduct: {{product_name}}\nExpires: {{expiry_date}}\n"},
    license_renewed: {subject: "Your license for {{product_name}} was renewed", body: "Hello,\n\nYour license has been renewed.\n\nLicense key: {{license_key}}\nProduct: {{product_name}}\nExpires: {{expiry_date}}\n"},
    license_expiring: {subject: "Your license for {{product_name}} expires soon", body: "Hello,\n\nYour license expires in {{days_left}} day(s).\n\nLicense key: {{license_key}}\nProduct: {{product_name}}\nExpires: {{expiry_date}}\n\nPlease renew it before it expires.\n"},
    license_expired: {subject: "Your license for {{product_name}} has expired", body: "Hello,\n\nYour license has expired.\n\nLicense key: {{license_key}}\nProduct: {{product_name}}\nExpired: {{expiry_date}}\n"},
    user_created: {subject: "Your account on {{site_name}}", body: "Hello,\n\nAn account was created for you on {{site_name}}.\n\nEmail: {{user_email}}\nRole: {{role}}\n"},
};

function emailTemplates() {
    const stored = (emailConfig().templates) || {};
    const merged = {};
    for (const [name, tpl] of Object.entries(DEFAULT_TEMPLATES)) {
        merged[name] = {...tpl, ...(stored[name] || {})};
    }
    return merged;
}

function emailSignature() {
    const cfg = emailConfig();
    return cfg.signature !== undefined ? cfg.signature : "--\nLicense Manager Pro";
}

function telegramConfig() {
    try {
        const cfg = JSON.parse(db.settings.telegram_config || "{}");
        return {bot_token: cfg.bot_token || "", chat_ids: cfg.chat_ids || []};
    } catch {
        return {bot_token: "", chat_ids: []};
    }
}

function publicTelegramConfig() {
    const cfg = telegramConfig();
    return {token_configured: Boolean(cfg.bot_token), chat_ids: [...cfg.chat_ids]};
}

// ---- Notification channels (v3.0) ----------------------------------------
const NOTIFY_EVENTS = ["license_created", "license_reissued", "license_expiring", "license_expired", "webhook_failed", "webhook_blocked", "user_created", "api_key_expiring"];
const NOTIFY_CHANNELS = ["email", "sms", "telegram"];

function notificationChannels() {
    let stored = {};
    try {
        stored = JSON.parse(db.settings.notification_channels || "{}");
    } catch {
        stored = {};
    }
    const merged = {};
    for (const event of NOTIFY_EVENTS) {
        merged[event] = {email: true, sms: false, telegram: false, ...(stored[event] || {})};
    }
    return merged;
}

// Per-channel log (v3.0): records a send outcome in the audit trail so
// the Logs page filters + sending charts see it. Demo only: no real send.
function logChannelSend(channel, event, ok, to) {
    logAudit(`notify.${channel}_${ok ? "sent" : "failed"}`, "notification", null, {event, channel, to: to || ""}, "system");
}

// Demo "send": simulates an outbound send per the channel matrix and
// logs it. In the demo nothing leaves the browser.
function notifyEvent(event, title, message, type, link, context) {
    notify(title, message, type, link, null);
    const channels = notificationChannels();
    if (!channels[event]) return;
    if (channels[event].email) logChannelSend("email", event, true, "admin@demo");
    if (channels[event].sms) logChannelSend("sms", event, true, "+989000000000");
    if (channels[event].telegram) logChannelSend("telegram", event, true, "");
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
function logAudit(action, entity, entityId, details, actorOverride) {
    if (!Array.isArray(db.audit_logs)) db.audit_logs = [];
    if (!db.nextAuditLogId) db.nextAuditLogId = db.audit_logs.length + 1;
    const user = currentUser();
    db.audit_logs.unshift({
        id: db.nextAuditLogId++,
        actor_email: actorOverride || (user ? user.email : "system"),
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
    // v3.0.0 demo fix: callers use the real-API "/api/..." paths (e.g.
    // Settings.js config endpoints); the mock dispatches on the bare path,
    // so strip a leading "api" segment. No route legitimately starts with
    // "api" as a resource name.
    if (parts[0] === "api") parts.shift();

    // v3.0: auto-strip 4-byte characters (mirrors the backend middleware):
    // when the strip_4byte setting is on, every JSON body is stripped of
    // emoji etc. before any handler sees it.
    if (body && typeof body === "object" && db.settings.strip_4byte !== "off") {
        body = strip4byteDeep(body);
    }

    // ---- Auth -------------------------------------------------------------
    if (method === "POST" && path === "/auth/login") {
        // v3.0 CAPTCHA: verified before the password is checked (when on).
        if (!verifyLoginCaptcha(body)) fail(400, "Captcha verification failed");
        const match = db.users.find((u) => u.email === (body && body.email));
        db.currentUserId = match ? match.id : 1;
        // v3.0: 2FA channel — totp returns the usual temp token; email/sms
        // "send" a code (demo: the code IS the demo 2FA code, returned as
        // demo_code so the login page can show it — demo only, never in
        // production).
        if (match && match.totp_enabled) {
            const channel = db.settings.twofa_channel || "totp";
            if (channel === "email" || channel === "sms") {
                logAudit(`twofa.${channel}_sent`, "notification", null, {event: "twofa_code", channel, to: channel === "email" ? match.email : (match.phone || "")}, "system");
                save();
                return {access_token: "", token_type: "bearer", requires_2fa: true, temp_token: "demo-temp-token", twofa_channel: channel, demo_code: DEMO_2FA_CODE};
            }
            save();
            return {access_token: "", token_type: "bearer", requires_2fa: true, temp_token: "demo-temp-token", twofa_channel: "totp"};
        }
        save();
        return {access_token: "demo-token", token_type: "bearer"};
    }
    if (method === "GET" && path === "/users/me") {
        return {...currentUser()};
    }

    // ---- CAPTCHA (v3.0, public) -------------------------------------------
    if (method === "GET" && path === "/captcha/config") {
        return publicCaptchaConfig();
    }
    if (method === "POST" && path === "/captcha/challenge") {
        return generateCaptchaChallenge(captchaConfig().model);
    }

    // ---- Maintenance mode (v3.0) ------------------------------------------
    // When on, every API call except the login flow, captcha and the
    // public maintenance status is 503 for non-admins (admin bypass).
    if (db.settings.maintenance_mode === "on") {
        const exempt = path.startsWith("/auth/") || path.startsWith("/captcha/")
            || path === "/system/maintenance" || path === "/system/ready";
        if (!exempt && currentUser().role !== "admin") {
            fail(503, db.settings.maintenance_message || "Maintenance");
        }
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
    if (method === "GET" && path === "/dashboard/activations-trend") {
        const days = Math.min(90, Math.max(1, Number(query.get("days")) || 14));
        const points = [];
        const today = new Date();
        for (let i = days - 1; i >= 0; i--) {
            const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
            const next = new Date(d);
            next.setDate(next.getDate() + 1);
            const count = (db.activations || []).filter((a) => {
                const c = new Date(a.created_at);
                return c >= d && c < next;
            }).length;
            points.push({date: d.toISOString().slice(0, 10), count});
        }
        return {points};
    }
    if (method === "GET" && path === "/dashboard/webhook-stats") {
        const deliveries = db.deliveries || [];
        const total = deliveries.length;
        const success = deliveries.filter((d) => d.success).length;
        const byEvent = {};
        for (const d of deliveries) {
            const entry = byEvent[d.event] || (byEvent[d.event] = {total: 0, success: 0});
            entry.total += 1;
            if (d.success) entry.success += 1;
        }
        return {
            total,
            success,
            failed: total - success,
            success_rate: total ? Math.round((1000 * success) / total) / 10 : 100,
            by_event: byEvent,
        };
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
            // v3.0: notes are rejected while the notes feature is disabled.
            if (body.notes && db.settings.product_notes_enabled === "off") {
                fail(400, "Product & license notes are disabled in Settings → General");
            }
            const cycles = (body.billing_cycles || []).filter((c) => BILLING_CYCLES.includes(c));
            const created = {
                id: db.nextProductId++,
                name: body.name,
                slug: body.slug || body.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
                description: body.description || null,
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
                notes: body.notes || null,
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
                if (body && body.notes && db.settings.product_notes_enabled === "off") {
                    fail(400, "Product & license notes are disabled in Settings → General");
                }
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
    // Direct GitHub release asset links (v2.3): the module version always
    // matches the installed app version (version parity).
    if (parts[0] === "downloads") {
        if (method === "GET" && parts.length === 1) {
            const version = db.settings.app_version || APP_VERSION;
            return MODULES.map((m) => ({
                ...m,
                download_url: `${GITHUB_RELEASE_BASE}/v${version}/licensemanagerpro-${m.id}-${version}.zip`,
                updated_at: db.settings.last_updated,
            }));
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
            // links to the GitHub release asset in demo mode instead.
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
            // v3.0: notes are rejected while the notes feature is disabled.
            if (body && body.notes && db.settings.product_notes_enabled === "off") {
                fail(400, "Product & license notes are disabled in Settings → General");
            }
            const productId = body && body.product_id ? Number(body.product_id) : null;
            let product = null;
            let expiresAt = null;
            let cycle = (body && body.billing_cycle) || null;
            if (productId) {
                product = db.products.find((p) => p.id === productId);
                if (!product) fail(400, "Product not found");
                if (cycle && !BILLING_CYCLES.includes(cycle)) {
                    fail(422, `Unknown billing cycle: ${cycle}`);
                }
                if (!cycle) fail(400, "billing_cycle is required when product_id is given");
                // Billing-cycle sync (v2.3): a cycle the product does not
                // list yet is ADDED to the product, and the license expiry
                // follows the cycle the module sent.
                if (!product.billing_cycles.includes(cycle)) {
                    product.billing_cycles = [...product.billing_cycles, cycle];
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
                notes: (body && body.notes) || null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            };
            db.licenses.unshift(created);
            logAudit("license.create", "license", created.id, {product: created.product, owner_email: created.owner_email});
            notifyEvent("license_created", "License created", `License ${created.key} (${created.product}) was created.`, "success", "/licenses");
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
                if (body && body.notes && db.settings.product_notes_enabled === "off") {
                    fail(400, "Product & license notes are disabled in Settings → General");
                }
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
            // Billing-cycle switch (v2.3 sync): ?billing_cycle=... or the
            // body's billing_cycle — expiry follows that cycle and the
            // product gains it when missing.
            const newCycle = query.get("billing_cycle") || (body && body.billing_cycle) || null;
            if (newCycle) {
                if (!BILLING_CYCLES.includes(newCycle)) fail(422, `Unknown billing cycle: ${newCycle}`);
                const product = license.product_id ? db.products.find((p) => p.id === license.product_id) : null;
                if (product && !product.billing_cycles.includes(newCycle)) {
                    product.billing_cycles = [...product.billing_cycles, newCycle];
                }
                const months = CYCLE_MONTHS[newCycle];
                if (months == null) fail(400, "Lifetime licenses do not expire and cannot be renewed");
                license.billing_cycle = newCycle;
                license.expires_at = addMonths(base, months).toISOString();
                license.status = "active";
                license.updated_at = new Date().toISOString();
                logAudit("license.renew", "license", id, {billing_cycle: newCycle});
                save();
                return withEffectiveStatus(license);
            }
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
            notifyEvent("license_reissued", "License reissued", `License ${license.key} (${license.product}) was reissued.`, "info", "/licenses");
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
            const paged = paginate(db.apiKeys.map((k) => publicApiKey(k)), query);
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
            const scopes = (body && body.scopes) || [];
            if (scopes.includes("module")) {
                const days = body && body.expires_in_days != null ? Number(body.expires_in_days) : 90;
                if (![30, 90, 180, 365].includes(days)) {
                    fail(400, "Module keys expire in one of 30/90/180/365 days");
                }
            }
            const secret = (body && body.key) || `lmp_${randomToken(32)}`;
            if (db.apiKeys.some((k) => k._secret === secret)) fail(400, "API Key already exists");
            const created = {
                id: db.nextApiKeyId++,
                key: secret.slice(0, 12),
                _secret: secret,
                scopes,
                require_signed_requests: !!(body && body.require_signed_requests),
                access_rights: rights.length ? rights : (scopes.includes("module") ? ["create_license", "edit_license", "delete_license", "get_license_info", "renew_license"] : rights),
                expires_at: body && body.expires_in_days ? isoDaysFromNow(Number(body.expires_in_days)) : (scopes.includes("module") ? isoDaysFromNow(90) : null),
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
            // The secret is shown ONCE, at creation.
            return publicApiKey(created, secret);
        }
        if (method === "POST" && parts.length === 3 && parts[2] === "rotate" && /^\d+$/.test(parts[1])) {
            requireRole(["admin", "manager"]);
            const id = Number(parts[1]);
            const key = db.apiKeys.find((k) => k.id === id);
            if (!key) fail(404, "API Key not found");
            const secret = `lmp_${randomToken(32)}`;
            key._secret = secret;
            key.key = secret.slice(0, 12);
            key.consumed = false;
            logAudit("api_key.rotate", "api_key", id, null);
            save();
            return publicApiKey(key, secret);
        }
        if (parts.length === 2 && /^\d+$/.test(parts[1])) {
            const id = Number(parts[1]);
            const key = db.apiKeys.find((k) => k.id === id);
            if (!key) fail(404, "API Key not found");
            if (method === "GET") return publicApiKey(key);
            if (method === "PUT") {
                requireRole(["admin", "manager", "support"]);
                if (body && body.access_rights) {
                    for (const right of body.access_rights) {
                        if (!ACCESS_RIGHTS.includes(right)) fail(400, `Invalid access right: ${right}`);
                    }
                    key.access_rights = body.access_rights;
                }
                if (body && body.scopes) key.scopes = body.scopes;
                if (body && body.require_signed_requests !== undefined) key.require_signed_requests = !!body.require_signed_requests;
                if (body && body.expires_in_days != null) key.expires_at = isoDaysFromNow(Number(body.expires_in_days));
                for (const field of ["associated_ip", "associated_domain", "associated_directory", "single_use"]) {
                    if (body && body[field] !== undefined) key[field] = body[field];
                }
                logAudit("api_key.update", "api_key", id, null);
                save();
                return publicApiKey(key);
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
        if (method === "PUT" && parts.length === 2 && parts[1] === "me") {
            const me = currentUser();
            if (body && body.display_name !== undefined) me.display_name = body.display_name || null;
            // v3.0: phone number for SMS 2FA codes / SMS notifications.
            if (body && body.phone !== undefined) me.phone = (body.phone || "").trim() || null;
            if (body && body.avatar_url !== undefined) {
                const url = body.avatar_url || "";
                if (url) {
                    if (url.length > 3000000) fail(400, "Avatar is too large (max ~2 MB)");
                    if (!url.startsWith("data:image/png;base64,") && !url.startsWith("data:image/jpeg;base64,") && !url.startsWith("data:image/webp;base64,") && !url.startsWith("http://") && !url.startsWith("https://")) {
                        fail(400, "Avatar must be a PNG/JPEG/WebP data URL or an http(s) URL (SVG is not allowed)");
                    }
                }
                me.avatar_url = url || null;
            }
            logAudit("user.profile_update", "user", me.id, null);
            save();
            return {...me};
        }
        if (parts.length === 3 && parts[1] === "me" && parts[2] === "preferences") {
            const me = currentUser();
            if (!db.preferences) db.preferences = {};
            if (method === "GET") {
                return {preferences: db.preferences[me.id] || {}};
            }
            if (method === "PUT") {
                // v3.0 per-admin themes: same validation as the backend —
                // unknown preset/mode or a non-hex custom colour is a 400.
                if (body.key === "theme") {
                    const v = body.value || {};
                    const presets = ["default", "ocean", "forest", "sunset", "graphite", "rose", "teal", "amber", "lime", "ruby", "midnight", "coral", "mint", "sky", "plum", "gold", "crimson", "azure", "lavender", "slate", "citrine", "cyan", "pink", "fuchsia", "iris", "tangerine", "olive", "berry", "navy", "wine", "jade", "aqua", "magenta", "brick", "bronze", "steel", "blush", "moss", "apricot", "cobalt", "custom"];
                    if (v.preset !== undefined && !presets.includes(v.preset)) fail(400, `unknown theme preset: ${v.preset}`);
                    if (v.mode !== undefined && !["light", "dark", "auto"].includes(v.mode)) fail(400, `unknown theme mode: ${v.mode}`);
                    if (v.custom !== undefined) {
                        if (!v.custom || typeof v.custom !== "object") fail(400, "theme.custom must be an object");
                        for (const [k, c] of Object.entries(v.custom)) {
                            if (!["accent", "accent2", "bg", "surface"].includes(k)) fail(400, `unknown theme.custom field: ${k}`);
                            if (typeof c !== "string" || !/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(c)) fail(400, `theme.custom.${k} must be a hex colour`);
                        }
                    }
                }
                const prefs = db.preferences[me.id] || (db.preferences[me.id] = {});
                prefs[body.key] = body.value;
                save();
                return {preferences: prefs};
            }
        }
        if (method === "GET" && parts.length === 1) {
            return paginate(db.users.map((u) => ({...u})), query);
        }
        if (method === "POST" && parts.length === 1) {
            requireRole(["admin"]);
            if (!body || !body.email) fail(400, "Email is required");
            if (!body.password || body.password.length < 8) fail(400, "Password must be at least 8 characters");
            if (!ROLES.includes(body.role || "viewer")) fail(400, `Invalid role: ${body.role}`);
            if (db.users.some((u) => u.email === body.email)) fail(400, "User already exists");
            const roleRow = body.role_id != null
                ? (db.roles || []).find((r) => r.id === Number(body.role_id))
                : (db.roles || []).find((r) => r.slug === (body.role || "viewer"));
            const created = {
                id: db.nextUserId++,
                email: body.email,
                role: roleRow ? roleRow.slug : (body.role || "viewer"),
                role_id: roleRow ? roleRow.id : null,
                display_name: body.display_name || null,
                avatar_url: null,
                phone: body.phone || null,
                totp_enabled: false,
                last_login_at: null,
                is_active: true,
                created_at: new Date().toISOString(),
            };
            db.users.push(created);
            logAudit("user.create", "user", created.id, {email: created.email, role: created.role});
            notifyEvent("user_created", "User created", `User ${created.email} (${created.role}) was created.`, "info", "/users");
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
                if (body && body.role_id != null) {
                    const roleRow = (db.roles || []).find((r) => r.id === Number(body.role_id));
                    if (!roleRow) fail(400, `Role id ${body.role_id} not found`);
                    body.role = roleRow.slug;
                    user.role_id = roleRow.id;
                } else if (body && body.role) {
                    const roleRow = (db.roles || []).find((r) => r.slug === body.role);
                    user.role_id = roleRow ? roleRow.id : null;
                }
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

    // ---- Global search (v2.3) ---------------------------------------------
    if (method === "GET" && path === "/search") {
        const q = (query.get("q") || "").trim().toLowerCase();
        if (!q) return {licenses: [], products: [], users: []};
        const matches = (s) => (s || "").toLowerCase().includes(q);
        const licenses = db.licenses
            .filter((l) => matches(l.key) || matches(l.product) || matches(l.owner_email))
            .slice(0, 5)
            .map((l) => ({type: "license", id: l.id, title: l.key, subtitle: l.product, link: "/licenses"}));
        const products = db.products
            .filter((p) => matches(p.name) || matches(p.slug))
            .slice(0, 5)
            .map((p) => ({type: "product", id: p.id, title: p.name, subtitle: p.slug, link: "/products"}));
        const users = (currentUser().role === "admin" || currentUser().role === "manager")
            ? db.users.filter((u) => matches(u.email)).slice(0, 5).map((u) => ({type: "user", id: u.id, title: u.email, subtitle: u.role, link: "/users"}))
            : [];
        return {licenses, products, users};
    }

    // ---- Roles (v2.3) -------------------------------------------------------
    if (parts[0] === "roles") {
        if (method === "GET" && parts.length === 2 && parts[1] === "permissions") {
            // Same shape as the real backend (GET /roles/permissions returns
            // a bare array, response_model=list[str]): the Roles page reads
            // it with Array.isArray, and a wrapped {permissions: [...]}
            // object silently produced an empty checklist (v2.3.1 defect).
            return ["api_keys:create", "api_keys:write", "audit:delete", "audit:read", "blacklist:write", "dashboard:read", "downloads:read", "email:write", "languages:write", "licenses:create", "licenses:delete", "licenses:renew", "licenses:write", "notifications:write", "products:write", "roles:write", "security:captcha", "security:license-locking", "security:twofa-model", "settings:write", "sms:read", "sms:write", "system:check-expiring", "system:update", "system:update-check", "telegram:write", "users:write"];
        }
        if (method === "GET" && parts.length === 1) {
            requireRole(["admin"]);
            return [...(db.roles || [])];
        }
        if (method === "POST" && parts.length === 1) {
            requireRole(["admin"]);
            if (!body || !body.name) fail(400, "Role name is required");
            const slug = body.slug || body.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
            if ((db.roles || []).some((r) => r.slug === slug)) fail(400, "Role slug already exists");
            const created = {
                id: db.nextRoleId++,
                name: body.name,
                slug,
                description: body.description || null,
                permissions: (body.permissions || []).filter((p) => typeof p === "string"),
                is_builtin: false,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            };
            db.roles.push(created);
            logAudit("role.create", "role", created.id, {name: created.name});
            save();
            return {...created};
        }
        if (parts.length === 2 && /^\d+$/.test(parts[1])) {
            requireRole(["admin"]);
            const id = Number(parts[1]);
            const role = (db.roles || []).find((r) => r.id === id);
            if (!role) fail(404, "Role not found");
            if (method === "GET") return {...role};
            if (method === "PUT") {
                if (role.is_builtin && body && body.slug && body.slug !== role.slug) fail(400, "Built-in roles cannot be renamed");
                if (body && body.name) role.name = body.name;
                if (body && body.description !== undefined) role.description = body.description;
                if (body && body.permissions) role.permissions = body.permissions.filter((p) => typeof p === "string");
                role.updated_at = new Date().toISOString();
                logAudit("role.update", "role", id, {name: role.name});
                save();
                return {...role};
            }
            if (method === "DELETE") {
                if (role.is_builtin) fail(400, "Built-in roles cannot be deleted");
                if (db.users.some((u) => u.role_id === id)) fail(400, "Cannot delete role: users are assigned to it");
                db.roles = db.roles.filter((r) => r.id !== id);
                logAudit("role.delete", "role", id, {name: role.name});
                save();
                return {message: "Role deleted"};
            }
        }
    }

    // ---- Two-factor auth, demo mode (v2.3) ----------------------------------
    if (parts[0] === "auth" && parts[1] === "2fa") {
        const me = currentUser();
        if (method === "GET" && parts[2] === "status") {
            return {enabled: !!me.totp_enabled, backup_codes_remaining: me.totp_enabled ? 8 : 0};
        }
        if (method === "POST" && parts[2] === "setup") {
            if (me.totp_enabled) fail(400, "2FA is already enabled");
            return {
                secret: DEMO_2FA_SECRET,
                otpauth_url: `otpauth://totp/LicenseManagerPro:${me.email}?secret=${DEMO_2FA_SECRET}&issuer=LicenseManagerPro`,
                qr_data_url: "",
            };
        }
        if (method === "POST" && parts[2] === "verify") {
            if (body && String(body.code).trim() === DEMO_2FA_CODE) {
                me.totp_enabled = true;
                logAudit("user.2fa_enable", "user", me.id, null);
                save();
                return {backup_codes: ["DEMO-BACKUP-1", "DEMO-BACKUP-2", "DEMO-BACKUP-3", "DEMO-BACKUP-4", "DEMO-BACKUP-5", "DEMO-BACKUP-6", "DEMO-BACKUP-7", "DEMO-BACKUP-8"]};
            }
            fail(400, "Invalid verification code");
        }
        if (method === "POST" && parts[2] === "disable") {
            if (!me.totp_enabled) fail(400, "2FA is not enabled");
            if (body && String(body.code).trim() !== DEMO_2FA_CODE) fail(400, "Invalid verification code");
            me.totp_enabled = false;
            logAudit("user.2fa_disable", "user", me.id, null);
            save();
            return {message: "Two-factor authentication disabled"};
        }
    }
    if (method === "POST" && path === "/auth/verify-2fa") {
        if (body && String(body.code).trim() === DEMO_2FA_CODE) {
            return {access_token: "demo-token", token_type: "bearer"};
        }
        fail(401, "Invalid verification code");
    }

    // ---- License security (v2.3) --------------------------------------------
    if (parts[0] === "settings" && parts[1] === "license-security") {
        if (method === "GET" && parts.length === 2) {
            return {...(db.licenseSecurity || {})};
        }
        if (method === "PUT" && parts.length === 2) {
            requireRole(["admin", "manager"]);
            const next = {...(db.licenseSecurity || {}), ...(body || {})};
            if (next.strictness && !["strict", "lenient"].includes(next.strictness)) {
                fail(400, "strictness must be 'strict' or 'lenient'");
            }
            if (next.missing_lock_behavior && !["deny", "allow"].includes(next.missing_lock_behavior)) {
                fail(400, "missing_lock_behavior must be 'deny' or 'allow'");
            }
            db.licenseSecurity = next;
            logAudit("setting.update", "setting", "license_security", {value: next});
            save();
            return {...next};
        }
    }

    // ---- Settings -----------------------------------------------------------
    // v3.0: predefined settings only — PUT rejects unknown keys (404) and
    // system-managed keys (400); there is no DELETE endpoint any more.
    if (parts[0] === "settings" && parts[1] === "captcha-config") {
        if (method === "GET" && parts.length === 2) {
            requireRole(["admin", "manager"]);
            return publicCaptchaConfig();
        }
        if (method === "PUT" && parts.length === 2) {
            requireRole(["admin", "manager"]);
            const patch = body || {};
            if (patch.type != null && !CAPTCHA_TYPES.includes(patch.type)) fail(400, "captcha type must be off, custom, recaptcha-v2 or recaptcha-v3");
            if (patch.model != null && !CAPTCHA_MODELS.includes(patch.model)) fail(400, "captcha model must be math, text or reverse");
            if (patch.v3_threshold != null && (Number.isNaN(Number(patch.v3_threshold)) || Number(patch.v3_threshold) < 0 || Number(patch.v3_threshold) > 1)) fail(400, "v3_threshold must be a number between 0 and 1");
            const cfg = captchaConfig();
            if (patch.type != null) cfg.type = patch.type;
            if (patch.model != null) cfg.model = patch.model;
            if (patch.site_key != null) cfg.site_key = String(patch.site_key).slice(0, 200);
            if (patch.secret_key != null) {
                if (patch.secret_key === "__CLEAR__") cfg.secret_key = "";
                else if (patch.secret_key !== "") cfg.secret_key = String(patch.secret_key).slice(0, 500);
            }
            if (patch.v3_threshold != null) cfg.v3_threshold = Math.min(1, Math.max(0, Number(patch.v3_threshold)));
            db.settings.captcha_config = JSON.stringify(cfg);
            logAudit("setting.update", "setting", "captcha_config", {value: publicCaptchaConfig()});
            save();
            return publicCaptchaConfig();
        }
    }
    // Specific config routes (sms/email/telegram/notification-channels,
    // handled below) must not be swallowed by this generic single-setting
    // block — it runs first in the file.
    const CONFIG_ROUTES = ["sms-config", "email-config", "telegram-config", "notification-channels"];
    if (parts[0] === "settings" && !CONFIG_ROUTES.includes(parts[1])) {
        if (method === "GET" && parts.length === 1) {
            const {captcha_config: _hidden, sms_config: _sms, email_config: _email, telegram_config: _tg, ...rest} = db.settings;
            return {...rest};
        }
        if (parts.length === 2) {
            const key = decodeURIComponent(parts[1]);
            if (key === "captcha_config") fail(404, "Setting not found");
            if (method === "GET") {
                if (!(key in db.settings)) fail(404, "Setting not found");
                return {key, value: db.settings[key]};
            }
            if (method === "PUT") {
                requireRole(["admin", "manager"]);
                // v3.0.4: the 2FA MODEL is a global policy set ONLY by the
                // main admin — a manager holds settings:write but gets 403.
                if (key === "twofa_channel" && currentUser().role !== "admin") fail(403, "Only the main admin can change the 2FA model");
                if (SYSTEM_MANAGED_SETTINGS.includes(key)) fail(400, `Setting '${key}' is managed by the system and cannot be edited`);
                if (!EDITABLE_SETTINGS.includes(key)) fail(404, "Setting not found");
                validateSettingValue(key, body && body.value !== undefined ? body.value : "");
                let value = String(body && body.value !== undefined ? body.value : "");
                if (key === "system_encoding") value = value.toLowerCase();
                db.settings[key] = value;
                logAudit("setting.update", "setting", key, {value: db.settings[key]});
                save();
                return {key, value: db.settings[key]};
            }
        }
    }

    // ---- SMS / Email / Telegram configs + notification channels (v3.0) ----
    if (parts[0] === "settings" && parts[1] === "sms-config") {
        if (method === "GET" && parts.length === 2) {
            requireRole(["admin", "manager"]);
            return publicSmsConfig();
        }
        if (method === "PUT" && parts.length === 2) {
            requireRole(["admin", "manager"]);
            const patch = body || {};
            const cfg = smsConfig();
            if (patch.active_provider != null) {
                if (!["", ...SMS_PROVIDERS].includes(patch.active_provider)) fail(400, `Unknown SMS provider: ${patch.active_provider}`);
                cfg.active_provider = patch.active_provider;
            }
            for (const [name, fields] of Object.entries(patch.providers || {})) {
                if (!SMS_PROVIDERS.includes(name)) fail(400, `Unknown SMS provider: ${name}`);
                for (const [field, value] of Object.entries(fields || {})) {
                    // "configured" is a read-only computed flag the GET
                    // response adds; the UI echoes the whole provider object
                    // back on save, so ignore it here (as the real backend
                    // does with unknown read-only fields).
                    if (field === "configured") continue;
                    if (!SMS_PROVIDER_FIELDS[name].includes(field)) fail(400, `Unknown field ${field} for provider ${name}`);
                    if (value === "__CLEAR__") delete cfg.providers[name][field];
                    else if (value !== "" && value != null) cfg.providers[name][field] = String(value);
                }
            }
            db.settings.sms_config = JSON.stringify(cfg);
            logAudit("setting.update", "setting", "sms_config", {active_provider: cfg.active_provider});
            save();
            return publicSmsConfig();
        }
    }
    if (parts[0] === "settings" && parts[1] === "email-config") {
        if (method === "GET" && parts.length === 2) {
            requireRole(["admin", "manager"]);
            return publicEmailConfig();
        }
        if (method === "PUT" && parts.length === 2) {
            requireRole(["admin", "manager"]);
            const patch = body || {};
            const cfg = emailConfig();
            if (patch.reset_templates) {
                delete cfg.templates;
                delete cfg.signature;
            }
            for (const key of ["smtp_host", "username", "from_address", "from_name", "signature"]) {
                if (patch[key] != null) cfg[key] = String(patch[key]);
            }
            if (patch.smtp_port != null) {
                const port = Number(patch.smtp_port);
                if (!Number.isInteger(port) || port < 1 || port > 65535) fail(400, "smtp_port must be 1-65535");
                cfg.smtp_port = port;
            }
            if (patch.encryption != null) {
                if (!["none", "tls", "ssl"].includes(patch.encryption)) fail(400, "encryption must be none, tls or ssl");
                cfg.encryption = patch.encryption;
            }
            if (patch.password != null) {
                if (patch.password === "__CLEAR__") cfg.password = "";
                else if (patch.password !== "") cfg.password = String(patch.password);
            }
            if (patch.templates != null) {
                const stored = cfg.templates || {};
                for (const [name, tpl] of Object.entries(patch.templates)) {
                    if (!(name in DEFAULT_TEMPLATES)) fail(400, `Unknown template: ${name}`);
                    stored[name] = {subject: String(tpl.subject || ""), body: String(tpl.body || "")};
                }
                cfg.templates = stored;
            }
            db.settings.email_config = JSON.stringify(cfg);
            logAudit("setting.update", "setting", "email_config", {});
            save();
            return publicEmailConfig();
        }
    }
    if (parts[0] === "settings" && parts[1] === "telegram-config") {
        if (method === "GET" && parts.length === 2) {
            requireRole(["admin", "manager"]);
            return publicTelegramConfig();
        }
        if (method === "PUT" && parts.length === 2) {
            requireRole(["admin", "manager"]);
            const patch = body || {};
            const cfg = telegramConfig();
            if (patch.bot_token != null) {
                if (patch.bot_token === "__CLEAR__") cfg.bot_token = "";
                else if (patch.bot_token !== "") cfg.bot_token = String(patch.bot_token);
            }
            if (patch.chat_ids != null) {
                let ids = patch.chat_ids;
                if (typeof ids === "string") ids = ids.split(",").map((s) => s.trim()).filter(Boolean);
                if (!Array.isArray(ids)) fail(400, "chat_ids must be a list of chat IDs");
                cfg.chat_ids = ids.map(String);
            }
            db.settings.telegram_config = JSON.stringify(cfg);
            logAudit("setting.update", "setting", "telegram_config", {chat_ids: cfg.chat_ids});
            save();
            return publicTelegramConfig();
        }
        if (method === "POST" && parts.length === 3 && parts[2] === "test") {
            requireRole(["admin", "manager"]);
            const cfg = telegramConfig();
            // Demo: no real Telegram call — "sent" when a token + chats exist.
            const sent = Boolean(cfg.bot_token) && cfg.chat_ids.length > 0;
            logAudit(`notify.telegram_${sent ? "sent" : "failed"}`, "notification", null, {event: "telegram_test", channel: "telegram", to: ""}, "system");
            save();
            return {sent};
        }
    }
    if (parts[0] === "settings" && parts[1] === "notification-channels") {
        if (method === "GET" && parts.length === 2) {
            requireRole(["admin", "manager"]);
            return notificationChannels();
        }
        if (method === "PUT" && parts.length === 2) {
            requireRole(["admin"]); // admin-only: managers can read, not change
            const patch = body || {};
            for (const event of Object.keys(patch)) {
                if (!NOTIFY_EVENTS.includes(event)) fail(400, `Unknown notification event: ${event}`);
                for (const channel of Object.keys(patch[event] || {})) {
                    if (!NOTIFY_CHANNELS.includes(channel)) fail(400, `Unknown channel: ${channel}`);
                }
            }
            db.settings.notification_channels = JSON.stringify(patch);
            logAudit("setting.update", "setting", "notification_channels", {});
            save();
            return notificationChannels();
        }
    }

    // ---- Audit logs ---------------------------------------------------------
    if (parts[0] === "audit-logs" && method === "GET" && parts.length === 1) {
        requireRole(["admin", "manager"]);
        const entity = query.get("entity");
        const actor = query.get("actor");
        const channel = query.get("channel");
        let list = [...(db.audit_logs || [])];
        if (entity) list = list.filter((l) => l.entity === entity);
        if (actor) list = list.filter((l) => (l.actor_email || "").toLowerCase().includes(actor.toLowerCase()));
        if (channel) {
            const prefixes = {email: "notify.email_", sms: "notify.sms_", telegram: "notify.telegram_", twofa: "twofa.", system: "service_status."};
            if (!(channel in prefixes)) fail(400, `Unknown channel: ${channel}`);
            list = list.filter((l) => (l.action || "").startsWith(prefixes[channel]));
        }
        return paginate(list, query);
    }
    // v3.0: single delete + clear-all (admin only).
    if (parts[0] === "audit-logs" && method === "DELETE" && parts.length === 2) {
        requireRole(["admin"]);
        const id = Number(parts[1]);
        const before = (db.audit_logs || []).length;
        db.audit_logs = (db.audit_logs || []).filter((l) => l.id !== id);
        if (db.audit_logs.length === before) fail(404, `Audit log ${id} not found`);
        save();
        return {message: `Activity history entry ${id} deleted successfully`};
    }
    if (parts[0] === "audit-logs" && method === "DELETE" && parts.length === 1) {
        requireRole(["admin"]);
        const count = (db.audit_logs || []).length;
        db.audit_logs = [];
        save();
        return {message: `Deleted ${count} activity history entr${count === 1 ? "y" : "ies"}`, deleted: count};
    }

    // ---- System -------------------------------------------------------------
    if (method === "GET" && path === "/system/maintenance") {
        return {enabled: db.settings.maintenance_mode === "on", message: db.settings.maintenance_message || ""};
    }
    // v3.0: service status (demo — simulated from configuration: a service
    // with credentials configured shows connected; the demo has no live
    // network, so nothing is really probed).
    if (method === "GET" && path === "/system/service-status") {
        requireRole(["admin"]);
        const emailCfg = emailConfig();
        const smsCfg = smsConfig();
        const tgCfg = telegramConfig();
        const services = [
            {key: "database", label: "Database", status: "connected", detail: "Query answered (demo)"},
            {key: "email", label: "Email (SMTP)", status: emailCfg.smtp_host ? "connected" : "not_configured", detail: emailCfg.smtp_host ? `Connected to ${emailCfg.smtp_host} (demo)` : "No SMTP host configured"},
            {key: "sms", label: `SMS (${smsCfg.active_provider || "none"})`, status: smsCfg.active_provider ? "connected" : "not_configured", detail: smsCfg.active_provider ? `${smsCfg.active_provider} reachable (demo)` : "No SMS provider active"},
            {key: "telegram", label: "Telegram bot", status: tgCfg.bot_token ? "connected" : "not_configured", detail: tgCfg.bot_token ? "Bot OK (demo)" : "No bot token configured"},
            {key: "github", label: "GitHub (updates)", status: "connected", detail: "GitHub reachable (demo)"},
        ];
        return {services, checked_at: new Date().toISOString()};
    }
    // v3.0: ippanel SMS balance + test-send (demo: clearly mocked — the
    // balance is a fixed demo number, marked demo:true; no real SMS is
    // ever sent from the demo). Both the bare path and the /api-prefixed
    // path are accepted: Dashboard calls /sms/balance, Settings calls
    // /api/sms/test.
    if (method === "GET" && (path === "/sms/balance" || path === "/api/sms/balance")) {
        requireRole(["admin"]);
        const cfg = smsConfig();
        const ip = cfg.providers.ippanel || {};
        const base = {provider: "ippanel", configured: Boolean((ip.api_key || "").trim()), active: cfg.active_provider === "ippanel", available: false, credit: null, unit: "rial", checked_at: null, cached: false, error: null, demo: true};
        if (!base.configured) return {...base, error: "not_configured"};
        return {...base, available: true, credit: 1250000, checked_at: new Date().toISOString()};
    }
    if (method === "POST" && (path === "/sms/test" || path === "/api/sms/test")) {
        requireRole(["admin"]);
        const cfg = smsConfig();
        const sent = Boolean(cfg.active_provider);
        logAudit(`notify.sms_${sent ? "sent" : "failed"}`, "notification", null, {event: "sms_test", channel: "sms", to: (body && body.to) || ""}, "system");
        save();
        return {sent, provider: cfg.active_provider || ""};
    }
    // v3.0: sending stats — per-day, per-channel sent/failed counts
    // aggregated from the demo audit-log channel stream.
    if (method === "GET" && path === "/system/sending-stats") {
        requireRole(["admin"]);
        const days = Math.min(90, Math.max(1, Number(query.get("days")) || 14));
        const dates = [];
        const today = new Date();
        for (let i = days - 1; i >= 0; i--) {
            const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
            dates.push(d.toISOString().slice(0, 10));
        }
        const channels = ["email", "sms", "telegram"];
        const series = {};
        for (const ch of [...channels, "total"]) {
            series[ch] = dates.map((date) => ({date, sent: 0, failed: 0}));
        }
        const index = Object.fromEntries(dates.map((d, i) => [d, i]));
        for (const row of db.audit_logs || []) {
            const match = String(row.action || "").match(/^(?:notify|twofa)\.(\w+)_(sent|failed)$/);
            if (!match) continue;
            const [, channel, outcome] = match;
            if (!channels.includes(channel)) continue;
            const day = String(row.created_at || "").slice(0, 10);
            if (!(day in index)) continue;
            series[channel][index[day]][outcome] += 1;
            series.total[index[day]][outcome] += 1;
        }
        return {days, dates, series};
    }
    if (method === "GET" && path === "/news") {
        // v3.0.5: seeded items mirror the repo-root news.json (same ids,
        // titles, bodies and dates). The Dashboard in demo mode tries the
        // live file from raw.githubusercontent.com first and falls back
        // to these when offline.
        return {items: NEWS_ITEMS};
    }
    if (method === "GET" && path === "/system/info") {
        // v3.0: version comes from code (APP_VERSION), never from settings.
        // v3.0.2: full stack. DEMO values only — the real stack versions
        // this project targets (Python 3.12, FastAPI 0.165.0, SQLAlchemy
        // 2.0.36, Pydantic 2.14.4, MySQL 8), shown as demo data, never
        // presented as a live measurement of the machine serving the demo.
        return {version: APP_VERSION, lastUpdated: db.settings.last_updated, panel_domain: db.settings.panel_domain || "",
            python_version: "3.12", fastapi_version: "0.165.0", sqlalchemy_version: "2.0.36", pydantic_version: "2.14.4",
            database_engine: "mysql", database_version: "8.0.36", os: "Linux x86_64"};
    }
    if (method === "GET" && path === "/system/check-updates") {
        return {updateAvailable: db.settings.latest_version !== APP_VERSION, currentVersion: APP_VERSION, latestVersion: db.settings.latest_version};
    }
    if (method === "GET" && path === "/system/update-check") {
        // The demo has no newer release: it is always up to date.
        return {
            current_version: APP_VERSION,
            latest_version: db.settings.latest_version,
            update_available: db.settings.latest_version !== APP_VERSION,
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
