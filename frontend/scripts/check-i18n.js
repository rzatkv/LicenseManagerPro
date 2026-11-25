#!/usr/bin/env node
/**
 * i18n parity check — plain node, no dependencies.
 * Loads frontend/src/i18n/translations.js and fails (non-zero exit,
 * listing the missing keys) if any key is missing in en or fa, or if a
 * key's section prefix is not listed in SECTIONS.
 *
 * Usage: node scripts/check-i18n.js   (or: npm run check-i18n)
 */
const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "..", "src", "i18n", "translations.js");
let src = fs.readFileSync(file, "utf8");

// translations.js is an ES module ("export const ..."). Evaluate the
// declarations as plain consts and return the dictionaries.
src = src.replace(/^export const /gm, "const ");
const load = new Function(`${src}\nreturn {en, fa, SECTIONS};`);
const {en, fa, SECTIONS} = load();

let failures = 0;
const missingInFa = Object.keys(en).filter((k) => fa[k] === undefined);
const missingInEn = Object.keys(fa).filter((k) => en[k] === undefined);

if (missingInFa.length) {
  failures += missingInFa.length;
  console.error(`Missing in fa (${missingInFa.length}):`);
  missingInFa.forEach((k) => console.error(`  - ${k}`));
}
if (missingInEn.length) {
  failures += missingInEn.length;
  console.error(`Missing in en (${missingInEn.length}):`);
  missingInEn.forEach((k) => console.error(`  - ${k}`));
}

// Every key's section prefix must be listed in SECTIONS (used by the
// Languages page section filter).
const uncovered = new Set();
for (const k of [...Object.keys(en), ...Object.keys(fa)]) {
  const prefix = k.split(".")[0];
  if (!SECTIONS.includes(prefix)) uncovered.add(prefix);
}
if (uncovered.size) {
  failures += uncovered.size;
  console.error(`Sections missing from SECTIONS (${uncovered.size}):`);
  uncovered.forEach((s) => console.error(`  - ${s}`));
}

console.log(`en keys: ${Object.keys(en).length}, fa keys: ${Object.keys(fa).length}`);
if (failures) {
  console.error(`i18n parity check FAILED (${failures} problem(s)).`);
  process.exit(1);
}
console.log("i18n parity check OK: every key exists in en and fa.");
