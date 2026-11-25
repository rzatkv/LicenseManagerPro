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
  console.log("Demo mock checks (v2.1 flows):");
  resetDemoData();

  // 1. Seed versions bumped to 2.1.1
  const settings = await mockRequest("GET", "/settings");
  check("seed app_version is 2.1.1", settings.app_version === "2.1.1", JSON.stringify(settings.app_version));
  check("seed latest_version is 2.1.1", settings.latest_version === "2.1.1", JSON.stringify(settings.latest_version));

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

  // 9. Audit logs seeded with the full contract shape
  const a1 = await mockRequest("GET", "/audit-logs?skip=0&limit=10");
  const row = a1.items && a1.items[0];
  const shapeOk = row && ["id", "actor_email", "action", "entity", "entity_id", "details", "created_at"].every((f) => f in row);
  check("audit logs seeded (5 rows) with contract fields", a1.items && a1.items.length === 5 && a1.total === 5 && shapeOk, JSON.stringify(a1 && a1.total));
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

  // 13. Mutation appends license.create
  const createdLicense = await mockRequest("POST", "/licenses", {product_id: 1, billing_cycle: "annual", owner_email: "audit@example.com"});
  const afterLic = await mockRequest("GET", "/audit-logs?skip=0&limit=1");
  check("license create appends audit row", afterLic.items[0].action === "license.create" && afterLic.items[0].entity_id === createdLicense.id, JSON.stringify(afterLic.items && afterLic.items[0]));

  // 14. Mutation appends license.delete
  await mockRequest("DELETE", `/licenses/${createdLicense.id}`);
  const afterDel = await mockRequest("GET", "/audit-logs?skip=0&limit=1");
  check("license delete appends audit row", afterDel.items[0].action === "license.delete" && afterDel.items[0].entity_id === createdLicense.id, JSON.stringify(afterDel.items && afterDel.items[0]));

  // 15. Mutation appends setting.update
  await mockRequest("PUT", "/settings/daily_request_limit", {value: "200"});
  const afterSet = await mockRequest("GET", "/audit-logs?skip=0&limit=1");
  check("settings change appends audit row", afterSet.items[0].action === "setting.update" && afterSet.items[0].entity === "setting", JSON.stringify(afterSet.items && afterSet.items[0]));

  // 16. User create + role_change + delete append audit rows
  const createdUser = await mockRequest("POST", "/users", {email: "audituser@example.com", password: "password123", role: "viewer"});
  const afterUser = await mockRequest("GET", "/audit-logs?skip=0&limit=1");
  check("user create appends audit row", afterUser.items[0].action === "user.create" && afterUser.items[0].entity_id === createdUser.id, JSON.stringify(afterUser.items && afterUser.items[0]));
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

  console.log(`\n${passed} passed, ${failed} failed.`);
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  console.error("check-demo crashed:", err);
  process.exit(1);
});
