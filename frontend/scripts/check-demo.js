#!/usr/bin/env node
/**
 * Demo-mock checks — plain node, no dependencies.
 * Loads frontend/src/utils/demoData.js (stripping its ESM import/export
 * syntax), stubs localStorage, and exercises the v2.1 demo flows:
 * pagination shape, audit-log seeding/filtering/appending, and the
 * backward-compatible plain-array responses.
 *
 * Usage: node scripts/check-demo.js   (or: npm run check-demo)
 */
const fs = require("fs");
const path = require("path");

// ---- minimal localStorage stub (demoData persists its DB there) ----
const store = {};
global.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};

// ---- load demoData.js as a plain script ----
let src = fs.readFileSync(path.join(__dirname, "..", "src", "utils", "demoData.js"), "utf8");
src = src.replace(/^import \{DEMO_MODE\} from "\.\.\/config";.*$/m, "const DEMO_MODE = true;");
// v3.0.5: demoData imports the shared version constant — resolve it from
// version.js (single source of truth) instead of hard-coding it here.
const versionSrc = fs.readFileSync(path.join(__dirname, "..", "src", "version.js"), "utf8");
const versionMatch = versionSrc.match(/APP_VERSION = "([^"]+)"/);
const APP_VERSION_VALUE = versionMatch ? versionMatch[1] : "unknown";
src = src.replace(/^import \{APP_VERSION\} from "\.\.\/version";.*$/m, `const APP_VERSION = ${JSON.stringify(APP_VERSION_VALUE)};`);
src = src.replace(/^export \{DEMO_MODE\};.*$/m, "");
src = src.replace(/^export const /gm, "const ");
src = src.replace(/^export async function /gm, "async function ");
src = src.replace(/^export function /gm, "function ");
const load = new Function(`${src}\nreturn {mockRequest, resetDemoData};`);
const {mockRequest, resetDemoData} = load();

let passed = 0;
let failed = 0;
function check(name, cond, extra) {
  if (cond) {
    passed++;
    console.log(`  ok  ${name}`);
  } else {
    failed++;
    console.error(`  FAIL ${name}${extra ? ` — ${extra}` : ""}`);
  }
}

(async () => {
  console.log("Demo mock checks (v3.0 flows):");
  resetDemoData();

  // 1. Seed versions bumped to 3.0.6
  const settings = await mockRequest("GET", "/settings");
  check("seed app_version is 3.0.6", settings.app_version === "3.0.6", JSON.stringify(settings.app_version));
  check("seed latest_version is 3.0.6", settings.latest_version === "3.0.6", JSON.stringify(settings.latest_version));
  check("seed branding settings present", settings.site_name === "License Manager Pro" && settings.logo_url === "./logo.svg", JSON.stringify(settings.site_name));

  // 1b. v3.0.6: "/api/..." callers must hit the bare-path routes — the
  // router used to compare the raw path, so GET /api/captcha/config
  // 404'd on every login-page load ("Demo API has no route"). The public
  // config must return type/model and never the secret key.
  const pubCaptcha = await mockRequest("GET", "/api/captcha/config");
  check("GET /api/captcha/config routes (bare-path fix) + no secret", pubCaptcha && typeof pubCaptcha.type === "string" && typeof pubCaptcha.model === "string" && !("secret_key" in pubCaptcha), JSON.stringify(pubCaptcha));
  const pubCaptchaBare = await mockRequest("GET", "/captcha/config");
  check("GET /captcha/config (bare) agrees", pubCaptchaBare && pubCaptchaBare.type === pubCaptcha.type && pubCaptchaBare.model === pubCaptcha.model, JSON.stringify(pubCaptchaBare));

  // 2. Seed counts kept: 3 products / 8 licenses / 4 role users
  const productsAll = await mockRequest("GET", "/products");
  check("seed has 3 products", Array.isArray(productsAll) && productsAll.length === 3, JSON.stringify(productsAll && productsAll.length));
  const licensesAll = await mockRequest("GET", "/licenses?filter=all");
  check("seed has 8 licenses", Array.isArray(licensesAll) && licensesAll.length === 8, JSON.stringify(licensesAll && licensesAll.length));
  const usersAll = await mockRequest("GET", "/users");
  check("seed has 4 users", Array.isArray(usersAll) && usersAll.length === 4, JSON.stringify(usersAll && usersAll.length));

  // 3. Pagination: products first page
  const p1 = await mockRequest("GET", "/products?skip=0&limit=2");
  check("products page 1: 2 items, total 3", p1.items && p1.items.length === 2 && p1.total === 3, JSON.stringify(p1));
  // 4. Pagination: products second page
  const p2 = await mockRequest("GET", "/products?skip=2&limit=2");
  check("products page 2: 1 item, total 3", p2.items && p2.items.length === 1 && p2.total === 3, JSON.stringify(p2));
  // 5. Pagination: licenses full page
  const l1 = await mockRequest("GET", "/licenses?filter=all&skip=0&limit=10");
  check("licenses page 1: 8 items, total 8", l1.items && l1.items.length === 8 && l1.total === 8, JSON.stringify(l1 && l1.total));
  // 6. Pagination: licenses second slice
  const l2 = await mockRequest("GET", "/licenses?filter=all&skip=5&limit=5");
  check("licenses skip=5 limit=5: 3 items, total 8", l2.items && l2.items.length === 3 && l2.total === 8, JSON.stringify(l2 && l2.items && l2.items.length));
  // 7. Pagination: api-keys shape
  const k1 = await mockRequest("GET", "/api-keys?skip=0&limit=2");
  check("api-keys page 1: 2 keys, total 3", k1.api_keys && k1.api_keys.length === 2 && k1.total === 3, JSON.stringify(k1));
  // 8. Pagination: users
  const u1 = await mockRequest("GET", "/users?skip=0&limit=10");
  check("users page 1: 4 items, total 4", u1.items && u1.items.length === 4 && u1.total === 4, JSON.stringify(u1 && u1.total));

  // 9. Audit logs seeded with the full contract shape: 5 legacy rows +
  // 11 per-channel send rows (v3.0 per-channel logs), 16 total.
  const a1 = await mockRequest("GET", "/audit-logs?skip=0&limit=10");
  const row = a1.items && a1.items[0];
  const shapeOk = row && ["id", "actor_email", "action", "entity", "entity_id", "details", "created_at"].every((f) => f in row);
  const allShapeOk = (a1.items || []).every((r) => ["id", "actor_email", "action", "entity", "entity_id", "details", "created_at"].every((f) => f in r));
  check("audit logs seeded (16 rows: 5 legacy + 11 channel) with contract fields", a1.items && a1.items.length === 10 && a1.total === 16 && shapeOk && allShapeOk, JSON.stringify(a1 && a1.total));
  // 9b. Channel filter separates the streams (v3.0 per-channel logs).
  const aEmail = await mockRequest("GET", "/audit-logs?channel=email&skip=0&limit=50");
  check("audit logs channel=email returns only email rows", aEmail.items && aEmail.items.length > 0 && aEmail.items.every((r) => (r.action || "").startsWith("notify.email_")), JSON.stringify(aEmail && aEmail.total));
  const aSms = await mockRequest("GET", "/audit-logs?channel=sms&skip=0&limit=50");
  check("audit logs channel=sms returns only sms rows", aSms.items && aSms.items.length > 0 && aSms.items.every((r) => (r.action || "").startsWith("notify.sms_")), JSON.stringify(aSms && aSms.total));
  // 10. Audit logs: entity filter
  const aLic = await mockRequest("GET", "/audit-logs?entity=license&skip=0&limit=10");
  check("audit logs entity=license filters", aLic.items && aLic.items.length > 0 && aLic.items.every((r) => r.entity === "license"), JSON.stringify(aLic && aLic.total));
  // 11. Audit logs: actor filter
  const aMgr = await mockRequest("GET", "/audit-logs?actor=manager@demo.com&skip=0&limit=10");
  check("audit logs actor filter matches", aMgr.items && aMgr.items.length === 1 && aMgr.items[0].actor_email === "manager@demo.com", JSON.stringify(aMgr && aMgr.total));

  // 12. Mutation appends product.create
  const before = (await mockRequest("GET", "/audit-logs?skip=0&limit=1")).total;
  const createdProduct = await mockRequest("POST", "/products", {name: "AuditTest", billing_cycles: ["monthly"]});
  const afterCreate = await mockRequest("GET", "/audit-logs?skip=0&limit=1");
  check("product create appends audit row", afterCreate.total === before + 1 && afterCreate.items[0].action === "product.create" && afterCreate.items[0].entity_id === createdProduct.id, JSON.stringify(afterCreate.items && afterCreate.items[0]));

  // 13. Mutation appends license.create — the notify() path appends
  // notify.email_sent rows AFTER the license.create row, so the create row
  // is no longer the newest; it must still be present, and the notify row
  // for the event must exist too.
  const createdLicense = await mockRequest("POST", "/licenses", {product_id: 1, billing_cycle: "annual", owner_email: "audit@example.com"});
  const afterLic = await mockRequest("GET", "/audit-logs?skip=0&limit=5");
  const licRow = (afterLic.items || []).find((r) => r.action === "license.create" && r.entity_id === createdLicense.id);
  const licNotify = (afterLic.items || []).find((r) => r.action === "notify.email_sent" && r.details && r.details.event === "license_created");
  check("license create appends audit row", !!licRow, JSON.stringify(afterLic.items && afterLic.items[0]));
  check("license create triggers email notify row", !!licNotify, JSON.stringify(afterLic.items && afterLic.items.map((r) => r.action)));

  // 14. Mutation appends license.delete
  await mockRequest("DELETE", `/licenses/${createdLicense.id}`);
  const afterDel = await mockRequest("GET", "/audit-logs?skip=0&limit=1");
  check("license delete appends audit row", afterDel.items[0].action === "license.delete" && afterDel.items[0].entity_id === createdLicense.id, JSON.stringify(afterDel.items && afterDel.items[0]));

  // 15. Mutation appends setting.update
  await mockRequest("PUT", "/settings/daily_request_limit", {value: "200"});
  const afterSet = await mockRequest("GET", "/audit-logs?skip=0&limit=1");
  check("settings change appends audit row", afterSet.items[0].action === "setting.update" && afterSet.items[0].entity === "setting", JSON.stringify(afterSet.items && afterSet.items[0]));

  // 16. User create + role_change + delete append audit rows — same
  // notify-after-create ordering as licenses (see 13).
  const createdUser = await mockRequest("POST", "/users", {email: "audituser@example.com", password: "password123", role: "viewer"});
  const afterUser = await mockRequest("GET", "/audit-logs?skip=0&limit=5");
  const userRow = (afterUser.items || []).find((r) => r.action === "user.create" && r.entity_id === createdUser.id);
  check("user create appends audit row", !!userRow, JSON.stringify(afterUser.items && afterUser.items[0]));
  await mockRequest("PUT", `/users/${createdUser.id}`, {role: "support"});
  const afterRole = await mockRequest("GET", "/audit-logs?skip=0&limit=1");
  check("user role change appends user.role_change row", afterRole.items[0].action === "user.role_change", JSON.stringify(afterRole.items && afterRole.items[0]));
  await mockRequest("DELETE", `/users/${createdUser.id}`);
  const afterUserDel = await mockRequest("GET", "/audit-logs?skip=0&limit=1");
  check("user delete appends audit row", afterUserDel.items[0].action === "user.delete", JSON.stringify(afterUserDel.items && afterUserDel.items[0]));

  // 17. Backward compat: no skip/limit -> plain array
  const licPlain = await mockRequest("GET", "/licenses?filter=all");
  check("licenses without pagination still returns a plain array", Array.isArray(licPlain), typeof licPlain);
  const prodPlain = await mockRequest("GET", "/products");
  check("products without pagination still returns a plain array", Array.isArray(prodPlain), typeof prodPlain);

  // 18. Demo login still maps the 4 seeded emails to their roles
  await mockRequest("POST", "/auth/login", {email: "viewer@demo.com"});
  const me = await mockRequest("GET", "/users/me");
  check("demo login maps viewer@demo.com to viewer role", me.email === "viewer@demo.com" && me.role === "viewer", JSON.stringify(me));

  // 19. v2.2: product groups seeded + group filter + delete guard
  await mockRequest("POST", "/auth/login", {email: "demo@demo.com"});
  const groups = await mockRequest("GET", "/product-groups");
  check("seed has 2 product groups", Array.isArray(groups) && groups.length === 2, JSON.stringify(groups && groups.length));
  const grouped = await mockRequest("GET", "/products?group_id=1");
  check("products group_id=1 returns 2 products", Array.isArray(grouped) && grouped.length === 2, JSON.stringify(grouped && grouped.length));
  const slugged = await mockRequest("GET", "/products?slug=cloudpanel-pro");
  check("products slug lookup returns CloudPanel Pro", Array.isArray(slugged) && slugged.length === 1 && slugged[0].name === "CloudPanel Pro", JSON.stringify(slugged && slugged.length));
  let guardHit = false;
  try { await mockRequest("DELETE", "/product-groups/1"); } catch (e) { guardHit = e.status === 400; }
  check("deleting a group with products is rejected (400)", guardHit);
  const newGroup = await mockRequest("POST", "/product-groups", {name: "Test Group"});
  check("product group create works", newGroup && newGroup.slug === "test-group", JSON.stringify(newGroup && newGroup.slug));
  await mockRequest("DELETE", `/product-groups/${newGroup.id}`);
  check("empty product group deletes", true);

  // 20. v2.2: 14-day trend (estimated MRR removed in v3.0.0 — not a
  // financial system, so the summary carries counts only).
  const summary = await mockRequest("GET", "/dashboard/summary");
  check("dashboard summary has counts, no estimated_mrr", typeof summary.activeLicenses === "number" && typeof summary.inactiveLicenses === "number" && !("estimated_mrr" in summary), JSON.stringify(summary));
  const trend = await mockRequest("GET", "/dashboard/license-trend?days=14");
  check("license trend returns 14 points summing to 5", trend.points && trend.points.length === 14 && trend.points.reduce((a, p) => a + p.count, 0) === 5, JSON.stringify(trend.points && trend.points.reduce((a, p) => a + p.count, 0)));

  // 21. v2.2: notifications seeded (3) + license/user creates appended two
  // more in checks 13 and 16, so 5 total / 4 unread at this point.
  const notes = await mockRequest("GET", "/notifications?limit=10");
  check("notifications seeded + appended (5 total, 4 unread)", notes.total === 5 && notes.unread === 4, JSON.stringify(notes.total));
  await mockRequest("POST", "/licenses", {product_id: 1, billing_cycle: "annual"});
  const notes2 = await mockRequest("GET", "/notifications?limit=10");
  check("license create appends a notification", notes2.total === 6 && notes2.unread === 5, JSON.stringify(notes2.total));
  const readAll = await mockRequest("POST", "/notifications/read-all", {});
  check("read-all marks all read", readAll.message === "5 notification(s) marked as read", JSON.stringify(readAll.message));

  // 22. v2.2: blacklist blocks validate, CIDR included
  await mockRequest("POST", "/blacklist", {type: "ip", value: "203.0.213.0/24", reason: "demo"});
  const licList = await mockRequest("GET", "/licenses?filter=all");
  const blocked = await mockRequest("POST", "/licenses/validate", {key: licList[0].key, ip: "203.0.213.99"});
  check("blacklisted CIDR IP fails validation", blocked.valid === false && blocked.detail === "blocked: blacklisted", JSON.stringify(blocked));
  const clean = await mockRequest("POST", "/licenses/validate", {key: licList[0].key, ip: "198.51.100.7"});
  check("clean IP still validates", clean.valid === true, JSON.stringify(clean.valid));
  const bl = await mockRequest("GET", "/blacklist?type=ip");
  check("blacklist list returns the entry", Array.isArray(bl) && bl.length === 1, JSON.stringify(bl && bl.length));

  // 23. v2.3: downloads + versions (10 modules, direct GitHub release URLs)
  const downloads = await mockRequest("GET", "/downloads");
  check("downloads lists all 10 modules", Array.isArray(downloads) && downloads.length === 10 && downloads.some((d) => d.id === "whmcs") && downloads.some((d) => d.id === "odoo"), JSON.stringify(downloads && downloads.length));
  const whmcsDl = downloads.find((d) => d.id === "whmcs");
  check("download URL is the direct GitHub release asset for v3.0.6", whmcsDl.download_url === "https://github.com/rzatkv/LicenseManagerPro/releases/download/v3.0.6/licensemanagerpro-whmcs-3.0.6.zip", whmcsDl.download_url);
  const versions = await mockRequest("GET", "/downloads/versions");
  check("downloads versions returns all 10 modules at 3.0.6", versions.whmcs && versions.whmcs.local === "3.0.6" && versions.odoo && versions.odoo.latest === "3.0.6", JSON.stringify(versions.whmcs));

  // 24. v2.3: update-check (demo is up to date) + staged update shape
  const upd = await mockRequest("GET", "/system/update-check");
  check("update-check reports up to date in demo", upd.update_available === false && upd.current_version === "3.0.6", JSON.stringify(upd));
  const staged = await mockRequest("POST", "/system/update", {});
  check("update returns staged shape", staged.staged === true && staged.next_step === "bash scripts/update.sh", JSON.stringify(staged));

  // 25. v2.2: reissue + activations (product 3 has max_reissues 1)
  const lic3 = (await mockRequest("GET", "/licenses?filter=all")).find((l) => l.product_id === 3);
  const oldKey = lic3.key;
  const reissued = await mockRequest("POST", `/licenses/${lic3.id}/reissue`, {});
  check("reissue replaces the key and bumps reissue_count", reissued.key !== oldKey && reissued.reissue_count === 1, JSON.stringify(reissued.reissue_count));
  let reissueBlocked = false;
  try { await mockRequest("POST", `/licenses/${lic3.id}/reissue`, {}); } catch (e) { reissueBlocked = e.status === 400; }
  check("second reissue is blocked by max_reissues=1", reissueBlocked);
  const act = await mockRequest("POST", `/licenses/${lic3.id}/activations`, {fingerprint: "fp-check-demo-1", label: "demo-box"});
  check("activation created", act && act.fingerprint === "fp-check-demo-1", JSON.stringify(act && act.fingerprint));
  const acts = await mockRequest("GET", `/licenses/${lic3.id}/activations`);
  check("activations list returns the record", Array.isArray(acts) && acts.length >= 1, JSON.stringify(acts && acts.length));
  await mockRequest("DELETE", `/licenses/${lic3.id}/activations/${act.id}`);
  const actsAfter = await mockRequest("GET", `/licenses/${lic3.id}/activations`);
  check("activation delete frees the slot", Array.isArray(actsAfter) && !actsAfter.some((a) => a.id === act.id), JSON.stringify(actsAfter && actsAfter.length));

  // 26. v2.3: global search
  const searchProducts = await mockRequest("GET", "/search?q=cloudpanel");
  check("search finds the CloudPanel product", searchProducts.products && searchProducts.products.length === 1 && searchProducts.products[0].title === "CloudPanel Pro", JSON.stringify(searchProducts.products));
  const searchEmpty = await mockRequest("GET", "/search?q=");
  check("empty search returns empty groups", searchEmpty.licenses.length === 0 && searchEmpty.products.length === 0 && searchEmpty.users.length === 0, JSON.stringify(searchEmpty));
  const searchLic = await mockRequest("GET", "/search?q=cpn-");
  check("search finds licenses by key prefix", searchLic.licenses.length >= 1 && searchLic.licenses[0].type === "license", JSON.stringify(searchLic.licenses.length));

  // 27. v2.3: roles CRUD + delete guards
  const roles = await mockRequest("GET", "/roles");
  check("roles seed has the 4 built-ins", Array.isArray(roles) && roles.length === 4 && roles.every((r) => r.is_builtin), JSON.stringify(roles && roles.length));
  const perms = await mockRequest("GET", "/roles/permissions");
  check("permissions list includes roles:write", Array.isArray(perms) && perms.includes("roles:write"), JSON.stringify(perms));
  let builtinDelBlocked = false;
  try { await mockRequest("DELETE", "/roles/1"); } catch (e) { builtinDelBlocked = e.status === 400; }
  check("built-in role cannot be deleted", builtinDelBlocked);
  const customRole = await mockRequest("POST", "/roles", {name: "Auditor", permissions: ["audit:read", "downloads:read"]});
  check("custom role created with slug", customRole && customRole.slug === "auditor" && customRole.is_builtin === false, JSON.stringify(customRole && customRole.slug));
  const tempUser = await mockRequest("POST", "/users", {email: "auditor@example.com", password: "password123", role_id: customRole.id});
  check("user created with a custom role_id", tempUser && tempUser.role_id === customRole.id && tempUser.role === "auditor", JSON.stringify(tempUser && tempUser.role));
  let assignedDelBlocked = false;
  try { await mockRequest("DELETE", `/roles/${customRole.id}`); } catch (e) { assignedDelBlocked = e.status === 400; }
  check("role assigned to a user cannot be deleted", assignedDelBlocked);
  await mockRequest("PUT", `/users/${tempUser.id}`, {role: "viewer"});
  await mockRequest("DELETE", `/users/${tempUser.id}`);
  const roleDeleted = await mockRequest("DELETE", `/roles/${customRole.id}`);
  check("role deletes once unassigned", roleDeleted && roleDeleted.message === "Role deleted", JSON.stringify(roleDeleted));

  // 28. v2.3: 2FA demo flow (code 123456)
  const status0 = await mockRequest("GET", "/auth/2fa/status");
  check("2FA starts disabled", status0.enabled === false, JSON.stringify(status0));
  const setup = await mockRequest("POST", "/auth/2fa/setup", {});
  check("2FA setup returns the demo secret", setup.secret === "DEMO2FASECRET" && setup.otpauth_url.includes("DEMO2FASECRET"), JSON.stringify(setup.secret));
  let wrongCodeRejected = false;
  try { await mockRequest("POST", "/auth/2fa/verify", {code: "000000"}); } catch (e) { wrongCodeRejected = e.status === 400; }
  check("wrong 2FA code is rejected", wrongCodeRejected);
  const enabled = await mockRequest("POST", "/auth/2fa/verify", {code: "123456"});
  check("correct demo code enables 2FA with backup codes", Array.isArray(enabled.backup_codes) && enabled.backup_codes.length === 8, JSON.stringify(enabled.backup_codes && enabled.backup_codes.length));
  const status1 = await mockRequest("GET", "/auth/2fa/status");
  check("2FA status reports enabled", status1.enabled === true, JSON.stringify(status1));
  let wrongDisableRejected = false;
  try { await mockRequest("POST", "/auth/2fa/disable", {code: "000000"}); } catch (e) { wrongDisableRejected = e.status === 400; }
  check("disable with a wrong code is rejected", wrongDisableRejected);
  const disabled = await mockRequest("POST", "/auth/2fa/disable", {code: "123456"});
  check("disable with the demo code works", disabled && disabled.message.includes("disabled"), JSON.stringify(disabled));

  // 29. v2.3: license-security config
  const sec0 = await mockRequest("GET", "/settings/license-security");
  check("license security defaults to strict", sec0.strictness === "strict" && sec0.enforce_domain_lock === true, JSON.stringify(sec0.strictness));
  const sec1 = await mockRequest("PUT", "/settings/license-security", {strictness: "lenient", missing_lock_behavior: "allow"});
  check("license security accepts a partial update (merge)", sec1.strictness === "lenient" && sec1.missing_lock_behavior === "allow" && sec1.enforce_domain_lock === true, JSON.stringify(sec1));
  let badStrictnessRejected = false;
  try { await mockRequest("PUT", "/settings/license-security", {strictness: "chaos"}); } catch (e) { badStrictnessRejected = e.status === 400; }
  check("invalid strictness is rejected", badStrictnessRejected);
  await mockRequest("PUT", "/settings/license-security", {strictness: "strict", missing_lock_behavior: "deny"});

  // 30. v2.3: API keys are prefix-only; create/rotate show the secret once
  const keys = await mockRequest("GET", "/api-keys?skip=0&limit=10");
  check("api-keys list exposes prefix only (no full secret)", keys.api_keys.every((k) => k.key.length === 12 && !("_secret" in k) && k.plain_key === null), JSON.stringify(keys.api_keys.map((k) => k.key)));
  const moduleKey = await mockRequest("POST", "/api-keys", {scopes: ["module"], expires_in_days: 30, access_rights: ["create_license"]});
  check("module key created with plain_key shown once", moduleKey.plain_key && moduleKey.plain_key.startsWith("lmp_") && moduleKey.key === moduleKey.plain_key.slice(0, 12), JSON.stringify(moduleKey.key));
  let badExpiryRejected = false;
  try { await mockRequest("POST", "/api-keys", {scopes: ["module"], expires_in_days: 45}); } catch (e) { badExpiryRejected = e.status === 400; }
  check("module key with a non-allowed expiry is rejected", badExpiryRejected);
  const rotated = await mockRequest("POST", `/api-keys/${moduleKey.id}/rotate`, {});
  check("rotation returns a new secret once", rotated.plain_key && rotated.plain_key !== moduleKey.plain_key && rotated.key === rotated.plain_key.slice(0, 12), JSON.stringify(rotated.key));
  await mockRequest("DELETE", `/api-keys/${moduleKey.id}`);

  // 31. v2.3: billing-cycle sync on create + renew; unknown cycle 422
  const syncLic = await mockRequest("POST", "/licenses", {product_id: 2, billing_cycle: "biennial", owner_email: "sync@example.com"});
  check("license created with a synced cycle follows it", syncLic && syncLic.billing_cycle === "biennial" && syncLic.expires_at !== null, JSON.stringify(syncLic && syncLic.billing_cycle));
  const syncedProduct = (await mockRequest("GET", "/products?slug=crm-suite"))[0];
  check("product gains the synced cycle", syncedProduct.billing_cycles.includes("biennial"), JSON.stringify(syncedProduct.billing_cycles));
  let unknownCycleRejected = false;
  try { await mockRequest("POST", "/licenses", {product_id: 2, billing_cycle: "triennial"}); } catch (e) { unknownCycleRejected = e.status === 422; }
  check("unknown billing cycle is rejected with 422", unknownCycleRejected);
  const renewed = await mockRequest("POST", `/licenses/${syncLic.id}/renew?billing_cycle=quarterly`, {});
  check("renew with a new cycle follows it and syncs the product", renewed.billing_cycle === "quarterly", JSON.stringify(renewed.billing_cycle));
  const syncedProduct2 = (await mockRequest("GET", "/products?slug=crm-suite"))[0];
  check("product gains the renewed cycle too", syncedProduct2.billing_cycles.includes("quarterly"), JSON.stringify(syncedProduct2.billing_cycles));

  // 32. v2.3: per-user preferences + dashboard extras
  const prefsSaved = await mockRequest("PUT", "/users/me/preferences", {key: "theme", value: {preset: "ocean"}});
  check("preferences saved", prefsSaved.preferences && prefsSaved.preferences.theme && prefsSaved.preferences.theme.preset === "ocean", JSON.stringify(prefsSaved.preferences));
  const prefsRead = await mockRequest("GET", "/users/me/preferences");
  check("preferences round-trip", prefsRead.preferences && prefsRead.preferences.theme.preset === "ocean", JSON.stringify(prefsRead.preferences));
  const actTrend = await mockRequest("GET", "/dashboard/activations-trend?days=14");
  check("activations trend returns 14 points", actTrend.points && actTrend.points.length === 14, JSON.stringify(actTrend.points && actTrend.points.length));
  const whStats = await mockRequest("GET", "/dashboard/webhook-stats");
  // Seeded with 2 deliveries; license creates in earlier checks append
  // more, so assert the running total and the 100% success rate.
  check("webhook stats track all deliveries with 100% success", whStats.total >= 2 && whStats.success === whStats.total && whStats.success_rate === 100 && whStats.by_event["license.created"].total >= 1, JSON.stringify(whStats));

  // 33. v3.0.6: panel news — the mock mirrors the repo-root news.json.
  const news = await mockRequest("GET", "/news");
  check("news returns the 4 seeded items", Array.isArray(news.items) && news.items.length === 4, JSON.stringify(news.items && news.items.length));
  check("news first item is the v3.0.6 release note, both languages", news.items[0].id === "v306-release" && news.items[0].title.en.includes("3.0.6") && news.items[0].title.fa.length > 0 && news.items[0].body.en.length > 0 && news.items[0].body.fa.length > 0, JSON.stringify(news.items[0] && news.items[0].id));

  console.log(`\n${passed} passed, ${failed} failed.`);
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  console.error("check-demo crashed:", err);
  process.exit(1);
});
