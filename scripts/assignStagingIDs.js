"use strict";

/**
 * ASSIGN STAGING CAR IDs
 * ======================
 * Gives every carfile in `src/0 Carfiles to Add/` a real carID up front,
 * instead of leaving the `"c0"` placeholder until release day.
 *
 * WHY: staged cars are referenced by the bot long before they ship — the
 * artwork queue (`cd-sub missing` / `cd-submit art`) needs a stable handle for
 * each one, and 266 files all called "c0" can't provide that. Assigning early
 * also means release is just a file move: the ID is already correct.
 *
 * OCCUPANCY — the important bit:
 *   Free numbers are computed from BOTH `src/cars/` AND the IDs already
 *   assigned to staged files. Without the second half, a car sitting in
 *   staging for a month would have its reserved ID handed out again the next
 *   time this (or findSkippedCarIDs) runs, silently creating a duplicate.
 *
 * The carID is written with a targeted string replace rather than by
 * re-serialising, so formatting, key order and comments survive byte-for-byte.
 * Filenames are left alone — staged files stay human-readable, and
 * renameNewCarfiles.js renames them to match at release.
 *
 * GAPS: by default this fills holes in the live numbering before going past
 * the highest ID, matching renameNewCarfiles.js. That reuses the IDs of cars
 * that were deleted — safe as far as the data files go (nothing in src/ points
 * at them), but a player who still OWNS a deleted car would silently end up
 * owning whatever takes its number. Pass --no-gaps to only allocate fresh
 * numbers above the highest and sidestep the question entirely.
 *
 * Usage:
 *   node scripts/assignStagingIDs.js             preview only (default)
 *   node scripts/assignStagingIDs.js --apply     actually write
 *   node scripts/assignStagingIDs.js --no-gaps   never reuse a deleted car's ID
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const CARS_DIR = path.join(ROOT, "src", "cars");
const STAGING_DIR = path.join(ROOT, "src", "0 Carfiles to Add");
const APPLY = process.argv.includes("--apply");
const NO_GAPS = process.argv.includes("--no-gaps");

const PLACEHOLDER = /^c0*$/;               // "c0", "c00", "" all count as unset
const VALID_ID = /^c\d{5}$/;

function walk(directory, files = []) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) walk(full, files);
        else if (entry.name.endsWith(".json")) files.push(full);
    }
    return files;
}

// ── 1. What's already taken ─────────────────────────────────────────────────

const used = new Set();
let highest = 0;

for (const file of fs.readdirSync(CARS_DIR)) {
    const match = file.match(/^c(\d{5})\.json$/);
    if (!match) continue;
    const num = parseInt(match[1], 10);
    used.add(num);
    if (num > highest) highest = num;
}
const liveCount = used.size;

if (!fs.existsSync(STAGING_DIR)) {
    console.error(`❌ Staging folder not found: ${STAGING_DIR}`);
    process.exit(1);
}
const stagedFiles = walk(STAGING_DIR);

// Staged files that ALREADY hold a real ID are occupied too.
const needsID = [];
let alreadyAssigned = 0;
let unreadable = 0;

for (const file of stagedFiles) {
    let raw, data;
    try {
        raw = fs.readFileSync(file, "utf8");
        data = JSON.parse(raw);
    }
    catch (error) {
        console.log(`⚠️  ${path.relative(ROOT, file)} — unreadable, skipped (${error.message.slice(0, 60)})`);
        unreadable++;
        continue;
    }

    const current = String(data.carID || "");
    if (VALID_ID.test(current)) {
        const num = parseInt(current.slice(1), 10);
        if (used.has(num)) {
            console.log(`❗ ${path.relative(ROOT, file)} — carID ${current} is ALREADY IN USE elsewhere. Fix by hand.`);
        }
        used.add(num);
        if (num > highest) highest = num;
        alreadyAssigned++;
        continue;
    }
    if (current !== "" && !PLACEHOLDER.test(current)) {
        console.log(`⚠️  ${path.relative(ROOT, file)} — odd carID ${JSON.stringify(current)}, skipped.`);
        continue;
    }
    needsID.push({ file, raw, current: current || "(missing)" });
}

console.log(`\n📂 ${liveCount} live car(s) in src/cars/  ·  highest c${String(highest).padStart(5, "0")}`);
console.log(`📦 ${stagedFiles.length} staged file(s)`);
console.log(`   already have an ID: ${alreadyAssigned}`);
console.log(`   need one:           ${needsID.length}`);
if (unreadable > 0) console.log(`   unreadable:         ${unreadable}  ← run cleanCarfiles.js first`);

if (needsID.length === 0) {
    console.log("\n✅ Nothing to assign.");
    process.exit(0);
}

// ── 2. Free numbers: gaps first, then past the highest ──────────────────────

function* freeNumbers() {
    if (!NO_GAPS) {
        for (let i = 1; i <= highest; i++) if (!used.has(i)) yield i;
    }
    let n = highest + 1;
    for (;;) { if (!used.has(n)) yield n; n++; }
}

const gapCount = (() => {
    let n = 0;
    for (let i = 1; i <= highest; i++) if (!used.has(i)) n++;
    return n;
})();
if (gapCount > 0) {
    console.log(NO_GAPS
        ? `\n🕳️  ${gapCount} gap(s) in the numbering — SKIPPED (--no-gaps).`
        : `\n🕳️  ${gapCount} gap(s) in the numbering will be filled first. `
            + `Use --no-gaps if any deleted car might still sit in a player's garage.`);
}
const stream = freeNumbers();
const nextFree = () => {
    const { value } = stream.next();
    used.add(value);                 // reserve immediately
    return value;
};

// ── 3. Plan ─────────────────────────────────────────────────────────────────

// Sorted so a run is reproducible and IDs land in a sensible order rather than
// whatever order the filesystem happened to return.
needsID.sort((a, b) => a.file.localeCompare(b.file));

const plan = [];
for (const entry of needsID) {
    const newID = `c${String(nextFree()).padStart(5, "0")}`;

    // Surgical replace of the carID VALUE only — keeps the rest of the file
    // byte-identical, so this never reformats anyone's hand-written carfile.
    const replaced = entry.raw.replace(
        /("carID"\s*:\s*")[^"]*(")/,
        (whole, before, after) => `${before}${newID}${after}`
    );
    if (replaced === entry.raw) {
        console.log(`❌ ${path.relative(ROOT, entry.file)} — couldn't locate the carID field, skipped.`);
        continue;
    }
    // Paranoia: the edit must still parse, and must have taken.
    try {
        if (JSON.parse(replaced).carID !== newID) throw new Error("carID did not change");
    }
    catch (error) {
        console.log(`❌ ${path.relative(ROOT, entry.file)} — edit produced invalid JSON, skipped. (${error.message})`);
        continue;
    }
    plan.push({ file: entry.file, newID, content: replaced, was: entry.current });
}

console.log(`\n${APPLY ? "✍️  Assigning" : "🔍 Would assign"} ${plan.length} ID(s):\n`);
for (const item of plan.slice(0, 20)) {
    console.log(`   ${item.newID}  ${path.relative(STAGING_DIR, item.file)}`);
}
if (plan.length > 20) console.log(`   … and ${plan.length - 20} more`);

// ── 4. Write ────────────────────────────────────────────────────────────────

if (!APPLY) {
    console.log("\n🔍 Dry run — nothing written. Re-run with --apply to commit these.");
    process.exit(0);
}

let written = 0;
for (const item of plan) {
    try {
        fs.writeFileSync(item.file, item.content);
        written++;
    }
    catch (error) {
        console.log(`❌ ${path.relative(ROOT, item.file)} — write failed: ${error.message}`);
    }
}
console.log(`\n🏁 Done! ${written} file(s) updated.`);
