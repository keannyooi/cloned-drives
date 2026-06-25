"use strict";

/**
 * BACKFILL hiddenTag — surgical one-off for src/cars
 * ==================================================
 * Inserts the house-default `"hiddenTag": [""],` on its own line, immediately
 * before the `cardType` line, for any car JSON that lacks hiddenTag. Minimal
 * 1-line diff: preserves each file's indentation, line-ending style, and
 * trailing-newline convention (same discipline as migrateCardTypes.js). Every
 * result is re-parsed and structurally compared — exactly one key added,
 * nothing else changed — before anything is written.
 *
 *   node addHiddenTag.js            → dry run (report only)
 *   node addHiddenTag.js --write    → insert it
 */

const fs = require("fs");
const path = require("path");

const WRITE = process.argv.includes("--write");
const CARS_DIR = path.join(__dirname, "..", "src", "cars");
const files = fs.readdirSync(CARS_DIR).filter(f => f.endsWith(".json"));

const errors = [];
let added = 0, skipped = 0;
let sample = null;

for (const file of files) {
    const full = path.join(CARS_DIR, file);
    const raw = fs.readFileSync(full, "utf8");

    let car;
    try { car = JSON.parse(raw); } catch (e) { errors.push(`${file}: unparseable JSON — ${e.message}`); continue; }

    if (car.hiddenTag !== undefined) { skipped++; continue; }
    if (car.cardType === undefined) { errors.push(`${file}: no cardType line to anchor before — skipping`); continue; }

    const m = raw.match(/^([ \t]*)"cardType"/m);
    if (!m) { errors.push(`${file}: cardType key not found on its own line`); continue; }
    const eol = raw.includes("\r\n") ? "\r\n" : "\n";

    const newRaw = raw.replace(/^([ \t]*)"cardType"/m, (full_, ind) => `${ind}"hiddenTag": [""],${eol}${ind}"cardType"`);

    // ── Validate: reparse, confirm exactly one key added and nothing else moved ──
    let reparsed;
    try { reparsed = JSON.parse(newRaw); } catch (e) { errors.push(`${file}: insertion produced invalid JSON — ${e.message}`); continue; }
    if (JSON.stringify(reparsed.hiddenTag) !== JSON.stringify([""])) { errors.push(`${file}: hiddenTag did not survive reparse`); continue; }
    const without = { ...reparsed };
    delete without.hiddenTag;
    if (JSON.stringify(without) !== JSON.stringify(car)) { errors.push(`${file}: insertion altered other keys — refusing`); continue; }

    added++;
    if (!sample) sample = newRaw.split(/\r?\n/).slice(-4).join("\n");
    if (WRITE) fs.writeFileSync(full, newRaw);
}

console.log(`\n${WRITE ? "WROTE" : "DRY RUN"} — ${files.length} car files scanned`);
console.log(`  ${WRITE ? "added" : "would add"} hiddenTag: ${added}`);
console.log(`  already had it: ${skipped}`);
if (sample) console.log(`\n  sample tail after insertion:\n${sample.split("\n").map(l => "  │ " + l).join("\n")}`);
if (errors.length) {
    console.log(`\n  ⛔ ${errors.length} ERRORS — ${WRITE ? "these were NOT written" : "fix before --write"}:`);
    errors.slice(0, 20).forEach(e => console.log(`     ${e}`));
    process.exitCode = 1;
} else {
    console.log(`\n  ✅ no errors${WRITE ? "" : " — safe to run with --write"}`);
}
